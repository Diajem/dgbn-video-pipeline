import tempfile
from pathlib import Path
import os
import unittest
from unittest.mock import patch
from engine import sentences, spoken_text, voice_profile, status


class NarrationContractTest(unittest.TestCase):
    def test_pronunciation_preserves_names_and_caption_input(self):
        original = "Benin's Oba met Obadiah. The neighbouring city is Cotonou."
        self.assertEqual(spoken_text(original), "Bee-nin's Urba met Obadiah. The neighbouring city is Cotonou.")
        self.assertIn("Benin", original)

    def test_sentences_keep_decimal_numbers_and_separate_paragraphs(self):
        self.assertEqual(sentences("It cost 3.5 million. The king arrived!\nA new chapter begins."),
            ["It cost 3.5 million.", "The king arrived!", "A new chapter begins."])
        self.assertGreater(len(sentences("word " * 90)), 1)
        with self.assertRaises(ValueError): sentences("")
        with self.assertRaises(ValueError): sentences("x" * 20001)

    def test_unknown_voice_cannot_select_a_file_or_trigger_fallback(self):
        for value in ("../../private.wav", "alba", "", None):
            with self.assertRaises(ValueError): voice_profile(value)

    def test_missing_presets_are_reported_individually(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {"POCKET_TTS_ASSETS": folder}):
            root = Path(folder)
            (root / "voices").mkdir()
            for name in ("model.safetensors", "tokenizer.json", "voices/carabau.wav"):
                (root / name).touch()
            voices = {v["id"]: v for v in status()["voices"]}
            self.assertEqual(voices["carabau"]["missingAssets"], [])
            self.assertEqual(voices["jane"]["missingAssets"], ["voices/jane.safetensors"])
            self.assertFalse(voices["jane"]["ready"])


if __name__ == "__main__": unittest.main()
