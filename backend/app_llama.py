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
import json

from database import get_db, create_tables
from models import Experiment
from tasks import run_llama_chat, run_task_background
# Import bandit models and cerebras client wrapper to ensure table creation and features are available
from models_bandits import BanditExperiment, Arm, Event, Explanation
from llm.cerebras_client import explain_choice

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

# -----------------------------
# Bandit & Explanation Schemas
# -----------------------------
from pydantic import Field
from typing import List, Optional, Dict, Any

class CreateBanditRequest(BaseModel):
    name: Optional[str] = None
    arms: Optional[List[str]] = Field(default=None, description="Optional labels for arms")
    num_arms: Optional[int] = Field(default=None, description="If arms not provided, create N unlabeled arms")

class PickRequest(BaseModel):
    experiment_id: int
    policy: str  # 'epsilon_greedy' | 'ucb' | 'thompson'
    epsilon: Optional[float] = 0.1
    context: Optional[Dict[str, Any]] = None

class LogRequest(BaseModel):
    experiment_id: int
    arm_id: int
    reward: float

class MetricsResponse(BaseModel):
    experiment_id: int
    arm_stats: Dict[int, Dict[str, Any]]

class SimRequest(BaseModel):
    steps: int = 10
    lr: float = 0.1
    x0: float = 0.0

@app.on_event("startup")
async def startup_event():
    create_tables()
    logger.info("Llama service started successfully")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "llama-service"}

# Mock bandit stats for dashboard charts
@app.get("/bandit-stats")
async def bandit_stats():
    return {
        "arm_wins": [
            {"name": "Cerebras-Coder", "wins": 21},
            {"name": "Llama-Chat", "wins": 15}
        ],
        "avg_reward": [
            {"name": "Cerebras-Coder", "reward": 0.91},
            {"name": "Llama-Chat", "reward": 0.84}
        ]
    }

# -----------------------------
# Bandit helpers (in-file, small)
# -----------------------------
from sqlalchemy.orm import Session as ORMSession
import math, random

def _get_events(db: ORMSession, experiment_id: int):
    return db.query(Event).filter(Event.experiment_id == experiment_id).order_by(Event.created_at.asc()).all()

def _get_arm_stats(db: ORMSession, experiment_id: int):
    arms = db.query(Arm).filter(Arm.experiment_id == experiment_id).all()
    events = _get_events(db, experiment_id)
    stats = {a.id: {"picks": 0, "rewards": 0.0, "count_rewards": 0, "label": a.label} for a in arms}
    for ev in events:
        if ev.type == "pick" and ev.arm_id:
            stats[ev.arm_id]["picks"] += 1
        if ev.type == "reward" and ev.arm_id is not None and ev.reward is not None:
            stats[ev.arm_id]["rewards"] += ev.reward
            stats[ev.arm_id]["count_rewards"] += 1
    for aid, s in stats.items():
        s["avg_reward"] = (s["rewards"] / s["count_rewards"]) if s["count_rewards"] > 0 else 0.0
    return stats

def _epsilon_greedy(stats: Dict[int, Dict[str, any]], epsilon: float) -> int:
    if random.random() < epsilon:
        return random.choice(list(stats.keys()))
    # exploit: pick arm with highest avg_reward
    return max(stats.keys(), key=lambda k: stats[k]["avg_reward"])

def _ucb(stats: Dict[int, Dict[str, any]]) -> int:
    total_picks = sum(s["picks"] for s in stats.values())
    if total_picks == 0:
        return random.choice(list(stats.keys()))
    def ucb_score(s):
        picks = max(1, s["picks"])  # avoid div by zero
        return s["avg_reward"] + math.sqrt(2 * math.log(total_picks + 1) / picks)
    return max(stats.keys(), key=lambda k: ucb_score(stats[k]))

def _thompson(stats: Dict[int, Dict[str, any]]) -> int:
    # Approximate Thompson using Beta draws if rewards in [0,1]
    # If no reward counts, default to random
    best_k, best_val = None, -1
    for k, s in stats.items():
        # Heuristic priors
        alpha = 1 + s["rewards"]
        beta = 1 + max(0, s["picks"] - s["rewards"])  # assuming reward ~ success count approx
        sample = random.betavariate(max(1e-3, alpha), max(1e-3, beta))
        if sample > best_val:
            best_val = sample
            best_k = k
    return best_k if best_k is not None else random.choice(list(stats.keys()))

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

# -----------------------------
# Bandit Routes
# -----------------------------
@app.post("/bandits/create")
async def bandits_create(req: CreateBanditRequest, db: Session = Depends(get_db)):
    try:
        exp = BanditExperiment(name=req.name)
        db.add(exp)
        db.flush()  # get exp.id before committing to create arms
        labels: list = req.arms or [None] * int(req.num_arms or 0)
        if not labels:
            # default to 2 unlabeled arms
            labels = [None, None]
        for lbl in labels:
            arm = Arm(experiment_id=exp.id, label=lbl)
            db.add(arm)
        db.commit()
        return {"experiment_id": exp.id, "arms": labels}
    except Exception as e:
        db.rollback()
        logger.exception("bandits_create failed")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/bandits/pick")
