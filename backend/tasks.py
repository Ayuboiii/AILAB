"""
AI Tasks for AgentLab - Cerebras and Llama model integrations
"""

import asyncio
import logging
from typing import Optional
from cerebras.cloud.sdk import Cerebras
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Experiment
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Cerebras client
CEREBRAS_API_KEY = os.getenv("CEREBRAS_API_KEY")
if not CEREBRAS_API_KEY:
    logger.warning("CEREBRAS_API_KEY not found in environment variables")

cerebras_client = Cerebras(api_key=CEREBRAS_API_KEY) if CEREBRAS_API_KEY else None

# Global socket manager reference - will be set by main.py
socket_manager = None

def set_socket_manager(sio):
    """Set the socket manager reference"""
    global socket_manager
    socket_manager = sio

async def run_cerebras_code_analysis(experiment_id: int, code: str):
    """
    Run Cerebras Qwen3-480B (Coder) model for code analysis
    
    Args:
        experiment_id: Database ID of the experiment
        code: Python code to analyze
    """
    db: Session = SessionLocal()
    
    try:
        # Get experiment from database
        experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
        if not experiment:
            logger.error(f"Experiment {experiment_id} not found")
            return
        
        # Update status to running
        experiment.status = "running"
        db.commit()
        
        # Emit status update
        if socket_manager:
            await socket_manager.emit("experiment_updated", experiment.to_dict())
        
        if not cerebras_client:
            raise Exception("Cerebras API key not configured")
        
        # Prepare prompt for code analysis
        prompt = f"""Thoroughly explain the following Python code and add detailed comments:

```python
{code}
```

Please provide:
1. A comprehensive explanation of what the code does
2. Line-by-line comments explaining key parts
3. Any potential improvements or issues you notice
4. The code with detailed inline comments added"""

        # Call Cerebras API
        logger.info(f"Starting Cerebras code analysis for experiment {experiment_id}")
        
        chat_completion = cerebras_client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model="llama3.1-8b",  # Using available model, adjust based on actual Cerebras offerings
            max_tokens=2000,
            temperature=0.1,
        )
        
        # Extract result
        result = chat_completion.choices[0].message.content
        
        # Update experiment with result
        experiment.status = "completed"
        experiment.result = result
        db.commit()
        
        logger.info(f"Cerebras code analysis completed for experiment {experiment_id}")
        
    except Exception as e:
        logger.error(f"Error in Cerebras code analysis for experiment {experiment_id}: {str(e)}")
        
        # Update experiment with error
        experiment.status = "failed"
        experiment.result = f"Error: {str(e)}"
        db.commit()
    
    finally:
        # Emit final status update
        if socket_manager:
            await socket_manager.emit("experiment_updated", experiment.to_dict())
        
        db.close()

async def run_llama_chat(experiment_id: int, prompt: str):
    """
    Run Llama-3.1-8B model for chat completion
    
    Args:
        experiment_id: Database ID of the experiment
        prompt: Chat prompt from user
    """
    db: Session = SessionLocal()
    
    try:
        # Get experiment from database
        experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
        if not experiment:
            logger.error(f"Experiment {experiment_id} not found")
            return
        
        # Update status to running
        experiment.status = "running"
        db.commit()
        
        # Emit status update
        if socket_manager:
            await socket_manager.emit("experiment_updated", experiment.to_dict())
        
        if not cerebras_client:
            raise Exception("Cerebras API key not configured")
        
        # Call Cerebras API with Llama model
        logger.info(f"Starting Llama chat completion for experiment {experiment_id}")
        
        chat_completion = cerebras_client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model="llama3.1-8b",
            max_tokens=1000,
            temperature=0.7,
        )
        
        # Extract result
        result = chat_completion.choices[0].message.content
        
        # Update experiment with result
        experiment.status = "completed"
        experiment.result = result
        db.commit()
        
        logger.info(f"Llama chat completion completed for experiment {experiment_id}")
        
    except Exception as e:
        logger.error(f"Error in Llama chat for experiment {experiment_id}: {str(e)}")
        
        # Update experiment with error
        experiment.status = "failed"
        experiment.result = f"Error: {str(e)}"
        db.commit()
    
    finally:
        # Emit final status update
        if socket_manager:
            await socket_manager.emit("experiment_updated", experiment.to_dict())
        
        db.close()

async def run_task_background(task_func, *args):
    """Helper function to run tasks in background"""
    try:
        await task_func(*args)
    except Exception as e:
        logger.error(f"Background task error: {str(e)}")