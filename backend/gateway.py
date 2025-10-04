"""
Simple HTTP Gateway for MCP-style tool routing.
- Reads MCP_MANIFEST (JSON) at startup to map tool names to HTTP targets.
- Exposes POST /invoke and forwards to mapped service based on X-Docker-Tool header.
- Uses the method from the manifest (GET/POST/etc.) and substitutes {placeholders} from payload.path_params (optional).
"""
import os
import json
import logging
from typing import Dict, Any, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import httpx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mcp_http_gateway")

MANIFEST_PATH = os.getenv("MCP_MANIFEST", "/manifest/mcp-manifest.json")

app = FastAPI(title="MCP HTTP Gateway")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TOOLS: Dict[str, Dict[str, Any]] = {}


def load_manifest(path: str) -> None:
    global TOOLS
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        tools = data.get("tools", [])
        TOOLS = {t["name"]: t["target"] for t in tools if t.get("target", {}).get("type") == "http"}
        logger.info("Loaded %d tools from manifest %s", len(TOOLS), path)
    except Exception as e:
        logger.error("Failed to load manifest %s: %s", path, e)
        TOOLS = {}


@app.on_event("startup")
async def on_startup():
    load_manifest(MANIFEST_PATH)


@app.get("/health")
async def health():
    return {"status": "healthy", "tools": list(TOOLS.keys())}


def substitute_path_params(url: str, path_params: Optional[Dict[str, Any]]) -> str:
    if not path_params:
        return url
    for k, v in path_params.items():
        url = url.replace("{" + str(k) + "}", str(v))
    return url


@app.post("/invoke")
async def invoke(request: Request):
    tool_name = request.headers.get("X-Docker-Tool")
    if not tool_name:
        raise HTTPException(status_code=400, detail="Missing X-Docker-Tool header")
    target = TOOLS.get(tool_name)
    if not target:
        raise HTTPException(status_code=400, detail=f"Unknown tool '{tool_name}'")

    method = target.get("method", "POST").upper()
    url = target.get("url")
    if not url:
        raise HTTPException(status_code=500, detail="Tool target URL not configured")

    payload: Any = None
    try:
        # May be empty body
        payload = await request.json()
    except Exception:
        payload = None

    # Optional path parameter substitution
    path_params = None
    if isinstance(payload, dict):
        path_params = payload.get("path_params") or payload.get("_path_params")
    url = substitute_path_params(url, path_params)

    timeout = httpx.Timeout(60.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            if method == "GET":
                resp = await client.get(url)
            elif method == "POST":
                resp = await client.post(url, json=payload)
            elif method == "PUT":
                resp = await client.put(url, json=payload)
            elif method == "PATCH":
                resp = await client.patch(url, json=payload)
            elif method == "DELETE":
                resp = await client.delete(url, json=payload)
            else:
                raise HTTPException(status_code=500, detail=f"Unsupported method {method}")
        except httpx.RequestError as e:
            logger.error("Upstream request error for tool %s (%s %s): %s", tool_name, method, url, e)
            raise HTTPException(status_code=502, detail="Upstream service unavailable")

    # Try to return JSON, else text
    try:
        return resp.json()
    except ValueError:
        return {"status_code": resp.status_code, "content": resp.text}
