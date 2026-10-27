"""Unit tests: language following, the prompt, field answers, tools, fixed steps and signing."""

import asyncio
from types import SimpleNamespace

import pytest

from app.conversation import Conversation, match_option, normalize_field_value
from app.crm import sign
from app.language import ReplyLanguage, detect, requested
from app.prompt import build_system_prompt

# The same vector is checked by tests/voice-bot-service.test.ts on the CRM side.
SIGNATURE_VECTOR = "t=1793000000,v1=142f5b7111cd85fefb36d4b5224596f61d4eb97cd1101ca3c28643d685d2bfdc"


def bot(**overrides):
    base = {
        "botName": "Admissions follow-up",
        "languages": ["hi", "en"],
        "startLanguage": "hi",
        "voiceGender": "female",
        "persona": "Priya from the admissions team.",
        "goal": "Find the preferred intake and budget.",
        "rules": "Never discuss competitors.",
        "endRule": "",
        "openingLine": "Namaste Asha ji!",
        "closingLine": "Dhanyavaad!",
        "fixedSteps": {"before": [], "after": []},
        "transfer": {"enabled": True, "rule": "the caller wants to apply"},
        "fields": [
            {"key": "intake", "label": "Preferred intake", "type": "DROPDOWN", "options": ["January 2027", "July 2027"], "question": "Which intake?", "mustAsk": True, "confirm": False},
            {"key": "budget", "label": "Budget", "type": "NUMBER", "options": [], "question": "", "mustAsk": False, "confirm": True},
        ],
        "caller": {"details": {"lead.name": "Asha Rao", "owner.name": "Ravi"}},
        "lines": {
            "hi": {"fillers": ["हाँ जी।"], "checkIn": "हैलो?", "silenceGoodbye": "बाद में।", "timeUp": "समय।", "problem": "दिक्कत।", "transfer": "जोड़ रही हूँ।", "noOneFree": "कोई नहीं।"},
            "en": {"fillers": ["Sure."], "checkIn": "Hello?", "silenceGoodbye": "Later.", "timeUp": "Time.", "problem": "Problem.", "transfer": "Connecting.", "noOneFree": "Nobody free."},
        },
        "maxCallMinutes": 8,
        "silenceSeconds": 8,
    }
    base.update(overrides)
    return base


class FakeMouth:
    def __init__(self):
        self.said: list[tuple[str, str | None]] = []
        self.ended = False

    async def say(self, text, *, audio_id=None, language=None):
        self.said.append((text, audio_id))

    async def play_recorded(self, audio_id, text, language, *, record=True):
        self.said.append((text, audio_id))
        return True

    async def end_call(self):
        self.ended = True


def conversation(kind="TEST", **overrides):
    convo = Conversation({"sessionId": "s1", "kind": kind, "bot": bot(**overrides), "keys": {}, "audio": {}}, sample_rate=24000)
    convo.mouth = FakeMouth()
    return convo


class Params(SimpleNamespace):
    async def result_callback(self, result, properties=None):
        self.result = result
        self.properties = properties


# ---- Language --------------------------------------------------------------------------------
def test_detects_hindi_hinglish_and_english():
    assert detect("मुझे MBA के बारे में जानना है") == "hi"
    assert detect("haan ji mujhe fees batana") == "hi"
    assert detect("I want to know about the MBA fees") == "en"
    assert detect("main") == "en"  # an English word on its own isn't Hindi
    assert detect("theek hai") == "hi"


def test_follows_after_two_turns_or_when_asked():
    reply = ReplyLanguage(["hi", "en"], "hi")
    assert reply.observe("What are the fees for the MBA programme?") is False
    assert reply.current == "hi"
    assert reply.observe("And when does the next batch start?") is True
    assert reply.current == "en"
    assert reply.observe("haan ji theek hai") is False  # one Hindi turn isn't enough
    assert reply.observe("please speak in hindi") is True
    assert reply.current == "hi"
    assert requested("can you talk in English") == "en"


def test_stays_in_the_only_language():
    reply = ReplyLanguage(["en"], "hi")
    assert reply.current == "en"
    assert reply.observe("haan ji mujhe batao") is False
    assert reply.observe("kya fees hai") is False
    assert reply.current == "en"