async def bandits_pick(req: PickRequest, db: Session = Depends(get_db)):
    try:
        stats = _get_arm_stats(db, req.experiment_id)
        if not stats:
            raise HTTPException(status_code=404, detail="Experiment has no arms")
        policy = req.policy.lower()
        if policy == "epsilon_greedy":
            arm_id = _epsilon_greedy(stats, req.epsilon or 0.1)
        elif policy == "ucb":
            arm_id = _ucb(stats)
        elif policy == "thompson":
            arm_id = _thompson(stats)
        else:
            raise HTTPException(status_code=400, detail="Unknown policy")
        # record pick event
        ev = Event(experiment_id=req.experiment_id, arm_id=arm_id, type="pick")
        db.add(ev)
        db.flush()
        # Generate explanation via Cerebras
        context = {
            "experiment_id": req.experiment_id,
            "policy": policy,
            "epsilon": req.epsilon,
            "stats": stats,
            "chosen_arm": arm_id,
            "user_context": req.context or {},
        }
        prompt = (
            "You are assisting a multi-armed bandit demo. Given the policy and stats, explain in 2-4 sentences "
            "why the selected arm is reasonable for a hackathon audience.\n\n" + json.dumps(context)
        )
        try:
            result = explain_choice(prompt)
            expl = Explanation(
                experiment_id=req.experiment_id,
                arm_id=arm_id,
                policy=policy,
                rationale=result.get("text", ""),
                latency_ms=result.get("latency_ms"),
                model=result.get("model"),
            )
            expl.set_tokens(result.get("tokens") or {})
            db.add(expl)
        except Exception as e:
            logger.warning("Cerebras explanation failed: %s", e)
        db.commit()
        return {"experiment_id": req.experiment_id, "arm_id": arm_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.exception("bandits_pick failed")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/bandits/log")
async def bandits_log(req: LogRequest, db: Session = Depends(get_db)):
    try:
        ev = Event(experiment_id=req.experiment_id, arm_id=req.arm_id, type="reward", reward=req.reward)
        db.add(ev)
        db.commit()
        return {"ok": True}
    except Exception as e:
        db.rollback()
        logger.exception("bandits_log failed")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/bandits/metrics")
async def bandits_metrics(experiment_id: int, db: Session = Depends(get_db)):
    try:
        stats = _get_arm_stats(db, experiment_id)
        return {"experiment_id": experiment_id, "arm_stats": stats}
    except Exception as e:
        logger.exception("bandits_metrics failed")
        raise HTTPException(status_code=500, detail=str(e))

# -----------------------------
# Explanations routes
# -----------------------------
@app.get("/explanations/latest")
async def explanations_latest(experiment_id: int, db: Session = Depends(get_db)):
    try:
        expl = (
            db.query(Explanation)
            .filter(Explanation.experiment_id == experiment_id)
            .order_by(Explanation.created_at.desc())
            .first()
        )
        if not expl:
            return {"explanation": None}
        return {
            "explanation": {
                "id": expl.id,
                "experiment_id": expl.experiment_id,
                "arm_id": expl.arm_id,
                "policy": expl.policy,
                "rationale": expl.rationale,
                "latency_ms": expl.latency_ms,
                "model": expl.model,
                "tokens": expl.get_tokens(),
                "created_at": expl.created_at.isoformat() if expl.created_at else None,
            }
        }
    except Exception as e:
        logger.exception("explanations_latest failed")
        raise HTTPException(status_code=500, detail=str(e))

# -----------------------------
# Toy simulation: gradient descent on f(x) = (x-3)^2
# -----------------------------
@app.post("/sim/run")
async def sim_run(req: SimRequest):
    try:
        x = req.x0
        steps = []
        for i in range(max(1, req.steps)):
            grad = 2 * (x - 3.0)
            x = x - req.lr * grad
            steps.append({"step": i + 1, "x": x, "f": (x - 3.0) ** 2})
        return {"steps": steps}
    except Exception as e:
        logger.exception("sim_run failed")
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

@app.get("/experiments/{experiment_id}")
async def get_experiment(experiment_id: int, db: Session = Depends(get_db)):
    """
    Get a single experiment by ID.
    """
    try:
        exp = db.query(Experiment).filter(Experiment.id == experiment_id).first()
        if not exp:
            raise HTTPException(status_code=404, detail="Experiment not found")
        return exp.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching experiment {experiment_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching experiment: {str(e)}")
