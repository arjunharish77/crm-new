"""One conversation, start to end: builds the pipeline from what the CRM handed over when the
session was claimed, runs it, and reports back.

    transport in → Whisper → LanguageFollower → user turns (VAD + Smart Turn v3) → ScriptGate
    → Groq/Claude switcher → Mouth → Google/Azure voice → transport out → assistant turns
"""

import asyncio
from typing import Any

from fastapi import WebSocket
from loguru import logger
from pipecat.audio.turn.smart_turn.base_smart_turn import SmartTurnParams
from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import LLMRunFrame, ManuallySwitchServiceFrame, OutputTransportMessageUrgentFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair, LLMUserAggregatorParams
from pipecat.serializers.base_serializer import FrameSerializer
from pipecat.services.anthropic.llm import AnthropicLLMService
from pipecat.transports.websocket.fastapi import FastAPIWebsocketParams, FastAPIWebsocketTransport
from pipecat.turns.user_stop import TurnAnalyzerUserTurnStopStrategy
from pipecat.turns.user_turn_strategies import UserTurnStrategies
from pipecat.workers.runner import WorkerRunner

from .conversation import Conversation
from .crm import CrmClient
from .processors import LanguageFollower, Mouth, ScriptGate, TurnObserver
from .prompt import build_system_prompt
from .services import GroqWhisperSTT, make_llms, make_tts, voice_settings, whisper_prompt

USAGE_FLUSH_SECONDS = 30
VAD_STOP_SECONDS = 0.2
# When Smart Turn thinks the caller hasn't finished, the longest it waits through silence before
# answering anyway. Pipecat's default is 3 s, which is long dead air on a phone call; the bot can
# be interrupted if it starts too soon. To be tuned on real calls (wave G).
UNSURE_TURN_WAIT_SECONDS = 2.0


class UsageReporter:
    """Claude usage goes to the CRM at once (the budget cap, decision 29); the rest is added up per
    provider, kind (chat, speech-to-text, voice) and model, and sent every 30 seconds and at the
    end. The CRM counts each against its free daily or monthly limit."""

    def __init__(self, crm: CrmClient, session_id: str, on_claude_cap: Any):
        self._crm = crm
        self._session_id = session_id
        self._on_claude_cap = on_claude_cap
        self._totals: dict[tuple[str, str, str], dict[str, float]] = {}
        self._tasks: set[asyncio.Task] = set()

    def add(self, usage: dict[str, Any]):
        if usage["provider"] == "claude":
            task = asyncio.create_task(self._send_claude(usage))
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)
            return
        key = (usage["provider"], str(usage.get("kind") or ""), str(usage.get("model") or ""))
        totals = self._totals.setdefault(key, {})
        for name, value in usage.items():
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                totals[name] = totals.get(name, 0) + value

    async def _send_claude(self, usage: dict[str, Any]):
        result = await self._crm.usage(self._session_id, {"requests": 1, **usage})
        if result and result.get("claudeCapReached"):
            await self._on_claude_cap()

    async def flush(self):
        totals, self._totals = self._totals, {}
        for (provider, kind, model), values in totals.items():
            payload: dict[str, Any] = {"provider": provider, **{name: (round(value, 2) if name == "audioSeconds" else int(value)) for name, value in values.items()}}
            if kind:
                payload["kind"] = kind
            if model:
                payload["model"] = model
            await self._crm.usage(self._session_id, payload)

    async def close(self):
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        await self.flush()


