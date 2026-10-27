"""The providers a conversation uses: Groq Whisper to hear, Groq or Claude to talk (with instant
failover, decision 28), and Google or Azure to speak (decision 7, 33)."""

from typing import Any

from google.api_core.client_options import ClientOptions
from google.cloud import texttospeech_v1
from loguru import logger
from pipecat.frames.frames import ErrorFrame
from pipecat.pipeline.llm_switcher import LLMSwitcher
from pipecat.pipeline.service_switcher import ServiceSwitcherStrategyManual
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.services.anthropic.llm import AnthropicLLMService
from pipecat.services.azure.tts import AzureTTSService
from pipecat.services.google.tts import GoogleTTSService
from pipecat.services.groq.llm import GroqLLMService
from pipecat.services.groq.stt import GroqSTTService

LOCALES = {"hi": "hi-IN", "en": "en-IN"}
WHISPER_MODEL = "whisper-large-v3"
WHISPER_LANGUAGES = {"hindi": "hi", "english": "en"}
REPLY_MAX_TOKENS = 300
FIRST_TOKEN_TIMEOUT_SECONDS = 4.0


class GroqWhisperSTT(GroqSTTService):
    """Groq Whisper that detects Hindi or English per utterance (decision 16).

    Whisper sometimes labels short Hindi as Urdu (and writes it in Urdu script) or as another
    language; such an utterance is transcribed again as the conversation's current language.
    """

    def __init__(self, *, api_key: str, prompt: str | None, current_language: callable, **kwargs):
        super().__init__(api_key=api_key, settings=GroqSTTService.Settings(model=WHISPER_MODEL, prompt=prompt, temperature=0.0), **kwargs)
        self._current_language = current_language
        self._word_prompt = prompt

    async def _transcribe(self, audio: bytes):
        base = {"file": ("audio.wav", audio, "audio/wav"), "model": WHISPER_MODEL, "response_format": "verbose_json", "temperature": 0.0}
        if self._word_prompt:
            base["prompt"] = self._word_prompt
        result = await self._client.audio.transcriptions.create(**base)
        detected = str(getattr(result, "language", "") or "").lower()
        if detected and detected not in WHISPER_LANGUAGES:
            logger.debug(f"Whisper heard {detected}; transcribing again as {self._current_language()}")
            result = await self._client.audio.transcriptions.create(**{**base, "language": self._current_language()})
        return result


def whisper_prompt(bot: dict[str, Any]) -> str:
    """Words Whisper should spell right: names, courses, the allowed answers."""
    words: list[str] = [bot.get("botName", "")]
    details = (bot.get("caller") or {}).get("details") or {}
    for key in ("lead.name", "lead.firstName", "owner.name", "opportunity.title", "opportunity.type"):
        if details.get(key):
            words.append(str(details[key]))
    for field in bot.get("fields", []):
        words.extend(str(option) for option in field.get("options") or [])
    seen: list[str] = []
    for word in words:
        word = word.strip()
        if word and word not in seen:
            seen.append(word)
    return ("Hindi and English phone call. " + ", ".join(seen))[:600]


class FailoverOnAnyError(ServiceSwitcherStrategyManual):
    """Moves to the other AI on any error from the active one, not only fatal ones: a caller
    waiting on the line can't wait for a retry (decision 28)."""

    async def handle_error(self, error: ErrorFrame):
        failed = error.processor or self._active_service
        for candidate in self._services:
            if candidate is not failed and candidate.is_usable:
                logger.warning(f"{failed.name} failed ({error.error}); switching to {candidate.name}")
                return await self._set_active_if_available(candidate)
        return None


def make_llm(option: dict[str, Any], keys: dict[str, Any], system_prompt: str):
    if option["provider"] == "claude":
        if not keys.get("claude"):
            return None
        return AnthropicLLMService(
            api_key=keys["claude"],
            settings=AnthropicLLMService.Settings(
                model=option["model"], system_instruction=system_prompt, enable_prompt_caching=True, max_tokens=REPLY_MAX_TOKENS, temperature=0.4,
            ),
            retry_timeout_secs=FIRST_TOKEN_TIMEOUT_SECONDS,
        )
    if not keys.get("groq"):
        return None
    return GroqLLMService(
        api_key=keys["groq"],
        settings=GroqLLMService.Settings(model=option["model"], system_instruction=system_prompt, reasoning_effort="low", max_tokens=REPLY_MAX_TOKENS, temperature=0.4),
        retry_timeout_secs=FIRST_TOKEN_TIMEOUT_SECONDS,
    )


def make_llms(ai: dict[str, Any], keys: dict[str, Any], system_prompt: str) -> tuple[LLMSwitcher, dict[Any, str]]:
    """The conversation's AI, with its fallback when there is one. Returns the switcher and a
    label per service (for the transcript and reply-time reports)."""
    services: list[Any] = []
    labels: dict[Any, str] = {}
    for option in (ai.get("primary"), ai.get("fallback")):
        if not option:
            continue
        service = make_llm(option, keys, system_prompt)
        if service:
            services.append(service)
            labels[service] = option["label"]
    if not services:
        raise RuntimeError("No AI provider key is available for this conversation")
    return LLMSwitcher(llms=services, strategy_type=FailoverOnAnyError), labels


class ApiKeyGoogleTTS(GoogleTTSService):
    """Google streaming TTS (Chirp 3 HD) with an API key instead of a service account."""

    def __init__(self, *, api_key: str, **kwargs):
        self._api_key = api_key
        super().__init__(**kwargs)

    def _create_client(self, credentials, credentials_path):
        return texttospeech_v1.TextToSpeechAsyncClient(client_options=ClientOptions(api_key=self._api_key))


def voice_settings(provider: str, voice: str, language: str):
    if provider == "azure":
        return AzureTTSService.Settings(voice=voice, language=LOCALES[language])
    return GoogleTTSService.Settings(voice=voice, language=LOCALES[language])


def make_tts(bot: dict[str, Any], keys: dict[str, Any], language: str, sample_rate: int) -> FrameProcessor:
    voice = bot["voices"][language]
    if voice["provider"] == "azure":
        return AzureTTSService(api_key=keys["azure"], region=keys["azureRegion"], sample_rate=sample_rate, settings=voice_settings("azure", voice["voice"], language))
    return ApiKeyGoogleTTS(api_key=keys["google"], sample_rate=sample_rate, settings=voice_settings("google", voice["voice"], language))
