"""
Cerebras client wrapper (Cerebras-first) with retries, timeouts, and latency measurement.
Falls back to REST if SDK is unavailable. Returns dict: {text, tokens, latency_ms, model}.
"""
import os
import time
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

DEFAULT_MODEL = os.getenv("CEREBRAS_MODEL", "llama3.1-8b")
CEREBRAS_API_KEY = os.getenv("CEREBRAS_API_KEY")
CEREBRAS_BASE_URL = os.getenv(
    "CEREBRAS_BASE_URL", "https://api.cerebras.ai/v1/chat/completions"
)

# Try SDK import lazily
_cerebras_sdk = None
try:
    from cerebras.cloud.sdk import Cerebras  # type: ignore
    _cerebras_sdk = Cerebras(api_key=CEREBRAS_API_KEY) if CEREBRAS_API_KEY else None
except Exception as e:
    logger.warning("Cerebras SDK not available or failed to init: %s", e)


def _do_rest_call(prompt: str, model: str, temperature: float = 0.2, timeout: int = 30) -> Dict[str, Any]:
    import requests

    headers = {
        "Authorization": f"Bearer {CEREBRAS_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You explain bandit decisions concisely for a hackathon demo."},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
    }
    t0 = time.time()
    r = requests.post(CEREBRAS_BASE_URL, json=payload, headers=headers, timeout=timeout)
    dt = int((time.time() - t0) * 1000)
    r.raise_for_status()
    data = r.json()
    text = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {})
    return {"text": text, "tokens": usage, "latency_ms": dt, "model": model}


def _do_sdk_call(prompt: str, model: str, temperature: float = 0.2, timeout: int = 30) -> Dict[str, Any]:
    t0 = time.time()
    resp = _cerebras_sdk.chat.completions.create(
        messages=[{"role": "system", "content": "You explain bandit decisions concisely for a hackathon demo."},
                  {"role": "user", "content": prompt}],
        model=model,
        max_tokens=800,
        temperature=temperature,
        # SDK may not support explicit timeout; http timeouts are internal
    )
    dt = int((time.time() - t0) * 1000)
    text = resp.choices[0].message.content
    usage = getattr(resp, "usage", {}) or {}
    return {"text": text, "tokens": usage, "latency_ms": dt, "model": model}


def explain_choice(context: str, *, model: Optional[str] = None, retries: int = 3, backoff: float = 0.5) -> Dict[str, Any]:
    if not CEREBRAS_API_KEY:
        raise RuntimeError("CEREBRAS_API_KEY is not set")
    mdl = model or DEFAULT_MODEL

    attempt = 0
    last_err: Optional[Exception] = None
    while attempt < retries:
        try:
            if _cerebras_sdk is not None:
                return _do_sdk_call(context, mdl)
            else:
                return _do_rest_call(context, mdl)
        except Exception as e:
            last_err = e
            logger.warning("Cerebras call failed (attempt %d/%d): %s", attempt + 1, retries, e)
            time.sleep(backoff * (2 ** attempt))
            attempt += 1
    assert last_err is not None
    raise RuntimeError(f"Cerebras explanation failed after {retries} retries: {last_err}")