# ---- Prompt ----------------------------------------------------------------------------------
def test_prompt_has_the_bot_and_caller_and_stable_prefix():
    hindi = build_system_prompt(bot(), "hi")
    english = build_system_prompt(bot(), "en")
    assert "Priya from the admissions team." in hindi and "Never discuss competitors." in hindi
    assert 'key "intake"' in hindi and "allowed answers: January 2027; July 2027" in hindi and "must ask" in hindi
    assert "- lead.name: Asha Rao" in hindi
    assert "transfer_to_person when the caller wants to apply" in hindi
    assert "Don't say goodbye yourself" in hindi  # a closing line is set
    assert "Devanagari" in hindi and "feminine" in hindi and "Devanagari" not in english
    # Only the language note at the end differs, so the cached prefix is reused.
    prefix = hindi.split("Language:")[0]
    assert english.startswith(prefix)


def test_prompt_without_transfer_or_closing():
    text = build_system_prompt(bot(transfer={"enabled": False}, closingLine=""), "en")
    assert "Handing over to a person isn't possible" in text
    assert "say goodbye in one short sentence" in text


# ---- Field answers ---------------------------------------------------------------------------
def test_field_answers_are_cleaned_per_type():
    dropdown = {"type": "DROPDOWN", "options": ["January 2027", "July 2027"]}
    assert normalize_field_value(dropdown, "july 2027") == ("July 2027", None)
    assert normalize_field_value(dropdown, "July")[0] == "July 2027"
    assert normalize_field_value(dropdown, "March")[0] is None
    assert normalize_field_value({"type": "NUMBER"}, "₹2,50,000") == (250000, None)
    assert normalize_field_value({"type": "NUMBER"}, 1.5) == (1.5, None)
    assert normalize_field_value({"type": "BOOLEAN"}, "haan") == (True, None)
    assert normalize_field_value({"type": "DATE"}, "2027-01-15") == ("2027-01-15", None)
    assert normalize_field_value({"type": "DATE"}, "next week")[0] is None
    multi = {"type": "MULTI_SELECT", "options": ["Online", "Weekend", "Regular"]}
    assert normalize_field_value(multi, "weekend and online") == (["Online", "Weekend"], None)
    assert match_option("both", ["January 2027", "July 2027"]) is None


# ---- Tools -----------------------------------------------------------------------------------
def test_set_field_saves_or_explains():
    convo = conversation()
    params = Params(arguments={"key": "intake", "value": "january"})
    asyncio.run(convo._tool_set_field(params))
    assert params.result == {"saved": True, "value": "January 2027"}
    assert convo.fields == {"intake": "January 2027"}
    wrong = Params(arguments={"key": "intake", "value": "March"})
    asyncio.run(convo._tool_set_field(wrong))
    assert wrong.result["saved"] is False and "January 2027" in wrong.result["problem"]
    unknown = Params(arguments={"key": "colour", "value": "red"})
    asyncio.run(convo._tool_set_field(unknown))
    assert unknown.result["saved"] is False


def test_end_call_asks_for_must_ask_fields_once():
    convo = conversation()
    first = Params(arguments={"outcome": "interested"})
    asyncio.run(convo._tool_end_call(first))
    assert first.result["ended"] is False and "Preferred intake" in first.result["problem"]
    assert convo.mouth.ended is False
    second = Params(arguments={"outcome": "interested"})
    asyncio.run(convo._tool_end_call(second))
    assert second.result == {"ended": True}
    assert convo.mouth.ended and convo.outcome == "interested"
    assert convo.mouth.said[-1] == ("Dhanyavaad!", "closing")


def test_wrong_number_ends_at_once_and_transfer_ends_with_hold_line():
    convo = conversation()
    asyncio.run(convo._tool_end_call(Params(arguments={"outcome": "wrong_number"})))
    assert convo.mouth.ended and convo.outcome == "wrong_number"
    transfer = conversation()
    asyncio.run(transfer._tool_transfer(Params(arguments={"reason": "wants to apply"})))
    assert transfer.outcome == "transferred" and transfer.mouth.ended
    assert transfer.mouth.said[-1] == ("जोड़ रही हूँ।", "transfer.hi")
    assert [event["type"] for event in transfer.events][:1] == ["transfer_requested"]


def test_transfer_tool_only_when_enabled():
    names = lambda convo: [tool.name for tool in convo.tools().standard_tools]
    assert "transfer_to_person" in names(conversation())
    assert "transfer_to_person" not in names(conversation(transfer={"enabled": False}))


