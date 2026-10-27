"""Which language the caller speaks, and which one the bot replies in (decision 16).

Each utterance is judged from its text: Devanagari script means Hindi; otherwise romanised Hindi
words (Hinglish) against English. The bot follows the caller only after two turns in a row in
the other language, so one English word in Hindi speech doesn't flip it, or at once when the
caller asks for a language.
"""

import re

DEVANAGARI = re.compile(r"[ऀ-ॿ]")
LATIN_LETTER = re.compile(r"[A-Za-z]")
WORD = re.compile(r"[A-Za-z']+")

# Common romanised Hindi words that aren't also everyday English words ("main", "to", "do",
# "the" and "par" are left out on purpose).
HINGLISH_WORDS = frozenset(
    """
    hai hain haan haanji han nahi nahin nai kya kyun kyon kaise kaisa kaisi kitna kitne kitni kab kahan kaha
    mujhe mujhko mera meri mere aap aapka aapki aapke apna apni apne hum hamara hamari humara tum tumhara
    yeh ye woh wo voh vo accha acha achha achchha theek thik bilkul zaroor jaroor chahiye chahta chahti
    karna karni karke karenge karunga karungi kar raha rahi rahe tha thi sakta sakti sakte bataiye batao
    bata batana dijiye kijiye lijiye boliye suniye abhi kal parso aaj jaldi baad pehle phir fir lekin magar
    aur bhi sirf bas matlab samajh samjha samjhi paisa paise rupaye rupay lakh hazaar hazar ji shukriya
    dhanyavaad dhanyawad namaste namaskar kuch koi sab sabhi wala wali wale liye ke ki ka ko se mein mai
    hoon hu hun ho gaya gayi gaye hoga hogi kaun kaunsa konsa kidhar idhar udhar yahan wahan agar toh
    """.split()
)

ASK_ENGLISH = re.compile(r"\b(in english|english (me|mein|mai|main)|speak english|talk in english|english please|angrezi)\b", re.I)
ASK_HINDI = re.compile(r"(\bin hindi\b|\bhindi (me|mein|mai|main)\b|\bspeak hindi\b|हिंदी में|हिन्दी में|हिंदी)", re.I)


def detect(text: str) -> str:
    """'hi' or 'en' for one utterance."""
    if not text.strip():
        return "en"
    devanagari = len(DEVANAGARI.findall(text))
    latin = len(LATIN_LETTER.findall(text))
    if devanagari and devanagari >= latin * 0.3:
        return "hi"
    words = [word.lower() for word in WORD.findall(text)]
    if not words:
        return "hi" if devanagari else "en"
    hits = sum(1 for word in words if word in HINGLISH_WORDS)
    share = hits / len(words)
    if len(words) <= 3:
        return "hi" if hits and share >= 0.34 else "en"
    return "hi" if share >= 0.2 else "en"


def requested(text: str) -> str | None:
    """A language the caller explicitly asked for, if any."""
    if ASK_ENGLISH.search(text):
        return "en"
    if ASK_HINDI.search(text):
        return "hi"
    return None


class ReplyLanguage:
    """Tracks the language the bot replies in."""

    def __init__(self, allowed: list[str], start: str):
        self.allowed = [language for language in allowed if language in ("hi", "en")] or ["hi"]
        self.current = start if start in self.allowed else self.allowed[0]
        self._streak = 0
        self.last_detected = self.current

    def observe(self, text: str) -> bool:
        """Takes one caller utterance; True when the reply language changed."""
        detected = detect(text)
        self.last_detected = detected
        asked = requested(text)
        if asked and asked in self.allowed and asked != self.current:
            self.current = asked
            self._streak = 0
            return True
        if detected == self.current or detected not in self.allowed:
            self._streak = 0
            return False
        self._streak += 1
        if self._streak >= 2:
            self.current = detected
            self._streak = 0
            return True
        return False
