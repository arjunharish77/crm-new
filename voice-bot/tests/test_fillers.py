"""The short acknowledgements should be occasional and varied within a call."""

import unittest
from unittest.mock import patch

from app.fillers import FillerRotation


class FillerRotationTests(unittest.TestCase):
    def test_uses_every_phrase_before_repeating_and_avoids_round_boundary_repeat(self):
        rotation = FillerRotation(cooldown_seconds=0)
        rounds = 0

        def arrange(items):
            nonlocal rounds
            rounds += 1
            if rounds == 2:
                items.reverse()  # Without the boundary check, round two starts with 0 again.

        with patch("app.fillers.random.shuffle", side_effect=arrange):
            chosen = [rotation.choose("en", 3, float(turn)) for turn in range(7)]
        self.assertEqual(set(chosen[:3]), {0, 1, 2})
        self.assertEqual(set(chosen[3:6]), {0, 1, 2})
        self.assertEqual(chosen[:3], [2, 1, 0])
        self.assertNotEqual(chosen[2], chosen[3])
        self.assertTrue(all(previous != current for previous, current in zip(chosen, chosen[1:])))

    def test_waits_between_fillers_even_when_language_changes(self):
        rotation = FillerRotation(cooldown_seconds=12)
        self.assertIsNotNone(rotation.choose("en", 3, 10.0))
        self.assertIsNone(rotation.choose("en", 3, 18.0))
        self.assertIsNone(rotation.choose("hi", 3, 21.0))
        self.assertIsNotNone(rotation.choose("hi", 3, 22.0))

    def test_no_phrases_is_silent(self):
        self.assertIsNone(FillerRotation().choose("en", 0, 10.0))


if __name__ == "__main__":
    unittest.main()
