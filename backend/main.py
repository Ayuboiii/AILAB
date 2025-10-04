import uuid
import time
import random
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Optional

app = FastAPI()

# Add CORS middleware to allow React frontend to make requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory database to store experiment data
experiments_db: Dict[str, Dict] = {}

class ExperimentResponse(BaseModel):
    experiment_id: str

class ExperimentStatus(BaseModel):
    experiment_id: str
    status: str
    result: Optional[Dict] = None

def run_mock_simulation(experiment_id: str):
    """
    Mock simulation function that runs in the background.
    Simulates a long-running scientific experiment.
    """
    # Random sleep duration between 5 to 10 seconds
    sleep_duration = random.uniform(5, 10)
    time.sleep(sleep_duration)
    
    # Generate a mock result
    mock_result = {
        "accuracy": round(random.uniform(0.85, 0.98), 3),
        "precision": round(random.uniform(0.80, 0.95), 3),
        "recall": round(random.uniform(0.82, 0.96), 3),
        "duration_seconds": round(sleep_duration, 2)
    }
    
    # Update the experiment status in our "database"
    experiments_db[experiment_id]["status"] = "Completed"
    experiments_db[experiment_id]["result"] = mock_result

@app.post("/experiments", response_model=ExperimentResponse)
async def start_experiment(background_tasks: BackgroundTasks):
    """
    Start a new experiment. This endpoint does not block.
    Returns immediately with an experiment ID while the simulation runs in the background.
    """
    # Generate a unique experiment ID
    experiment_id = str(uuid.uuid4())
    
    # Initialize experiment record in our database
    experiments_db[experiment_id] = {
        "experiment_id": experiment_id,
        "status": "Running",
        "result": None
    }
    
    # Add the mock simulation to background tasks
    background_tasks.add_task(run_mock_simulation, experiment_id)
    
    return ExperimentResponse(experiment_id=experiment_id)

@app.get("/experiments/{experiment_id}", response_model=ExperimentStatus)
async def get_experiment_status(experiment_id: str):
    """
    Get the status and result of a specific experiment.
    """
    if experiment_id not in experiments_db:
        raise HTTPException(status_code=404, detail="Experiment not found")
    
    experiment = experiments_db[experiment_id]
    return ExperimentStatus(
        experiment_id=experiment_id,
        status=experiment["status"],
        result=experiment["result"]
    )

@app.get("/experiments")
async def get_all_experiments():
    """
    Get all experiments (optional endpoint for debugging/admin purposes).
    """
    return {"experiments": list(experiments_db.values())}

@app.get("/")
async def root():
    return {"message": "AgentLab API is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)