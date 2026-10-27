"""Pipeline pieces specific to the CRM's bots.

Order in the pipeline (bot.py):
    transport in → STT → LanguageFollower → user aggregator → ScriptGate → LLM switcher
    → Mouth → TTS → transport out → assistant aggregator
"""

import asyncio
import time
from typing import Any, Callable

from loguru import logger
from pipecat.frames.frames import (
    BotStartedSpeakingFrame,
    CancelFrame,
    EndFrame,
    EndWorkerFrame,
    Frame,
    FunctionCallsStartedFrame,
    InterruptionFrame,
    LLMContextFrame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMTextFrame,
    LLMUpdateSettingsFrame,
    MetricsFrame,
    OutputAudioRawFrame,
    TranscriptionFrame,
    TTSSpeakFrame,
    TTSUpdateSettingsFrame,
    UserStartedSpeakingFrame,
    UserStoppedSpeakingFrame,
    VADUserStartedSpeakingFrame,
    VADUserStoppedSpeakingFrame,
)
from pipecat.metrics.metrics import LLMUsageMetricsData, ProcessingMetricsData, STTUsageMetricsData, TTFBMetricsData, TTSUsageMetricsData
from pipecat.observers.base_observer import BaseObserver, FramePushed
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.services.settings import LLMSettings

from .conversation import Conversation
from .prompt import build_system_prompt

FILLER_AFTER_SECONDS = 0.7


def _last_user_text(frame: LLMContextFrame) -> str:
    for message in reversed(frame.context.get_messages()):
        if isinstance(message, dict) and message.get("role") == "user":
            content = message.get("content")
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                return " ".join(part.get("text", "") for part in content if isinstance(part, dict))
    return ""


class LanguageFollower(FrameProcessor):
    """Watches what the caller says and moves the reply language when they switch (decision 16)."""

    def __init__(self, conversation: Conversation, on_change: Callable[[str], Any]):
        super().__init__()
        self._conversation = conversation
        self._on_change = on_change

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame) and direction == FrameDirection.DOWNSTREAM:
            if self._conversation.language.observe(frame.text):
                await self._conversation.add_event("language_changed", language=self._conversation.language.current)
                await self._on_change(self._conversation.language.current)
        await self.push_frame(frame, direction)


class ScriptGate(FrameProcessor):
    """Sits before the AI. While a fixed step waits for its answer, or once the call is ending,
    the caller's turn doesn't go to the AI."""

    def __init__(self, conversation: Conversation):
        super().__init__()
        self._conversation = conversation

    async def set_language(self, language: str):
        prompt = build_system_prompt(self._conversation.bot, language)
        await self.push_frame(LLMUpdateSettingsFrame(delta=LLMSettings(system_instruction=prompt), reach_inactive_services=True))

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, LLMContextFrame) and direction == FrameDirection.DOWNSTREAM:
            conversation = self._conversation
            if conversation.ending:
                return
            if conversation.script_waiting:
                if await conversation.handle_script_answer(_last_user_text(frame)):
                    await self.push_frame(frame, direction)
                return
        await self.push_frame(frame, direction)


class Mouth(FrameProcessor):
    """Sits between the AI and the voice. Plays recorded lines, says fixed text, fills a slow
    reply with a short acknowledgement, and ends the call once everything has been said."""

    def __init__(self, conversation: Conversation, sample_rate: int):
        super().__init__()
        self._conversation = conversation
        self._sample_rate = sample_rate
        self._filler_task: asyncio.Task | None = None
        self._filled_this_turn = False
        self._chunk_bytes = int(sample_rate * 0.02) * 2  # 20 ms of 16-bit mono

    async def play_recorded(self, audio_id: str, text: str, language: str | None, *, record: bool = True) -> bool:
        audio = self._conversation.audio.get(audio_id)
        if not audio:
            return False
        for offset in range(0, len(audio), self._chunk_bytes):
            chunk = audio[offset : offset + self._chunk_bytes]
            if len(chunk) % 2:
                chunk = chunk[:-1]
            if chunk:
                await self.push_frame(OutputAudioRawFrame(audio=chunk, sample_rate=self._sample_rate, num_channels=1))
        if record:
            if self._conversation.context is not None:
                self._conversation.context.add_message({"role": "assistant", "content": text})
            await self._conversation.add_transcript("bot", text, language)
        return True

    async def say(self, text: str, *, audio_id: str | None = None, language: str | None = None):
        text = (text or "").strip()
        if not text:
            return
        if audio_id and await self.play_recorded(audio_id, text, language):
            return
        await self.push_frame(TTSSpeakFrame(text))

    async def set_voice(self, delta: Any):
        await self.push_frame(TTSUpdateSettingsFrame(delta=delta))

    async def end_call(self):
        # Upstream to the worker, which then ends the pipeline behind what's queued to be said.
        await self.push_frame(EndWorkerFrame(), FrameDirection.UPSTREAM)

    def _cancel_filler(self):
        if self._filler_task and not self._filler_task.done():
            self._filler_task.cancel()
        self._filler_task = None

    async def _filler_after_delay(self):
        try:
            await asyncio.sleep(FILLER_AFTER_SECONDS)
            if not self._filled_this_turn and not self._conversation.ending:
                self._filled_this_turn = True
                await self._conversation.say_filler()
        except asyncio.CancelledError:
            pass

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, LLMFullResponseStartFrame):
            self._cancel_filler()
            self._filler_task = self.create_task(self._filler_after_delay())
        elif isinstance(frame, (LLMTextFrame, FunctionCallsStartedFrame, LLMFullResponseEndFrame, InterruptionFrame, EndFrame, CancelFrame)):
            self._cancel_filler()
        if isinstance(frame, UserStartedSpeakingFrame):
            self._filled_this_turn = False
        await self.push_frame(frame, direction)


