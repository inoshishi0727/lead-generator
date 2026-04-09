"""FastAPI entrypoint — Asterley Bros Lead Generation API."""

from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

import traceback

import asyncio
import json

import structlog
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from src.api.analytics import analytics_router
from src.api.auth import auth_router
from src.api.outreach import outreach_router
from src.api.recommendations import recommendations_router
from src.api.routes import router

log = structlog.get_logger()

app = FastAPI(title="Asterley Bros API", version="0.1.0")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    log.info("request_in", method=request.method, path=request.url.path)
    try:
        response = await call_next(request)
        log.info("request_out", method=request.method, path=request.url.path, status=response.status_code)
        return response
    except Exception as exc:
        log.error("request_error", method=request.method, path=request.url.path, error=str(exc), traceback=traceback.format_exc())
        return JSONResponse(status_code=500, content={"detail": str(exc)})


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(analytics_router)
app.include_router(auth_router)
app.include_router(outreach_router)
app.include_router(recommendations_router)

# ---------------------------------------------------------------------------
# WebSocket for live updates — clients connect once, receive invalidation events
# ---------------------------------------------------------------------------
_ws_clients: set[WebSocket] = set()


async def broadcast(event: dict):
    """Send an event to all connected WebSocket clients."""
    data = json.dumps(event)
    disconnected = set()
    for ws in _ws_clients:
        try:
            await ws.send_text(data)
        except Exception:
            disconnected.add(ws)
    _ws_clients -= disconnected


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    _ws_clients.add(ws)
    log.info("ws_connected", clients=len(_ws_clients))
    try:
        while True:
            await ws.receive_text()  # Keep alive, ignore client messages
    except WebSocketDisconnect:
        _ws_clients.discard(ws)
        log.info("ws_disconnected", clients=len(_ws_clients))

# Serve Next.js static export in production
static_dir = Path(__file__).parent / "src" / "static"
if static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
