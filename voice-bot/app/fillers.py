"""Choose occasional recorded acknowledgements without repeating one on consecutive turns."""

import random


class FillerRotation:
    def __init__(self, cooldown_seconds: float = 12.0):
        self.cooldown_seconds = cooldown_seconds
        self._remaining: dict[str, list[int]] = {}
        self._last_by_language: dict[str, int] = {}
        self._last_played_at: float | None = None

    def choose(self, language: str, count: int, now: float) -> int | None:
        if count <= 0 or (
            self._last_played_at is not None
            and now - self._last_played_at < self.cooldown_seconds
        ):
            return None

        remaining = self._remaining.get(language)
        if not remaining:
            remaining = list(range(count))
            random.shuffle(remaining)
            # We pop from the end. Prevent a repeat where two shuffled rounds meet.
            if count > 1 and remaining[-1] == self._last_by_language.get(language):
                remaining[-1], remaining[-2] = remaining[-2], remaining[-1]
            self._remaining[language] = remaining

        index = remaining.pop()
        self._last_by_language[language] = index
        self._last_played_at = now
        return index