class TurnObserver(BaseObserver):
    """Measures each reply as the caller hears it, from the end of their speech to the bot's
    first sound, and collects provider usage."""

    def __init__(self, conversation: Conversation, on_usage: Callable[[dict[str, Any]], None], vad_stop_seconds: float = 0.2):
        super().__init__()
        self._conversation = conversation
        self._on_usage = on_usage
        self._vad_stop_seconds = vad_stop_seconds
        self._speech_ended_at: float | None = None
        self._turn_ended_at: float | None = None
        self._current: dict[str, Any] = {}
        self._seen: set[int] = set()

    async def on_push_frame(self, data: FramePushed):
        frame = data.frame
        # Speaking frames are broadcast both ways as two separate frames; count each event once.
        if data.direction != FrameDirection.DOWNSTREAM or frame.id in self._seen:
            return
        if isinstance(frame, (UserStoppedSpeakingFrame, BotStartedSpeakingFrame, MetricsFrame, UserStartedSpeakingFrame, VADUserStartedSpeakingFrame, VADUserStoppedSpeakingFrame)):
            self._seen.add(frame.id)
            if len(self._seen) > 5000:
                self._seen.clear()
        else:
            return
        conversation = self._conversation
        if isinstance(frame, UserStartedSpeakingFrame):
            conversation.silence_count = 0
        elif isinstance(frame, VADUserStartedSpeakingFrame):
            self._speech_ended_at = None
        elif isinstance(frame, VADUserStoppedSpeakingFrame):
            # The detector reports a stop after this much silence; the speech itself ended earlier.
            # The first stop after the caller last spoke counts (the stop is reported more than once).
            if self._speech_ended_at is None:
                self._speech_ended_at = time.monotonic() - self._vad_stop_seconds
        elif isinstance(frame, UserStoppedSpeakingFrame):
            self._turn_ended_at = self._speech_ended_at or time.monotonic()
            self._speech_ended_at = None
            self._current = {"sttMs": None, "llmMs": None, "ttsMs": None}
        elif isinstance(frame, BotStartedSpeakingFrame) and self._turn_ended_at is not None:
            reply_ms = int((time.monotonic() - self._turn_ended_at) * 1000)
            self._turn_ended_at = None
            turn = {"replyMs": reply_ms, **self._current, "ai": conversation.ai_label, "language": conversation.language.current}
            conversation.turns.append(turn)
            await conversation.send({"type": "turn", **turn})
        elif isinstance(frame, MetricsFrame):
            for item in frame.data:
                name = (item.processor or "").lower()
                if isinstance(item, TTFBMetricsData) and item.value:
                    if "tts" in name and self._current.get("ttsMs") is None:
                        self._current["ttsMs"] = int(item.value * 1000)
                    elif "llm" in name and self._current.get("llmMs") is None:
                        self._current["llmMs"] = int(item.value * 1000)
                elif isinstance(item, ProcessingMetricsData) and "stt" in name and item.value:
                    self._current["sttMs"] = int(item.value * 1000)
                elif isinstance(item, LLMUsageMetricsData):
                    tokens = item.value
                    provider = "claude" if "anthropic" in name else "groq"
                    self._on_usage({
                        "provider": provider,
                        "kind": "chat",
                        "model": item.model,
                        "requests": 1,
                        "inputTokens": int(tokens.prompt_tokens or 0),
                        "outputTokens": int(tokens.completion_tokens or 0),
                        "cacheReadTokens": int(getattr(tokens, "cache_read_input_tokens", 0) or 0),
                        "cacheWriteTokens": int(getattr(tokens, "cache_creation_input_tokens", 0) or 0),
                    })
                elif isinstance(item, STTUsageMetricsData):
                    self._on_usage({"provider": "groq", "kind": "stt", "audioSeconds": float(item.value.audio_seconds or 0), "requests": 1})
                elif isinstance(item, TTSUsageMetricsData):
                    provider = "azure" if "azure" in name else "google"
                    self._on_usage({"provider": provider, "kind": "tts", "characters": int(item.value or 0), "requests": 1})
