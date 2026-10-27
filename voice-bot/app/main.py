"""The service's web endpoints.

    GET  /health                      for Docker and the CRM's readiness check
    WS   /voice-bot/test/{token}      a browser test call from the bot builder
    WS   /voice-bot/plivo/{token}     a phone call's audio from Plivo's <Stream> (voice bot wave E)
    POST /internal/knowledge/*        the CRM's knowledge work (signed; Caddy never routes /internal)

Each WebSocket carries a single-use token the CRM issued for that one conversation; the service
claims it from the CRM before saying anything, so no other audio is accepted.
"""

import asyncio
import base64
import json

from fastapi import FastAPI, Request, WebSocket
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from loguru import logger
from pipecat.serializers.plivo import PlivoFrameSerializer

from .bot import run_conversation
from .config import load_settings
from . import knowledge
from .crm import SIGNATURE_HEADER, CrmClient, verify
from .serializers import BROWSER_INPUT_RATE, BrowserTestSerializer

PLIVO_RATE = 8000
MAX_CONVERSATIONS = 4  # Whisper's free tier allows about two at once (plan §3); the queue keeps to that

settings = load_settings()
crm = CrmClient(settings.crm_url, settings.secret)
app = FastAPI(title="Voice bot service", docs_url=None, redoc_url=None, openapi_url=None)
active: set[str] = set()


@app.get("/health")
async def health():
    if not settings.configured:
        return JSONResponse({"ok": False, "problem": "VOICE_BOT_SERVICE_SECRET isn't set"}, status_code=503)
    return {"ok": True, "conversations": len(active)}


async def _refuse(websocket: WebSocket, message: str, code: int):
    try:
        await websocket.send_text(json.dumps({"type": "error", "message": message}))
    finally:
        await websocket.close(code=code)


@app.websocket("/voice-bot/test/{token}")
async def browser_test_call(websocket: WebSocket, token: str):
    origin = websocket.headers.get("origin")
    if settings.browser_origins and origin not in settings.browser_origins:
        await websocket.close(code=4403)
        return
    await websocket.accept()
    if not settings.configured:
        await _refuse(websocket, "The voice bot service isn't set up yet.", 4503)
        return
    if len(active) >= MAX_CONVERSATIONS:
        await _refuse(websocket, "The bot is busy with other calls. Try again in a minute.", 4429)
        return
    claim = await crm.claim(token)
    if not claim or claim.get("kind") != "TEST":
        await _refuse(websocket, "This test call link has expired. Start the test call again.", 4401)
        return
    active.add(claim["sessionId"])
    try:
        await run_conversation(websocket, claim, crm=crm, serializer=BrowserTestSerializer(), input_rate=BROWSER_INPUT_RATE)
    finally:
        active.discard(claim["sessionId"])


async def _plivo_start(websocket: WebSocket) -> dict | None:
    """Plivo's first message on a stream: {"event": "start", "start": {"streamId", "callId", ...}}."""
    try:
        for _ in range(5):
            message = json.loads(await asyncio.wait_for(websocket.receive_text(), timeout=10))
            if message.get("event") == "start":
                return message.get("start") or {}
    except Exception as error:
        logger.warning(f"Plivo stream didn't start: {error}")
    return None


@app.websocket("/voice-bot/plivo/{token}")
async def plivo_call(websocket: WebSocket, token: str):
    await websocket.accept()
    if not settings.configured:
        await websocket.close(code=4503)
        return
    start = await _plivo_start(websocket)
    if not start or not start.get("streamId"):
        await websocket.close(code=4400)
        return
    claim = await crm.claim(token)
    if not claim or claim.get("kind") != "CALL":
        await websocket.close(code=4401)
        return
    plivo = claim.get("plivo") or {}
    can_hang_up = bool(plivo.get("authId") and plivo.get("authToken") and start.get("callId"))
    serializer = PlivoFrameSerializer(
        stream_id=start["streamId"],
        call_id=start.get("callId"),
        auth_id=plivo.get("authId"),
        auth_token=plivo.get("authToken"),
        params=PlivoFrameSerializer.InputParams(plivo_sample_rate=PLIVO_RATE, auto_hang_up=can_hang_up),
    )
    active.add(claim["sessionId"])
    try:
        await run_conversation(websocket, claim, crm=crm, serializer=serializer, input_rate=PLIVO_RATE)
    finally:
        active.discard(claim["sessionId"])


# ---- Knowledge (wave D): the CRM's calls, signed like the service's calls to the CRM ----------------
MAX_DOCUMENT_BYTES = 15 * 1024 * 1024


async def _signed_json(request: Request) -> dict | None:
    body = (await request.body()).decode("utf-8", errors="replace")
    if not settings.configured or len(body) > 30 * 1024 * 1024:
        return None
    if not verify(settings.secret, request.headers.get(SIGNATURE_HEADER), "POST", request.url.path, body):
        return None
    try:
        payload = json.loads(body)
    except ValueError:
        return None
    return payload if isinstance(payload, dict) else None


def _not_found():
    return JSONResponse({"message": "Not found"}, status_code=404)


@app.post("/internal/knowledge/document")
async def knowledge_document(request: Request):
    """{fileType: pdf|docx|text, data: base64} → {text}"""
    payload = await _signed_json(request)
    if payload is None:
        return _not_found()
    try:
        data = base64.b64decode(str(payload.get("data", "")), validate=True)
    except ValueError:
        return JSONResponse({"message": "The file couldn't be read."}, status_code=400)
    if len(data) > MAX_DOCUMENT_BYTES:
        return JSONResponse({"message": "The file is too large."}, status_code=413)
    try:
        text = await run_in_threadpool(knowledge.extract_document, str(payload.get("fileType", "")), data)
    except Exception as error:
        logger.warning(f"Document couldn't be read: {error}")
        return JSONResponse({"message": "The file couldn't be read. Is it a valid PDF, Word or text file?"}, status_code=422)
    return {"text": text}


@app.post("/internal/knowledge/page")
async def knowledge_page(request: Request):
    """{html} → {title, text}"""
    payload = await _signed_json(request)
    if payload is None:
        return _not_found()
    title, text = await run_in_threadpool(knowledge.extract_page, str(payload.get("html", ""))[:5_000_000])
    return {"title": title, "text": text}


@app.post("/internal/knowledge/prepare")
async def knowledge_prepare(request: Request):
    """{text, whole?} → {passages: [{text, language, embedding (base64 float32)}]}"""
    payload = await _signed_json(request)
    if payload is None:
        return _not_found()
    passages = await run_in_threadpool(knowledge.prepare, str(payload.get("text", "")), whole=bool(payload.get("whole")))
    return {"passages": passages, "dimensions": knowledge.DIMENSIONS}


@app.post("/internal/knowledge/query")
async def knowledge_query(request: Request):
    """{question} → {embedding} (for the builder's "test a question")."""
    payload = await _signed_json(request)
    if payload is None:
        return _not_found()
    vector = await run_in_threadpool(lambda: knowledge.Embedder.get().embed([str(payload.get("question", ""))[:1000]], "query")[0])
    return {"embedding": knowledge.encode_vector(vector)}

