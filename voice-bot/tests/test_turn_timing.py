"""A filler must not be reported as the start of the answer."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pipecat.frames.frames import BotStartedSpeakingFrame, MetricsFrame, TTSAudioRawFrame, UserStoppedSpeakingFrame, VADUserStartedSpeakingFrame
from pipecat.metrics.metrics import ProcessingMetricsData
from pipecat.observers.base_observer import FramePushed
from pipecat.processors.frame_processor import FrameDirection

import app.processors as processors
from app.processors import TurnObserver


@pytest.mark.asyncio
async def test_first_sound_and_answer_audio_are_measured_separately(monkeypatch):
    moment = [100.0]
    monkeypatch.setattr(processors.time, "monotonic", lambda: moment[0])
    conversation = SimpleNamespace(
        silence_count=0, ai_label="Groq", language=SimpleNamespace(current="en"),
        turns=[], send=AsyncMock(),
    )
    observer = TurnObserver(conversation, lambda _: None)

    async def push(frame):
        await observer.on_push_frame(FramePushed(None, None, frame, FrameDirection.DOWNSTREAM, 0))

    await push(VADUserStartedSpeakingFrame())
    await push(MetricsFrame([ProcessingMetricsData(processor="groq-stt", value=0.24)]))
    await push(UserStoppedSpeakingFrame())
    moment[0] = 100.7
    await push(BotStartedSpeakingFrame())  # a recorded filler
    assert conversation.turns == []
    moment[0] = 101.4
    await push(TTSAudioRawFrame(b"\x01\x00", 24000, 1))  # the actual answer
    assert len(conversation.turns) == 1
    assert conversation.turns[0]["replyMs"] == 700
    assert conversation.turns[0]["answerMs"] == 1400
    assert conversation.turns[0]["sttMs"] == 240
    conversation.send.assert_awaited_once()


@pytest.mark.asyncio
async def test_recorded_fixed_answer_can_follow_a_filler(monkeypatch):
    moment = [200.0]
    monkeypatch.setattr(processors.time, "monotonic", lambda: moment[0])
    conversation = SimpleNamespace(
        silence_count=0, ai_label="Groq", language=SimpleNamespace(current="en"),
        turns=[], send=AsyncMock(),
    )
    observer = TurnObserver(conversation, lambda _: None)
    await observer.on_push_frame(FramePushed(None, None, UserStoppedSpeakingFrame(), FrameDirection.DOWNSTREAM, 0))
    moment[0] = 200.6
    await observer.on_push_frame(FramePushed(None, None, BotStartedSpeakingFrame(), FrameDirection.DOWNSTREAM, 0))
    moment[0] = 201.1
    await observer.recorded_answer_started()
    assert len(conversation.turns) == 1
    assert conversation.turns[0]["replyMs"] == 600
    assert conversation.turns[0]["answerMs"] == 1100
