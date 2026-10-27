"""End-to-end: a browser test call through the real service, with real speech detection (Silero
VAD) and end-of-turn detection (Smart Turn v3) on recorded Hindi and English speech.

The AI, speech-to-text and voice providers are stand-ins (no keys or network needed), so what
this measures is the service's own work: hearing that the caller stopped, deciding the turn is
over, and starting the reply. It also checks the claim → conversation → report flow with a
stand-in CRM that verifies every signature, and the switch to the other AI when one fails.

Speech is made with macOS `say`, so this test runs on a Mac and is skipped elsewhere.
"""

import asyncio
import base64
import json
import shutil
import subprocess
import tempfile
import time
import wave
from pathlib import Path

import pytest
import uvicorn
import websockets
from aiohttp import web
from pipecat.metrics.metrics import LLMTokenUsage
from pipecat.frames.frames import ErrorFrame, LLMFullResponseEndFrame, LLMFullResponseStartFrame, LLMTextFrame, TranscriptionFrame, TTSAudioRawFrame
from pipecat.pipeline.llm_switcher import LLMSwitcher
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.settings import STTSettings, TTSSettings
from pipecat.services.stt_service import SegmentedSTTService
from pipecat.services.tts_service import TTSService
from pipecat.utils.time import time_now_iso8601

import app.bot as bot_module
import app.main as main_module
from app.crm import SIGNATURE_HEADER, CrmClient, sign
from app.services import FailoverOnAnyError

SECRET = "test-secret-0123456789abcdef0123456789"
pytestmark = pytest.mark.skipif(not (shutil.which("say") and shutil.which("afconvert")), reason="needs macOS say and afconvert to make speech")

UTTERANCES = [
    ("Lekha", "मुझे एम बी ए प्रोग्राम के बारे में जानना है।", "मुझे MBA प्रोग्राम के बारे में जानना है"),
    ("Rishi", "What are the fees for the January batch?", "What are the fees for the January batch?"),
]


def speech(voice: str, text: str, folder: Path, name: str) -> bytes:
    aiff, wav_path = folder / f"{name}.aiff", folder / f"{name}.wav"
    subprocess.run(["say", "-v", voice, "-o", str(aiff), text], check=True)
    subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", str(aiff), str(wav_path)], check=True)
    with wave.open(str(wav_path)) as handle:
        return handle.readframes(handle.getnframes())


class FakeSTT(SegmentedSTTService):
    """Answers each speech segment with the next scripted transcript, and keeps the segment's length."""

    def __init__(self, texts, segments, **kwargs):
        super().__init__(settings=STTSettings(model=None, language=None), **kwargs)
        self._texts = list(texts)
        self.segments = segments

    async def run_stt(self, audio: bytes):
        self.segments.append(len(audio) / 32000)
        if self._texts:
            yield TranscriptionFrame(self._texts.pop(0), "", time_now_iso8601())


class FakeLLM(OpenAILLMService):
    def __init__(self, name, replies, fail_first=False):
        super().__init__(api_key="unused", settings=OpenAILLMService.Settings(model="fake"))
        self._label = name
        self._replies = list(replies)
        self._fail = fail_first
        self.calls = 0

    async def _process_context(self, context):
        self.calls += 1
        await self.push_frame(LLMFullResponseStartFrame())
        if self._fail:
            self._fail = False
            await self.push_error(error_msg="stand-in failure")
            await self.push_frame(LLMFullResponseEndFrame())
            return
        await asyncio.sleep(0.05)
        await self.push_frame(LLMTextFrame(self._replies.pop(0) if self._replies else "Okay."))
        await self.push_frame(LLMFullResponseEndFrame())
        await self.start_llm_usage_metrics(LLMTokenUsage(prompt_tokens=100, completion_tokens=20, total_tokens=120))

    async def run_inference(self, context, **kwargs):
        return "NONE"


class FakeTTS(TTSService):
    def __init__(self, **kwargs):
        super().__init__(push_start_frame=True, push_stop_frames=True, settings=TTSSettings(model=None, voice=None, language=None), **kwargs)

    def can_generate_metrics(self) -> bool:
        return True

    async def run_tts(self, text: str, context_id: str):
        await self.start_tts_usage_metrics(text)
        await self.start_ttfb_metrics()
        await asyncio.sleep(0.02)
        await self.stop_ttfb_metrics()
        yield TTSAudioRawFrame(b"\x10\x00" * int(self.sample_rate * 0.6), self.sample_rate, 1, context_id=context_id)


