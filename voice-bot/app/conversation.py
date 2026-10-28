"""One conversation's state: transcript, fields, events, the tools the AI can call, and the fixed
steps said exactly as written (voice bot plan §4.4, decisions 10, 19, 20, 21).

The pipeline pieces (processors.py) call into this object; it speaks through the Mouth and ends
the call through it too.
"""

import asyncio
import base64
import re
import time
from datetime import date
from typing import TYPE_CHECKING, Any

from loguru import logger
from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.frames.frames import FunctionCallResultProperties
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.services.llm_service import FunctionCallParams

from .knowledge import KnowledgeIndex
from .language import ReplyLanguage
from .fillers import FillerRotation

if TYPE_CHECKING:
    from .processors import Mouth

OUTCOMES = ["interested", "not_interested", "callback", "transferred", "wrong_number", "do_not_call", "no_response", "other"]
# Set by the service, not the AI: the caller hung up before the bot ended the call.
HUNG_UP = "hung_up"
YES = {"yes", "y", "true", "haan", "haanji", "han", "ji", "ha", "sure", "ok", "okay", "हाँ", "हां", "जी"}
NO = {"no", "n", "false", "nahi", "nahin", "nai", "na", "नहीं", "ना"}


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\sऀ-ॿ]", " ", str(text).lower())).strip()


def match_option(value: str, options: list[str]) -> str | None:
    """The allowed answer `value` means, if it clearly means one."""
    wanted = _norm(value)
    if not wanted:
        return None
    for option in options:
        if _norm(option) == wanted:
            return option
    contained = [option for option in options if _norm(option) and (_norm(option) in wanted or wanted in _norm(option))]
    return contained[0] if len(contained) == 1 else None


def normalize_field_value(field: dict[str, Any], value: Any) -> tuple[Any, str | None]:
    """(value to save, problem). A problem goes back to the AI so it can ask again."""
    kind = str(field.get("type") or "TEXT").upper()
    options = [str(option) for option in field.get("options") or []]
    if value is None or (isinstance(value, str) and not value.strip()):
        return None, "The value is empty."
    if kind == "DROPDOWN":
        matched = match_option(str(value), options)
        return (matched, None) if matched else (None, "Use one of the allowed answers: " + "; ".join(options))
    if kind == "MULTI_SELECT":
        items = value if isinstance(value, list) else re.split(r"[,;]| and | aur ", str(value))
        matched = [match_option(str(item), options) for item in items if str(item).strip()]
        if not matched or any(item is None for item in matched):
            return None, "Use only the allowed answers: " + "; ".join(options)
        return sorted(set(matched), key=options.index), None
    if kind == "NUMBER":
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return value, None
        digits = re.sub(r"[^\d.]", "", str(value))
        try:
            number = float(digits)
            return (int(number) if number.is_integer() else number), None
        except ValueError:
            return None, "Give the number in digits, for example 250000."
    if kind == "BOOLEAN":
        if isinstance(value, bool):
            return value, None
        text = _norm(str(value))
        if text in YES:
            return True, None
        if text in NO:
            return False, None
        return None, "Give true or false."
    if kind == "DATE":
        try:
            return date.fromisoformat(str(value).strip()[:10]).isoformat(), None
        except ValueError:
            return None, "Give the date as YYYY-MM-DD."
    text = str(value).strip()
    return text[: 2000 if kind == "TEXTAREA" else 500], None


