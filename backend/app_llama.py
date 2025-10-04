"""
AgentLab Llama Microservice - Minimal FastAPI app exposing /invoke
"""
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, BackgroundTasks, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
import logging

from database import get_db, create_tables
from models import Experiment
from tasks import run_llama_chat, run_task_background

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AgentLab Llama Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class InvokeRequest(BaseModel):
    prompt: str

@app.on_event("startup")
async def startup_event():
    create_tables()
    logger.info("Llama service started successfully")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "llama-service"}

@app.post("/invoke")
async def invoke(request: InvokeRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    try:
        if not request.prompt.strip():
            raise HTTPException(status_code=400, detail="'prompt' is required")

        experiment = Experiment(model_used="Llama-Chat", input_payload={"prompt": request.prompt})
        db.add(experiment)
        db.commit()
        db.refresh(experiment)

        # Run the async task in background
        background_tasks.add_task(
            run_task_background,
            run_llama_chat,
            experiment.id,
            request.prompt,
        )

        return {"experiment_id": experiment.id, "status": experiment.status}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error handling /invoke in llama service")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/experiments")
async def get_experiments(db: Session = Depends(get_db)):
    """
    Get all experiments from the database.
    This acts as the aggregator for the system.
    """
    try:
        experiments = db.query(Experiment).order_by(Experiment.created_at.desc()).all()
        return {
            "experiments": [exp.to_dict() for exp in experiments]
        }
    except Exception as e:
        logger.error(f"Error fetching experiments: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching experiments: {str(e)}")
