"""The system prompt for a conversation (voice bot plan §4.4).

Everything that stays the same for the whole call comes first, so Groq's and Claude's prompt
caches reuse it on every turn. Only the reply-language note at the end changes, and only when
the caller switches language.
"""

from typing import Any

LANGUAGE_NOTES = {
    "hi": {
        "female": "Reply in Hindi, the way people in India speak on the phone: simple Hindi written in Devanagari, keeping common English words (course, fees, admission, online, MBA, exam) in English letters. You are a woman: use feminine forms for yourself (मैं बता रही हूँ, मैं कर सकती हूँ).",
        "male": "Reply in Hindi, the way people in India speak on the phone: simple Hindi written in Devanagari, keeping common English words (course, fees, admission, online, MBA, exam) in English letters. You are a man: use masculine forms for yourself (मैं बता रहा हूँ, मैं कर सकता हूँ).",
    },
    "en": {
        "female": "Reply in simple Indian English.",
        "male": "Reply in simple Indian English.",
    },
}

LANGUAGE_NAMES = {"hi": "Hindi", "en": "English"}


def _facts(details: dict[str, Any]) -> str:
    if not details:
        return "Nothing is known about the caller beyond this call."
    lines = []
    for key, value in details.items():
        if isinstance(value, (list, tuple)):
            value = ", ".join(str(item) for item in value)
        lines.append(f"- {key}: {value}")
    return "\n".join(lines)


def _fields(fields: list[dict[str, Any]]) -> str:
    if not fields:
        return "There is nothing to record on this call."
    lines = []
    for field in fields:
        parts = [f'- key "{field["key"]}" ({field["label"]}, {field["type"].lower().replace("_", " ")})']
        if field.get("options"):
            parts.append("allowed answers: " + "; ".join(field["options"]))
        if field.get("question"):
            parts.append(f'ask it like: "{field["question"]}"')
        if field.get("mustAsk"):
            parts.append("must ask")
        if field.get("confirm"):
            parts.append("repeat it back and get a yes before saving")
        lines.append(", ".join(parts))
    return "\n".join(lines)


def build_system_prompt(bot: dict[str, Any], reply_language: str) -> str:
    gender = bot.get("voiceGender") or "female"
    languages = " and ".join(LANGUAGE_NAMES[language] for language in bot.get("languages", ["hi"]))
    transfer = bot.get("transfer") or {}
    has_closing = bool((bot.get("closingLine") or "").strip())
    sections = [
        f"You are the voice of \"{bot.get('botName', 'the team')}\" on a live phone call. You speak {languages}.",
        "Who you are:\n" + ((bot.get("persona") or "").strip() or "A friendly, polite counsellor from the institution's admissions team."),
        "What this call is for:\n" + ((bot.get("goal") or "").strip() or "Help the caller and find out what they need."),
    ]
    if (bot.get("rules") or "").strip():
        sections.append("Rules from the team (always follow them):\n" + bot["rules"].strip())
    sections.append(
        "How to speak on the phone:\n"
        "- One or two short sentences per reply, then let the caller talk. Ask one question at a time.\n"
        "- Plain spoken words only: no lists, symbols, markdown or emoji. Say numbers the way people say them (\"do lakh pachaas hazaar\", \"two lakh fifty thousand\").\n"
        "- Only state facts found in the caller details below or in search_knowledge results. If you don't know, say someone from the team will confirm, and offer a callback with book_callback. Never guess fees, dates, eligibility or promises.\n"
        "- If the caller is busy, offer a callback time. If they don't want calls from the bot, apologise, call stop_bot_calls, then end_call.\n"
        "- If the caller is not the person you expected, or it's a wrong number, apologise and end_call with outcome wrong_number."
    )
    sections.append("What to find out (save each answer with set_field as soon as you have it):\n" + _fields(bot.get("fields", [])))
    if transfer.get("enabled"):
        rule = (transfer.get("rule") or "").strip() or "the caller is interested and ready to talk to a counsellor"
        sections.append(f"Handing over to a person: call transfer_to_person when {rule}, or whenever the caller asks for a person. Don't say goodbye first; a short hold message is played for you.")
    else:
        sections.append("Handing over to a person isn't possible on this call. If the caller asks for a person, offer a callback with book_callback.")
    end_rule = (bot.get("endRule") or "").strip() or "the caller's questions are answered and the next step is agreed, or the caller isn't interested"
    if has_closing:
        sections.append(f"Ending: when {end_rule}, call end_call with the outcome. Don't say goodbye yourself: a closing line is played after end_call.")
    else:
        sections.append(f"Ending: when {end_rule}, thank the caller and say goodbye in one short sentence, then call end_call with the outcome.")
    sections.append("Caller details (facts you may use; nothing else is known about the caller):\n" + _facts((bot.get("caller") or {}).get("details") or {}))
    sections.append("Language: " + LANGUAGE_NOTES.get(reply_language, LANGUAGE_NOTES["hi"])[gender] + " If the caller switches language, the note here changes and you follow it.")
    return "\n\n".join(sections)