class Conversation:
    def __init__(self, claim: dict[str, Any], *, sample_rate: int):
        self.session_id: str = claim["sessionId"]
        self.kind: str = claim.get("kind", "TEST")
        self.bot: dict[str, Any] = claim["bot"]
        self.keys: dict[str, Any] = claim.get("keys") or {}
        self.sample_rate = sample_rate
        self.audio: dict[str, bytes] = {}
        for audio_id, encoded in (claim.get("audio") or {}).items():
            try:
                self.audio[audio_id] = base64.b64decode(encoded)
            except Exception:
                logger.warning(f"Recorded line {audio_id} couldn't be decoded")
        self.language = ReplyLanguage(self.bot.get("languages") or ["hi"], self.bot.get("startLanguage") or "hi")
        self.fields_by_key = {field["key"]: field for field in self.bot.get("fields", [])}
        self.knowledge = KnowledgeIndex(claim.get("knowledge") or [])
        self.started = time.monotonic()
        self.transcript: list[dict[str, Any]] = []
        self.turns: list[dict[str, Any]] = []
        self.events: list[dict[str, Any]] = []
        self.fields: dict[str, Any] = {}
        self.outcome: str | None = None
        self.ending = False
        self.end_call_attempts = 0
        self.silence_count = 0
        self.filler_rotation = FillerRotation()
        self.ai_label: str | None = None
        self.context: LLMContext | None = None
        self.mouth: "Mouth | None" = None
        self.classify_llm = None  # set by the bot: an LLM for one-off answers (fixed steps)
        self.notify = None  # coroutine(dict) for the browser test call, None on phone calls
        # Phone calls (wave E): asks the CRM to ring a person; and stops the service hanging up
        # a call that has been handed over.
        self.request_transfer = None  # coroutine(dict) -> dict | None
        self.handed_over = None  # callable()
        # Fixed steps (decision 20): phase "before" runs after the opening, "after" before the closing.
        self.script_phase: str | None = None
        self.script_steps: list[dict[str, Any]] = []
        self.script_index = 0
        self.script_waiting = False

    # ---- Record keeping ------------------------------------------------------------------------
    def at(self) -> float:
        return round(time.monotonic() - self.started, 2)

    async def send(self, message: dict[str, Any]):
        if self.notify:
            try:
                await self.notify(message)
            except Exception as error:
                logger.debug(f"Browser message not sent: {error}")

    async def add_transcript(self, role: str, text: str, language: str | None = None, interrupted: bool = False):
        text = (text or "").strip()
        if not text:
            return
        entry = {"role": role, "text": text[:4000], "language": language, "at": self.at(), "interrupted": interrupted}
        self.transcript.append(entry)
        await self.send({"type": "transcript", **entry})

    async def add_event(self, kind: str, **detail: Any):
        entry = {"type": kind, "at": self.at(), "detail": detail}
        self.events.append(entry)
        await self.send({"type": "event", "event": kind, "detail": detail, "at": entry["at"]})

    def report(self, status: str = "ENDED", error: str | None = None) -> dict[str, Any]:
        return {
            "status": status,
            "outcome": self.outcome,
            "durationSeconds": int(self.at()),
            "error": error,
            "transcript": self.transcript[-600:],
            "turns": self.turns[-600:],
            "events": self.events[-300:],
            "fields": self.fields,
        }

    # ---- Speaking -----------------------------------------------------------------------------
    def line(self, name: str) -> str:
        return self.bot["lines"][self.language.current][name]

    async def say_line(self, name: str):
        """A built-in line (check-in, time up, ...) in the current language."""
        language = self.language.current
        await self.mouth.say(self.bot["lines"][language][name], audio_id=f"{name}.{language}", language=language)

    async def say_filler(self):
        language = self.language.current
        fillers = self.bot["lines"][language]["fillers"]
        index = self.filler_rotation.choose(language, len(fillers), time.monotonic())
        if index is None:
            return
        await self.mouth.play_recorded(f"filler.{language}.{index}", fillers[index], language, record=False)

    # ---- Starting and ending ------------------------------------------------------------------
    async def start(self):
        await self.mouth.say(self.bot["openingLine"], audio_id="opening", language=self.bot.get("startLanguage"))
        if self.bot.get("fixedSteps", {}).get("before"):
            await self.start_script("before")

    async def finish(self, outcome: str | None = None, *, say_closing: bool = True, line: str | None = None):
        """Ends the call after what's being said, the after-steps and the closing line."""
        if outcome and not self.outcome:
            self.outcome = outcome
        if self.ending:
            return
        if self.script_phase != "after" and self.bot.get("fixedSteps", {}).get("after") and say_closing and line is None:
            await self.start_script("after")
            return
        self.ending = True
        if line:
            await self.say_line(line)
        elif say_closing and (self.bot.get("closingLine") or "").strip():
            await self.mouth.say(self.bot["closingLine"], audio_id="closing", language=self.bot.get("startLanguage"))
        await self.add_event("ended", outcome=self.outcome or "other")
        await self.mouth.end_call()

    # ---- Fixed steps --------------------------------------------------------------------------
    async def start_script(self, phase: str):
        self.script_phase = phase
        self.script_steps = list(self.bot.get("fixedSteps", {}).get(phase) or [])
        self.script_index = 0
        await self._advance_script()

    async def _advance_script(self):
        while self.script_index < len(self.script_steps):
            step = self.script_steps[self.script_index]
            await self.mouth.say(step["text"], audio_id=f"step.{step['id']}", language=self.bot.get("startLanguage"))
            if step.get("kind") == "ask":
                self.script_waiting = True
                return
            self.script_index += 1
        self.script_waiting = False
        phase, self.script_phase = self.script_phase, None
        if phase == "after":
            self.script_phase = "after"  # keeps finish() from starting the after-steps again
            await self.finish()

    async def handle_script_answer(self, answer: str) -> bool:
        """The caller answered an "ask" step. True when the AI should now reply to the answer."""
        step = self.script_steps[self.script_index]
        self.script_waiting = False
        action = "continue"
        field = self.fields_by_key.get(step.get("fieldKey") or "")
        rules = step.get("onAnswer") or []
        if field or rules:
            choices = [rule["equals"] for rule in rules]
            options = list(field.get("options") or []) if field else []
            meaning = await self._interpret(step["text"], answer, choices or options)
            if field:
                raw = meaning if (meaning and options) else (await self._extract(step["text"], answer, field) or answer)
                value, problem = normalize_field_value(field, raw)
                if value is not None and not problem:
                    self.fields[field["key"]] = value
                    await self.add_event("field_saved", key=field["key"], label=field["label"], value=value, step=step["id"])
            for rule in rules:
                if meaning and _norm(rule["equals"]) == _norm(meaning):
                    action = rule["action"]
                    break
        await self.add_event("step_answered", step=step["id"], action=action)
        if action == "end":
            self.script_phase = None
            await self.finish("not_interested")
            return False
        if action == "transfer":
            self.script_phase = None
            await self.transfer("asked during a fixed step")
            return False
        self.script_index += 1
        before_end = self.script_phase == "before"
        await self._advance_script()
        # When the before-steps are done right after an answer, the AI takes over by replying to it.
        return before_end and self.script_phase is None and not self.ending

    async def _ask_llm(self, instruction: str) -> str | None:
        if not self.classify_llm:
            return None
        try:
            context = LLMContext(messages=[{"role": "user", "content": instruction}])
            reply = await asyncio.wait_for(self.classify_llm.run_inference(context=context, max_tokens=40), timeout=4)
            return (reply or "").strip().strip('"').strip() or None
        except Exception as error:
            logger.warning(f"Answer check failed: {error}")
            return None

    async def _interpret(self, question: str, answer: str, choices: list[str]) -> str | None:
        if not choices:
            return None
        direct = match_option(answer, choices)
        if direct:
            return direct
        reply = await self._ask_llm(
            f'On a phone call the caller was asked: "{question}". They answered: "{answer}". '
            f"Which of these does the answer mean: {' | '.join(choices)}? Reply with exactly one of them, or NONE."
        )
        return match_option(reply, choices) if reply and reply.upper() != "NONE" else None

    async def _extract(self, question: str, answer: str, field: dict[str, Any]) -> str | None:
        kind = str(field.get("type") or "TEXT").upper()
        shape = {"NUMBER": "digits only", "DATE": "a date as YYYY-MM-DD", "BOOLEAN": "true or false"}.get(kind, "the answer itself, short")
        reply = await self._ask_llm(
            f'On a phone call the caller was asked: "{question}". They answered: "{answer}". '
            f"Reply with {shape}, or NONE if they didn't answer it. Today is {date.today().isoformat()}."
        )
        return None if not reply or reply.upper() == "NONE" else reply

    # ---- Transfer -----------------------------------------------------------------------------
    def line_seconds(self, name: str) -> float:
        audio = self.audio.get(f"{name}.{self.language.current}")
        return len(audio) / (self.sample_rate * 2) if audio else 3.0

    async def transfer(self, reason: str):
        await self.add_event("transfer_requested", reason=reason, test=self.kind == "TEST")
        if self.kind == "TEST" or not self.request_transfer:
            # A browser test stops at the hand-over.
            await self.finish("transferred", say_closing=False, line="transfer")
            return
        # A phone call: say the hold line, then the CRM moves the call to the lead owner, then
        # the team (decision 3). The bot's audio stops when Plivo takes the call over.
        self.ending = True
        await self.say_line("transfer")
        await asyncio.sleep(self.line_seconds("transfer") + 0.4)
        result = None
        try:
            result = await self.request_transfer({"reason": reason, "transcript": self.transcript[-40:], "fields": self.fields})
        except Exception as error:
            logger.warning(f"Transfer request failed: {error}")
        if result and result.get("ok"):
            self.outcome = "transferred"
            if self.handed_over:
                self.handed_over()
            await self.add_event("transferred", people=result.get("people", 0))
            return
        await self.add_event("transfer_failed", reason=(result or {}).get("reason", "unavailable"))
        self.ending = False
        await self.finish("callback", say_closing=False, line="noOneFree")

    # ---- Tools the AI can call ----------------------------------------------------------------
    def tools(self) -> ToolsSchema:
        field_keys = list(self.fields_by_key)
        tools = [
            FunctionSchema(
                name="set_field",
                description="Save an answer the caller gave for one of the fields to find out. Numbers in digits (250000), dates as YYYY-MM-DD, yes/no as true/false, list answers exactly as allowed.",
                properties={
                    "key": {"type": "string", "enum": field_keys} if field_keys else {"type": "string"},
                    "value": {"description": "The answer to save."},
                },
                required=["key", "value"],
                handler=self._tool_set_field,
            ),
            FunctionSchema(
                name="search_knowledge",
                description="Look up a fact (fees, dates, eligibility, courses, process) before stating it.",
                properties={"question": {"type": "string", "description": "What the caller wants to know, as a short search query in English, even if they spoke Hindi."}},
                required=["question"],
                handler=self._tool_search_knowledge,
            ),
            FunctionSchema(
                name="book_callback",
                description="Book a call back from the team at a time the caller chose.",
                properties={"when": {"type": "string", "description": "The time the caller asked for, as they said it."}, "note": {"type": "string"}},
                required=["when"],
                handler=self._tool_book_callback,
            ),
            FunctionSchema(
                name="stop_bot_calls",
                description="The caller doesn't want calls from the bot. Stops further bot calls to this number; people can still call.",
                properties={},
                required=[],
                handler=self._tool_stop_bot_calls,
            ),
            FunctionSchema(
                name="end_call",
                description="End the call.",
                properties={"outcome": {"type": "string", "enum": OUTCOMES}},
                required=["outcome"],
                handler=self._tool_end_call,
            ),
        ]
        if (self.bot.get("transfer") or {}).get("enabled"):
            tools.append(
                FunctionSchema(
                    name="transfer_to_person",
                    description="Hand the caller to a person from the team.",
                    properties={"reason": {"type": "string", "description": "Why, in a few words."}},
                    required=["reason"],
                    handler=self._tool_transfer,
                )
            )
        return ToolsSchema(standard_tools=tools)

    async def _tool_set_field(self, params: FunctionCallParams):
        key = str(params.arguments.get("key") or "")
        field = self.fields_by_key.get(key)
        if not field:
            await params.result_callback({"saved": False, "problem": f"Unknown field. Use one of: {', '.join(self.fields_by_key) or 'none'}."})
            return
        value, problem = normalize_field_value(field, params.arguments.get("value"))
        if problem:
            await params.result_callback({"saved": False, "problem": problem})
            return
        self.fields[key] = value
        await self.add_event("field_saved", key=key, label=field["label"], value=value)
        await params.result_callback({"saved": True, "value": value}, properties=FunctionCallResultProperties(run_llm=True))

    async def _tool_search_knowledge(self, params: FunctionCallParams):
        question = str(params.arguments.get("question") or "")[:300]
        started = time.monotonic()
        found = await asyncio.to_thread(self.knowledge.search, question) if len(self.knowledge) else []
        await self.add_event("knowledge_searched", question=question, found=bool(found), sources=sorted({item["source"] for item in found}), searchMs=round((time.monotonic() - started) * 1000))
        if not found:
            await params.result_callback({
                "found": False,
                "instruction": "No answer is on record. Don't guess: say someone from the team will confirm, and offer a callback.",
            })
            return
        await params.result_callback({
            "found": True,
            "passages": [{"text": item["text"], "source": item["source"]} for item in found],
            "instruction": "Answer only from these passages, in the caller's language, in a sentence or two. If they don't answer the question, say someone from the team will confirm and offer a callback.",
        })

    async def _tool_book_callback(self, params: FunctionCallParams):
        when = str(params.arguments.get("when") or "")[:120]
        note = str(params.arguments.get("note") or "")[:300]
        await self.add_event("callback_booked", when=when, note=note)
        if not self.outcome:
            self.outcome = "callback"
        await params.result_callback({"booked": True, "say": "Confirm the time back to the caller in one short sentence."})

    async def _tool_stop_bot_calls(self, params: FunctionCallParams):
        await self.add_event("stop_bot_calls")
        self.outcome = "do_not_call"
        await params.result_callback({"stopped": True, "say": "Apologise briefly, then call end_call with outcome do_not_call."})

    async def _tool_end_call(self, params: FunctionCallParams):
        outcome = str(params.arguments.get("outcome") or "other")
        outcome = outcome if outcome in OUTCOMES else "other"
        self.end_call_attempts += 1
        missing = [field["label"] for key, field in self.fields_by_key.items() if field.get("mustAsk") and key not in self.fields]
        if missing and self.end_call_attempts == 1 and outcome not in ("wrong_number", "do_not_call", "not_interested"):
            await params.result_callback({
                "ended": False,
                "problem": "Before ending, try once to find out: " + ", ".join(missing) + ". If the caller refuses or wants to stop, call end_call again.",
            })
            return
        await params.result_callback({"ended": True}, properties=FunctionCallResultProperties(run_llm=False))
        await self.finish(outcome)

    async def _tool_transfer(self, params: FunctionCallParams):
        reason = str(params.arguments.get("reason") or "")[:200]
        await params.result_callback({"transferring": True}, properties=FunctionCallResultProperties(run_llm=False))
        await self.transfer(reason)
