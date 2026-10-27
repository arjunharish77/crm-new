"""The browser test call's wire format (voice bot plan wave C).

Browser → service: binary messages of 16-bit little-endian mono PCM at 16 kHz (the caller).
Service → browser: binary messages of 16-bit mono PCM at the session's output rate (the bot),
and JSON text messages: transcript lines, reply times, events, and {"type": "clear"} when the
caller interrupts, so the browser drops the bot audio it has queued.
"""

import json

from pipecat.frames.frames import (
    Frame,
    InputAudioRawFrame,
    InterruptionFrame,
    OutputAudioRawFrame,
    OutputTransportMessageFrame,
    OutputTransportMessageUrgentFrame,
)
from pipecat.serializers.base_serializer import FrameSerializer

BROWSER_INPUT_RATE = 16000


class BrowserTestSerializer(FrameSerializer):
    async def serialize(self, frame: Frame) -> str | bytes | None:
        if isinstance(frame, InterruptionFrame):
            return json.dumps({"type": "clear"})
        if isinstance(frame, OutputAudioRawFrame):
            return bytes(frame.audio) if frame.audio else None
        if isinstance(frame, (OutputTransportMessageFrame, OutputTransportMessageUrgentFrame)):
            if self.should_ignore_frame(frame):
                return None
            return json.dumps(frame.message, ensure_ascii=False, default=str)
        return None

    async def deserialize(self, data: str | bytes) -> Frame | None:
        if isinstance(data, (bytes, bytearray)):
            audio = bytes(data)
            if len(audio) % 2:
                audio = audio[:-1]
            if not audio:
                return None
            return InputAudioRawFrame(audio=audio, sample_rate=BROWSER_INPUT_RATE, num_channels=1)
        return None