async def run_conversation(websocket: WebSocket, claim: dict[str, Any], *, crm: CrmClient, serializer: FrameSerializer, input_rate: int):
    bot = claim["bot"]
    keys = claim.get("keys") or {}
    output_rate = int(bot.get("sampleRate") or 24000)
    conversation = Conversation(claim, sample_rate=output_rate)
    is_test = claim.get("kind") == "TEST"
    error_message: str | None = None

    transport = FastAPIWebsocketTransport(
        websocket,
        FastAPIWebsocketParams(
            audio_in_enabled=True, audio_out_enabled=True, add_wav_header=False, serializer=serializer,
            allowed_origins=[], session_timeout=int(bot.get("maxCallMinutes", 8)) * 60 + 120,
        ),
    )
    if is_test:
        async def notify(message: dict[str, Any]):
            await transport.output().queue_frame(OutputTransportMessageUrgentFrame(message=message))
        conversation.notify = notify
    else:
        async def request_transfer(request: dict[str, Any]):
            return await crm.transfer(conversation.session_id, request)

        def handed_over():
            # Plivo now runs the call for the person being rung; ending the pipeline mustn't hang it up.
            if hasattr(serializer, "_hangup_attempted"):
                serializer._hangup_attempted = True

        conversation.request_transfer = request_transfer
        conversation.handed_over = handed_over

    llm, labels = make_llms(bot["ai"], keys, build_system_prompt(bot, conversation.language.current))
    conversation.ai_label = labels[llm.active_llm]
    conversation.classify_llm = llm
    stt = GroqWhisperSTT(api_key=keys["groq"], prompt=whisper_prompt(bot), current_language=lambda: conversation.language.current)
    tts = make_tts(bot, keys, conversation.language.current, output_rate)

    context = LLMContext(tools=conversation.tools())
    conversation.context = context
    user_turns, assistant_turns = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=VAD_STOP_SECONDS)),
            user_turn_strategies=UserTurnStrategies(stop=[TurnAnalyzerUserTurnStopStrategy(
                turn_analyzer=LocalSmartTurnAnalyzerV3(params=SmartTurnParams(stop_secs=UNSURE_TURN_WAIT_SECONDS)),
            )]),
            user_idle_timeout=float(bot.get("silenceSeconds", 8)),
        ),
    )
    gate = ScriptGate(conversation)
    mouth = Mouth(conversation, output_rate)
    conversation.mouth = mouth

    async def on_language_change(language: str):
        await gate.set_language(language)
        voice = bot["voices"][language]
        await mouth.set_voice(voice_settings(voice["provider"], voice["voice"], language))

    follower = LanguageFollower(conversation, on_language_change)

    pipeline = Pipeline([transport.input(), stt, follower, user_turns, gate, llm, mouth, tts, transport.output(), assistant_turns])

    cap_switch = {"pending": False}

    async def on_claude_cap():
        groq = next((service for service in llm.llms if not isinstance(service, AnthropicLLMService)), None)
        if groq and isinstance(llm.active_llm, AnthropicLLMService):
            cap_switch["pending"] = True
            await worker.queue_frame(ManuallySwitchServiceFrame(service=groq))

    usage = UsageReporter(crm, conversation.session_id, on_claude_cap)
    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(audio_in_sample_rate=input_rate, audio_out_sample_rate=output_rate, enable_metrics=True, enable_usage_metrics=True),
        observers=[TurnObserver(conversation, lambda item: usage.add(item), vad_stop_seconds=VAD_STOP_SECONDS)],
        enable_rtvi=False,
        idle_timeout_secs=180,
    )

    @llm.strategy.event_handler("on_service_switched")
    async def on_service_switched(strategy, service):
        conversation.ai_label = labels.get(service, conversation.ai_label)
        by_cap = cap_switch["pending"]
        cap_switch["pending"] = False
        await conversation.add_event("ai_switched", to=conversation.ai_label, reason="budget" if by_cap else "error")
        if not by_cap and not conversation.ending:
            await worker.queue_frame(LLMRunFrame())  # the failed turn is answered again

    for service in llm.llms:
        if isinstance(service, AnthropicLLMService):
            # Anthropic reports a slow first token as an event, not an error; treat it as one.
            @service.event_handler("on_completion_timeout")
            async def on_timeout(failed_service):
                await failed_service.push_error(error_msg="Claude didn't start replying in time")

    @transport.event_handler("on_client_connected")
    async def on_connected(_transport, _client):
        await conversation.add_event("connected", ai=conversation.ai_label, voice=bot["voices"][conversation.language.current]["voice"], paid_voice=bool(bot.get("voicePaid")))
        await conversation.start()

    @transport.event_handler("on_client_disconnected")
    async def on_disconnected(_transport, _client):
        if not conversation.outcome:
            conversation.outcome = "hung_up"
        await worker.cancel(reason="caller hung up")

    @user_turns.event_handler("on_user_turn_stopped")
    async def on_user_turn(_aggregator, _strategy, message):
        await conversation.add_transcript("caller", getattr(message, "content", "") or "", conversation.language.last_detected)

    @assistant_turns.event_handler("on_assistant_turn_stopped")
    async def on_bot_turn(_aggregator, message):
        await conversation.add_transcript("bot", getattr(message, "content", "") or "", conversation.language.current, bool(getattr(message, "interrupted", False)))

    @user_turns.event_handler("on_user_turn_idle")
    async def on_idle(_aggregator):
        if conversation.ending:
            return
        conversation.silence_count += 1
        if conversation.silence_count <= 2:
            await conversation.say_line("checkIn")
        else:
            await conversation.finish("no_response", say_closing=False, line="silenceGoodbye")

    async def time_limit():
        await asyncio.sleep(int(bot.get("maxCallMinutes", 8)) * 60)
        if not conversation.ending:
            await conversation.add_event("time_limit")
            await conversation.finish("other", say_closing=False, line="timeUp")

    async def flush_usage():
        while True:
            await asyncio.sleep(USAGE_FLUSH_SECONDS)
            await usage.flush()

    background = [asyncio.create_task(time_limit()), asyncio.create_task(flush_usage())]
    runner = WorkerRunner(handle_sigint=False)
    try:
        await runner.add_workers(worker)
        await runner.run()
    except Exception as error:  # report what went wrong rather than losing the conversation
        logger.exception(f"Conversation {conversation.session_id} failed")
        error_message = f"{type(error).__name__}: {error}"[:500]
    finally:
        for task in background:
            task.cancel()
        await usage.close()
        status = "FAILED" if error_message else "ENDED"
        if not await crm.end(conversation.session_id, conversation.report(status, error_message)):
            logger.error(f"Conversation {conversation.session_id} ended, but the CRM didn't take the report")