# ---- Fixed steps -----------------------------------------------------------------------------
def test_fixed_steps_before_and_after():
    steps = {
        "before": [
            {"id": "a", "kind": "say", "text": "This call may be recorded.", "fieldKey": None, "onAnswer": []},
            {"id": "b", "kind": "ask", "text": "Is this a good time?", "fieldKey": None, "onAnswer": [{"equals": "No", "action": "end"}, {"equals": "Yes", "action": "continue"}]},
        ],
        "after": [{"id": "c", "kind": "say", "text": "You'll get an SMS.", "fieldKey": None, "onAnswer": []}],
    }
    convo = conversation(fixedSteps=steps)
    asyncio.run(convo.start())
    assert [audio for _, audio in convo.mouth.said] == ["opening", "step.a", "step.b"]
    assert convo.script_waiting
    forward = asyncio.run(convo.handle_script_answer("yes"))
    assert forward is True and convo.script_phase is None and not convo.script_waiting
    asyncio.run(convo.finish("interested"))
    assert [audio for _, audio in convo.mouth.said][-2:] == ["step.c", "closing"]
    assert convo.mouth.ended

    refusing = conversation(fixedSteps=steps)
    asyncio.run(refusing.start())
    assert asyncio.run(refusing.handle_script_answer("No")) is False
    assert refusing.outcome == "not_interested" and refusing.mouth.ended


def test_ask_step_saves_its_field():
    steps = {"before": [{"id": "q", "kind": "ask", "text": "Which intake?", "fieldKey": "intake", "onAnswer": []}], "after": []}
    convo = conversation(fixedSteps=steps)
    asyncio.run(convo.start())
    asyncio.run(convo.handle_script_answer("July 2027 please"))
    assert convo.fields == {"intake": "July 2027"}


# ---- Signing ---------------------------------------------------------------------------------
def test_signature_matches_the_crm():
    assert sign("test-secret-0123456789abcdef0123456789", "POST", "/api/internal/voice-bot/sessions/claim", '{"token":"abc"}', 1793000000) == SIGNATURE_VECTOR


def test_phone_call_transfer_hands_the_call_over(monkeypatch):
    import app.conversation as module

    async def no_wait(_seconds):
        return None

    monkeypatch.setattr(module.asyncio, "sleep", no_wait)
    convo = conversation(kind="CALL")
    requests, handed = [], []

    async def request_transfer(request):
        requests.append(request)
        return {"ok": True, "people": 2}

    convo.request_transfer = request_transfer
    convo.handed_over = lambda: handed.append(True)
    asyncio.run(convo._tool_transfer(Params(arguments={"reason": "wants to apply"})))
    assert convo.mouth.said[-1] == ("जोड़ रही हूँ।", "transfer.hi")
    assert requests and requests[0]["reason"] == "wants to apply"
    assert handed == [True] and convo.outcome == "transferred"
    assert convo.mouth.ended is False  # Plivo now runs the call; the bot doesn't hang up
    assert [event["type"] for event in convo.events] == ["transfer_requested", "transferred"]


def test_phone_call_transfer_with_nobody_free_books_a_callback(monkeypatch):
    import app.conversation as module

    async def no_wait(_seconds):
        return None

    monkeypatch.setattr(module.asyncio, "sleep", no_wait)
    convo = conversation(kind="CALL")

    async def request_transfer(_request):
        return {"ok": False, "reason": "no_one_to_ring"}

    convo.request_transfer = request_transfer
    asyncio.run(convo._tool_transfer(Params(arguments={"reason": "asked for a person"})))
    assert convo.outcome == "callback" and convo.mouth.ended
    assert convo.mouth.said[-1] == ("कोई नहीं।", "noOneFree.hi")
    assert "transfer_failed" in [event["type"] for event in convo.events]



def test_usage_is_sent_per_provider_kind_and_model():
    from app.bot import UsageReporter

    sent: list[dict] = []

    class FakeCrm:
        async def usage(self, session_id, payload):
            sent.append(payload)
            return {"ok": True, "claudeCapReached": False}

    async def run():
        reporter = UsageReporter(FakeCrm(), "s1", lambda: None)
        reporter.add({"provider": "groq", "kind": "chat", "model": "openai/gpt-oss-20b", "inputTokens": 100, "outputTokens": 20, "requests": 1})
        reporter.add({"provider": "groq", "kind": "chat", "model": "openai/gpt-oss-20b", "inputTokens": 50, "outputTokens": 10, "requests": 1})
        reporter.add({"provider": "groq", "kind": "stt", "audioSeconds": 2.345, "requests": 1})
        reporter.add({"provider": "google", "kind": "tts", "characters": 40, "requests": 1})
        await reporter.close()

    asyncio.run(run())
    by_kind = {(item["provider"], item.get("kind")): item for item in sent}
    assert by_kind[("groq", "chat")] == {"provider": "groq", "kind": "chat", "model": "openai/gpt-oss-20b", "inputTokens": 150, "outputTokens": 30, "requests": 2}
    assert by_kind[("groq", "stt")] == {"provider": "groq", "kind": "stt", "audioSeconds": 2.35, "requests": 1}
    assert by_kind[("google", "tts")]["characters"] == 40
