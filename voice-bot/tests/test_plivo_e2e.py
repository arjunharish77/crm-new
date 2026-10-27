"""End-to-end over Plivo's stream protocol (wave E): a stand-in Plivo connects to
/voice-bot/plivo/{token}, sends the "start" event and the caller's audio as base64 μ-law at 8 kHz,
and gets the bot's audio back as "playAudio" events. Real speech and end-of-turn detection on
recorded Hindi speech; stand-in AI, speech-to-text and voice. Needs macOS `say` (skipped elsewhere).
"""

import asyncio
import audioop
import base64
import json
import shutil
import tempfile
import time
from pathlib import Path

import pytest
import uvicorn
import websockets
from aiohttp import web

import app.bot as bot_module
import app.main as main_module
from app.crm import SIGNATURE_HEADER, CrmClient, sign
from tests.test_e2e import SECRET, FakeLLM, FakeSTT, FakeTTS, claim_payload, speech
from pipecat.pipeline.llm_switcher import LLMSwitcher
from app.services import FailoverOnAnyError

pytestmark = pytest.mark.skipif(not (shutil.which("say") and shutil.which("afconvert")), reason="needs macOS say and afconvert to make speech")


def to_plivo_frames(pcm16k: bytes) -> list[str]:
    """16 kHz PCM → 8 kHz μ-law, in 20 ms frames, base64 (what Plivo sends)."""
    narrow, _ = audioop.ratecv(pcm16k, 2, 1, 16000, 8000, None)
    ulaw = audioop.lin2ulaw(narrow, 2)
    return [base64.b64encode(ulaw[offset : offset + 160]).decode() for offset in range(0, len(ulaw), 160)]


def test_a_phone_call_over_plivos_stream(monkeypatch):
    with tempfile.TemporaryDirectory() as folder:
        clip = speech("Lekha", "मुझे एम बी ए प्रोग्राम के बारे में जानना है।", Path(folder), "hindi")
    asyncio.run(_run(monkeypatch, clip))


async def _run(monkeypatch, clip: bytes):
    received = {"claims": [], "ends": [], "bad": 0}

    async def handler(request: web.Request):
        body = await request.text()
        header = request.headers.get(SIGNATURE_HEADER, "")
        timestamp = int(header.split(",")[0].split("=")[1]) if header.startswith("t=") else 0
        if header != sign(SECRET, "POST", request.path, body, timestamp):
            received["bad"] += 1
            return web.Response(status=404)
        if request.path.endswith("/claim"):
            received["claims"].append(json.loads(body))
            payload = claim_payload("x")
            payload["kind"] = "CALL"
            payload["bot"]["sampleRate"] = 8000
            payload["audio"] = {"opening": base64.b64encode(b"\x20\x00" * 8000).decode()}  # one second at 8 kHz
            payload["plivo"] = None  # no hang-up through Plivo's API in a test
            return web.json_response(payload)
        if request.path.endswith("/end"):
            received["ends"].append(json.loads(body))
        return web.json_response({"ok": True, "claudeCapReached": False})

    crm_app = web.Application()
    crm_app.router.add_post("/api/internal/voice-bot/sessions/claim", handler)
    crm_app.router.add_post("/api/internal/voice-bot/sessions/{id}/usage", handler)
    crm_app.router.add_post("/api/internal/voice-bot/sessions/{id}/end", handler)
    runner = web.AppRunner(crm_app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    crm_port = site._server.sockets[0].getsockname()[1]

    def fake_llms(ai, keys, prompt):
        primary = FakeLLM("Primary", ["जी, MBA दो साल का प्रोग्राम है।"])
        return LLMSwitcher(llms=[primary], strategy_type=FailoverOnAnyError), {primary: "Primary"}

    segments: list[float] = []
    monkeypatch.setattr(main_module, "crm", CrmClient(f"http://127.0.0.1:{crm_port}", SECRET))
    monkeypatch.setattr(bot_module, "make_llms", fake_llms)
    monkeypatch.setattr(bot_module, "GroqWhisperSTT", lambda **kwargs: FakeSTT(["मुझे MBA प्रोग्राम के बारे में जानना है"], segments))
    monkeypatch.setattr(bot_module, "make_tts", lambda bot, keys, language, rate: FakeTTS(sample_rate=rate))

    server = uvicorn.Server(uvicorn.Config(main_module.app, host="127.0.0.1", port=0, log_level="warning", ws="websockets-sansio"))
    serve = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.05)
    port = server.servers[0].sockets[0].getsockname()[1]

    events: list[dict] = []
    played_at: list[float] = []
    async with websockets.connect(f"ws://127.0.0.1:{port}/voice-bot/plivo/11111111-1111-1111-1111-111111111111.{'b' * 32}") as socket:
        await socket.send(json.dumps({"event": "start", "start": {"streamId": "stream-1", "callId": "call-1"}}))

        async def listen():
            try:
                async for message in socket:
                    event = json.loads(message)
                    events.append(event)
                    if event.get("event") == "playAudio":
                        played_at.append(time.monotonic())
            except websockets.ConnectionClosed:
                pass

        listener = asyncio.create_task(listen())

        async def send(frames: list[str]):
            start = time.monotonic()
            for index, frame in enumerate(frames):
                await socket.send(json.dumps({"event": "media", "media": {"payload": frame}, "streamId": "stream-1"}))
                await asyncio.sleep(max(0, start + (index + 1) * 0.02 - time.monotonic()))

        silence = to_plivo_frames(b"\x00\x00" * 16000)  # one second
        await send(silence * 2)
        await send(to_plivo_frames(clip))
        spoke_until = time.monotonic()
        await send(silence * 4)
        await socket.close()
        await asyncio.wait_for(listener, 5)

    for _ in range(100):
        if received["ends"]:
            break
        await asyncio.sleep(0.1)
    server.should_exit = True
    await serve
    await runner.cleanup()

    assert received["bad"] == 0 and len(received["claims"]) == 1 and len(received["ends"]) == 1
    plays = [event for event in events if event.get("event") == "playAudio"]
    assert plays, "the bot's audio comes back to Plivo"
    first = plays[0]
    assert first["streamId"] == "stream-1" and first["media"]["contentType"] == "audio/x-mulaw" and first["media"]["sampleRate"] == 8000
    assert len(segments) == 1, segments  # one utterance heard, from 8 kHz phone audio
    transcript = received["ends"][0]["transcript"]
    assert [entry["role"] for entry in transcript][:3] == ["bot", "caller", "bot"], transcript
    reply = [moment for moment in played_at if moment > spoke_until]
    assert reply and reply[0] - spoke_until < 1.5, "the bot answers within the service's own budget"
    print(f"\nPhone line: bot audio {round((reply[0] - spoke_until) * 1000)} ms after the caller stopped; {len(plays)} playAudio events")