def claim_payload(token: str):
    lines = {"fillers": ["हाँ जी।"], "checkIn": "हैलो?", "silenceGoodbye": "बाद में।", "timeUp": "समय।", "problem": "दिक्कत।", "transfer": "जोड़ रही हूँ।"}
    return {
        "sessionId": "11111111-1111-1111-1111-111111111111",
        "tenantId": "t1",
        "kind": "TEST",
        "keys": {"groq": "unused", "claude": None, "google": "unused", "azure": None, "azureRegion": None},
        "audio": {"opening": base64.b64encode(b"\x20\x00" * 24000).decode()},  # one second
        "bot": {
            "botId": "b1", "botName": "Admissions", "kind": "TEST", "sampleRate": 24000,
            "languages": ["hi", "en"], "startLanguage": "hi",
            "voices": {"hi": {"provider": "google", "voice": "hi-IN-Chirp3-HD-Aoede"}, "en": {"provider": "google", "voice": "en-IN-Chirp3-HD-Aoede"}},
            "voiceProvider": "google", "voicePaid": False, "voiceGender": "female",
            "ai": {"primary": {"value": "groq-20b", "provider": "groq", "model": "x", "label": "Primary"}, "fallback": {"value": "claude-haiku", "provider": "claude", "model": "y", "label": "Fallback"}, "note": None},
            "persona": "", "goal": "Help.", "rules": "", "endRule": "", "openingLine": "Namaste!", "closingLine": "",
            "fixedSteps": {"before": [], "after": []}, "transfer": {"enabled": False, "rule": ""},
            "fields": [], "caller": {"details": {}, "record": {}}, "maxCallMinutes": 2, "silenceSeconds": 20,
            "lines": {"hi": lines, "en": {**lines, "fillers": ["Sure."]}},
        },
    }


@pytest.fixture
def speech_clips():
    with tempfile.TemporaryDirectory() as folder:
        yield [speech(voice, spoken, Path(folder), f"u{index}") for index, (voice, spoken, _) in enumerate(UTTERANCES)]


async def run_call(speech_clips, monkeypatch, *, fail_first: bool):
    received = {"claims": [], "ends": [], "usage": [], "bad_signatures": 0}

    async def handler(request: web.Request):
        body = await request.text()
        expected_path = request.path
        header = request.headers.get(SIGNATURE_HEADER, "")
        timestamp = int(header.split(",")[0].split("=")[1]) if header.startswith("t=") else 0
        if header != sign(SECRET, "POST", expected_path, body, timestamp) or abs(time.time() - timestamp) > 60:
            received["bad_signatures"] += 1
            return web.Response(status=404)
        payload = json.loads(body)
        if request.path.endswith("/claim"):
            received["claims"].append(payload)
            return web.json_response(claim_payload(payload["token"]) if len(received["claims"]) == 1 else None, status=200 if len(received["claims"]) == 1 else 404)
        if request.path.endswith("/end"):
            received["ends"].append(payload)
        else:
            received["usage"].append(payload)
        return web.json_response({"ok": True, "claudeCapReached": False})

    crm_app = web.Application()
    crm_app.router.add_post("/api/internal/voice-bot/sessions/claim", handler)
    crm_app.router.add_post("/api/internal/voice-bot/sessions/{id}/usage", handler)
    crm_app.router.add_post("/api/internal/voice-bot/sessions/{id}/end", handler)
    crm_runner = web.AppRunner(crm_app)
    await crm_runner.setup()
    crm_site = web.TCPSite(crm_runner, "127.0.0.1", 0)
    await crm_site.start()
    crm_port = crm_site._server.sockets[0].getsockname()[1]

    segments: list[float] = []
    llms = {}

    def fake_llms(ai, keys, prompt):
        primary = FakeLLM("Primary", ["जी, MBA के बारे में बताती हूँ।", "The fees are confirmed by the team."], fail_first=fail_first)
        fallback = FakeLLM("Fallback", ["जी, MBA के बारे में बताती हूँ।", "The fees are confirmed by the team."])
        llms["primary"], llms["fallback"] = primary, fallback
        return LLMSwitcher(llms=[primary, fallback], strategy_type=FailoverOnAnyError), {primary: "Primary", fallback: "Fallback"}

    monkeypatch.setattr(main_module, "crm", CrmClient(f"http://127.0.0.1:{crm_port}", SECRET))
    monkeypatch.setattr(bot_module, "make_llms", fake_llms)
    monkeypatch.setattr(bot_module, "GroqWhisperSTT", lambda **kwargs: FakeSTT([text for _, _, text in UTTERANCES], segments))
    monkeypatch.setattr(bot_module, "make_tts", lambda bot, keys, language, rate: FakeTTS(sample_rate=rate))

    server = uvicorn.Server(uvicorn.Config(main_module.app, host="127.0.0.1", port=0, log_level="warning", ws="websockets"))
    serve = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.05)
    port = server.servers[0].sockets[0].getsockname()[1]

    messages: list[dict] = []
    bot_audio_at: list[float] = []
    speech_ended_at: list[float] = []
    frame = 320 * 2  # 20 ms at 16 kHz

    async with websockets.connect(f"ws://127.0.0.1:{port}/voice-bot/test/11111111-1111-1111-1111-111111111111.{'a' * 32}", max_size=None) as socket:
        async def listen():
            try:
                async for message in socket:
                    if isinstance(message, bytes):
                        bot_audio_at.append(time.monotonic())
                    else:
                        messages.append(json.loads(message))
            except websockets.ConnectionClosed:
                pass

        listener = asyncio.create_task(listen())

        async def send(audio: bytes):
            start = time.monotonic()
            for index, offset in enumerate(range(0, len(audio), frame)):
                await socket.send(audio[offset : offset + frame])
                await asyncio.sleep(max(0, start + (index + 1) * 0.02 - time.monotonic()))

        silence = b"\x00\x00" * 320
        await send(silence * 100)  # 2 s: the opening plays
        for clip in speech_clips:
            await send(clip)
            speech_ended_at.append(time.monotonic())
            await send(silence * 200)  # 4 s for the reply
        await socket.close()
        await asyncio.wait_for(listener, 5)

    for _ in range(100):
        if received["ends"]:
            break
        await asyncio.sleep(0.1)
    server.should_exit = True
    await serve
    await crm_runner.cleanup()
    replies = []
    for ended in speech_ended_at:
        after = [moment for moment in bot_audio_at if moment > ended]
        replies.append(round((after[0] - ended) * 1000) if after else None)
    return received, messages, segments, replies, llms


