"""
Bandit models for AgentLab (SQLAlchemy models separate from legacy Experiment).
Keeps JSON-like fields as Text (JSON-encoded) for SQLite compatibility.
"""
from sqlalchemy import Column, Integer, String, ForeignKey, Float, DateTime, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from typing import Any, Dict, Optional
import json

from database import Base

class BanditExperiment(Base):
    __tablename__ = "bandit_experiments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    arms = relationship("Arm", back_populates="experiment", cascade="all, delete-orphan")

class Arm(Base):
    __tablename__ = "bandit_arms"

    id = Column(Integer, primary_key=True, index=True)
    experiment_id = Column(Integer, ForeignKey("bandit_experiments.id", ondelete="CASCADE"))
    label = Column(String(100), nullable=True)

    # Priors for Thompson (Beta) if treating rewards as Bernoulli
    prior_alpha = Column(Float, nullable=False, default=1.0)
    prior_beta = Column(Float, nullable=False, default=1.0)

    experiment = relationship("BanditExperiment", back_populates="arms")

class Event(Base):
    __tablename__ = "bandit_events"

    id = Column(Integer, primary_key=True, index=True)
    experiment_id = Column(Integer, ForeignKey("bandit_experiments.id", ondelete="CASCADE"))
    arm_id = Column(Integer, ForeignKey("bandit_arms.id", ondelete="SET NULL"), nullable=True)
    type = Column(String(20), nullable=False)  # 'pick' or 'reward'
    reward = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Explanation(Base):
    __tablename__ = "bandit_explanations"

    id = Column(Integer, primary_key=True, index=True)
    experiment_id = Column(Integer, ForeignKey("bandit_experiments.id", ondelete="CASCADE"))
    arm_id = Column(Integer, ForeignKey("bandit_arms.id", ondelete="SET NULL"), nullable=True)
    policy = Column(String(50), nullable=False)
    rationale = Column(Text, nullable=False)
    tokens = Column(Text, nullable=True)  # JSON-encoded usage
    latency_ms = Column(Integer, nullable=True)
    model = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def set_tokens(self, usage: Dict[str, Any]):
        self.tokens = json.dumps(usage)

    def get_tokens(self) -> Dict[str, Any]:
        try:
            return json.loads(self.tokens) if self.tokens else {}
        except Exception:
            return {}
