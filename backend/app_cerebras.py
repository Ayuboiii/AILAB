"""
AgentLab Cerebras Microservice - Minimal FastAPI app exposing /invoke
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
from tasks import run_cerebras_code_analysis, run_task_background

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AgentLab Cerebras Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class InvokeRequest(BaseModel):
    code: str

@app.on_event("startup")
async def startup_event():
    create_tables()
    logger.info("Cerebras service started successfully")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "cerebras-service"}

@app.post("/invoke")
async def invoke(request: InvokeRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    try:
        if not request.code.strip():
            raise HTTPException(status_code=400, detail="'code' is required")

        experiment = Experiment(model_used="Cerebras-Coder", input_payload={"code": request.code})
        db.add(experiment)
        db.commit()
        db.refresh(experiment)

        # Run the async task in background
        background_tasks.add_task(
            run_task_background,
            run_cerebras_code_analysis,
            experiment.id,
            request.code,
        )

        return {"experiment_id": experiment.id, "status": experiment.status}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error handling /invoke in cerebras service")
        raise HTTPException(status_code=500, detail=str(e))