def test_browser_call_with_real_turn_detection(speech_clips, monkeypatch):
    received, messages, segments, replies, _ = asyncio.run(run_call(speech_clips, monkeypatch, fail_first=False))
    assert received["bad_signatures"] == 0
    assert len(received["claims"]) == 1 and len(received["ends"]) == 1
    # Speech detection cut exactly one segment per utterance. A segment is a little longer than
    # the speech: it keeps about a second from before the speech started, so no word is clipped.
    clip_seconds = [len(clip) / 32000 for clip in speech_clips]
    assert len(segments) == len(clip_seconds), (segments, clip_seconds)
    for heard, spoken in zip(segments, clip_seconds):
        assert spoken - 0.3 < heard < spoken + 2.0, (heard, spoken)
    transcript = received["ends"][0]["transcript"]
    roles = [entry["role"] for entry in transcript]
    assert roles[0] == "bot" and transcript[0]["text"] == "Namaste!"
    assert [entry["text"] for entry in transcript if entry["role"] == "caller"] == [text for _, _, text in UTTERANCES]
    assert transcript[1]["language"] == "hi" and transcript[3]["language"] == "en"
    assert roles.count("bot") >= 3
    turns = received["ends"][0]["turns"]
    assert len(turns) == 2 and all(turn["ai"] == "Primary" for turn in turns)
    # The reply time the service reports is what the caller hears: from the end of their speech.
    for turn, heard in zip(turns, replies):
        assert abs(turn["replyMs"] - heard) < 400, (turn["replyMs"], heard)
    assert any(message.get("type") == "transcript" for message in messages)
    # Usage reached the CRM: the AI's tokens and the voice's characters (sent at the end).
    groq = [item for item in received["usage"] if item["provider"] == "groq"]
    google = [item for item in received["usage"] if item["provider"] == "google"]
    assert sum(item.get("inputTokens", 0) for item in groq) >= 200 and sum(item.get("outputTokens", 0) for item in groq) >= 40, received["usage"]
    assert sum(item.get("characters", 0) for item in google) > 20, received["usage"]
    # Caller stops → first bot audio, with instant stand-in providers: the service's own share.
    # The English question is one Smart Turn scores as unfinished (0.23), so it waits the 2 s cap.
    print(f"\nService-side reply time after the caller stops (ms): {replies}; segments {segments} vs spoken {clip_seconds}")
    assert replies[0] is not None and replies[0] < 800, replies
    assert replies[1] is not None and replies[1] < 2800, replies


def test_switches_to_the_other_ai_when_one_fails(speech_clips, monkeypatch):
    received, messages, _, replies, llms = asyncio.run(run_call(speech_clips, monkeypatch, fail_first=True))
    events = [event["type"] for event in received["ends"][0]["events"]]
    assert "ai_switched" in events
    assert llms["fallback"].calls >= 1
    bot_lines = [entry["text"] for entry in received["ends"][0]["transcript"] if entry["role"] == "bot"]
    assert "जी, MBA के बारे में बताती हूँ।" in bot_lines  # the failed turn was still answered
    assert all(reply is not None for reply in replies), replies
