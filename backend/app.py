"""
AgentLab FastAPI Main Application
"""

import asyncio
from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from pydantic import BaseModel
import socketio
import uvicorn
import logging

# Local imports
from database import get_db, create_tables
from models import Experiment
from tasks import run_cerebras_code_analysis, run_llama_chat, set_socket_manager, run_task_background

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="AgentLab",
    description="AI Experiment Platform with Cerebras and Llama models",
    version="1.0.0"
)

# Create Socket.IO server
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=True,
    engineio_logger=True
)

# Create Socket.IO ASGI app
socket_app = socketio.ASGIApp(sio, app)

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for request/response
class CodeAnalysisRequest(BaseModel):
    code: str

class ChatRequest(BaseModel):
    prompt: str

class ExperimentResponse(BaseModel):
    id: int
    model_used: str
    status: str
    input_payload: Dict[str, Any]
    result: str = None
    created_at: str = None

# Initialize database and socket manager
@app.on_event("startup")
async def startup_event():
    """Initialize database and socket manager on startup"""
    create_tables()
    set_socket_manager(sio)
    logger.info("AgentLab backend started successfully")

# Socket.IO event handlers
@sio.event
async def connect(sid, environ):
    """Handle client connection"""
    logger.info(f"Client {sid} connected")
    await sio.emit("connected", {"message": "Connected to AgentLab"}, room=sid)

@sio.event
async def disconnect(sid):
    """Handle client disconnection"""
    logger.info(f"Client {sid} disconnected")

# API Endpoints

@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "AgentLab API is running", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "AgentLab Backend"}

@app.post("/experiments/code-analysis")
async def create_code_analysis_experiment(
    request: CodeAnalysisRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Create and run a code analysis experiment using Cerebras model
    """
    try:
        # Create experiment record
        experiment = Experiment(
            model_used="Cerebras-Coder",
            input_payload={"code": request.code}
        )
        
        db.add(experiment)
        db.commit()
        db.refresh(experiment)
        
        # Add background task
        background_tasks.add_task(
            run_task_background,
            run_cerebras_code_analysis,
            experiment.id,
            request.code
        )
        
        logger.info(f"Created code analysis experiment {experiment.id}")
        
        return {
            "message": "Code analysis experiment created successfully",
            "experiment_id": experiment.id,
            "status": experiment.status
        }
        
    except Exception as e:
        logger.error(f"Error creating code analysis experiment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating experiment: {str(e)}")

@app.post("/experiments/chat")
async def create_chat_experiment(
    request: ChatRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Create and run a chat experiment using Llama model
    """
    try:
        # Create experiment record
        experiment = Experiment(
            model_used="Llama-Chat",
            input_payload={"prompt": request.prompt}
        )
        
        db.add(experiment)
        db.commit()
        db.refresh(experiment)
        
        # Add background task
        background_tasks.add_task(
            run_task_background,
            run_llama_chat,
            experiment.id,
            request.prompt
        )
        
        logger.info(f"Created chat experiment {experiment.id}")
        
        return {
            "message": "Chat experiment created successfully",
            "experiment_id": experiment.id,
            "status": experiment.status
        }
        
    except Exception as e:
        logger.error(f"Error creating chat experiment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating experiment: {str(e)}")

@app.get("/experiments")
async def get_experiments(db: Session = Depends(get_db)):
    """
    Get all experiments from the database
    """
    try:
        experiments = db.query(Experiment).order_by(Experiment.created_at.desc()).all()
        return {
            "experiments": [exp.to_dict() for exp in experiments],
            "count": len(experiments)
        }
    except Exception as e:
        logger.error(f"Error fetching experiments: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching experiments: {str(e)}")

@app.get("/experiments/{experiment_id}")
async def get_experiment(experiment_id: int, db: Session = Depends(get_db)):
    """
    Get a specific experiment by ID
    """
    try:
        experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
        if not experiment:
            raise HTTPException(status_code=404, detail="Experiment not found")
        
        return experiment.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching experiment {experiment_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching experiment: {str(e)}")

# Custom exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler"""
    logger.error(f"Global exception: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": str(exc)}
    )

if __name__ == "__main__":
    uvicorn.run(
        "app:socket_app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )