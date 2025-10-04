from fastapi import FastAPI, BackgroundTasks, HTTPException
import time
import random
import uuid

# --- In-memory "database" to store our experiments ---
# In a real app, this would be a proper database.
db = {}

# Create an instance of the FastAPI class
app = FastAPI()

# --- A mock function to simulate a long AI task ---
def run_simulation(experiment_id: str):
    """
    Simulates running a complex AI model.
    It waits for a random time and then updates the result.
    """
    print(f"Starting simulation for experiment: {experiment_id}")
    time.sleep(random.randint(5, 10)) # Simulate work for 5-10 seconds
    
    # Mock result
    final_result = {"accuracy": round(random.uniform(0.85, 0.99), 4)}
    
    # Update the "database" with the final result and status
    db[experiment_id]["status"] = "Completed"
    db[experiment_id]["result"] = final_result
    print(f"Finished simulation for experiment: {experiment_id}")


# --- API Endpoints ---

@app.get("/")
def read_root():
    return {"message": "Welcome to the AgentLab API"}

@app.post("/experiments")
def create_experiment(background_tasks: BackgroundTasks):
    """
    This endpoint starts a new experiment.
    It runs the actual simulation in the background.
    """
    # Create a unique ID for the new experiment
    experiment_id = str(uuid.uuid4())
    
    # Store the initial experiment state in our "database"
    db[experiment_id] = {"status": "Running", "result": None}
    
    # Add the long-running simulation to background tasks
    # This lets the API respond immediately without waiting.
    background_tasks.add_task(run_simulation, experiment_id)
    
    return {"message": "Experiment started", "experiment_id": experiment_id}


@app.get("/experiments/{experiment_id}")
def get_experiment_status(experiment_id: str):
    """
    This endpoint checks the status and result of a specific experiment.
    """
    if experiment_id not in db:
        raise HTTPException(status_code=404, detail="Experiment not found")
    
    return db[experiment_id]