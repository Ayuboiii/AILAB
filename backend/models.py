"""
SQLAlchemy models for AgentLab
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from sqlalchemy.sql import func
from database import Base
import json
from datetime import datetime
from typing import Optional, Dict, Any

class Experiment(Base):
    __tablename__ = "experiments"
    
    id = Column(Integer, primary_key=True, index=True)
    model_used = Column(String(100), nullable=False)  # "Cerebras-Coder" or "Llama-Chat"
    status = Column(String(50), nullable=False, default="pending")  # "pending", "running", "completed", "failed"
    input_payload = Column(Text, nullable=False)  # JSON string
    result = Column(Text, nullable=True)  # AI model result
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    def __init__(self, model_used: str, input_payload: Dict[Any, Any], status: str = "pending"):
        self.model_used = model_used
        self.input_payload = json.dumps(input_payload)
        self.status = status
    
    def get_input_payload(self) -> Dict[Any, Any]:
        """Parse and return input payload as dictionary"""
        try:
            return json.loads(self.input_payload)
        except (json.JSONDecodeError, TypeError):
            return {}
    
    def set_input_payload(self, payload: Dict[Any, Any]):
        """Set input payload from dictionary"""
        self.input_payload = json.dumps(payload)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert experiment to dictionary for API responses"""
        return {
            "id": self.id,
            "model_used": self.model_used,
            "status": self.status,
            "input_payload": self.get_input_payload(),
            "result": self.result,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }