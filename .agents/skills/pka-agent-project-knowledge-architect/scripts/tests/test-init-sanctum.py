#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class InitSanctumTest(unittest.TestCase):
    def test_initializes_six_files_and_eight_capabilities(self) -> None:
        skill_root = Path(__file__).resolve().parents[2]
        script = skill_root / "scripts" / "init-sanctum.py"
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            bmad = project / "_bmad"
            bmad.mkdir()
            (bmad / "config.toml").write_text(
                '[core]\ndocument_output_language = "Mandarin"\n', encoding="utf-8"
            )
            (bmad / "config.user.toml").write_text(
                '[core]\nuser_name = "Test Owner"\ncommunication_language = "Mandarin"\n',
                encoding="utf-8",
            )

            result = subprocess.run(
                [sys.executable, str(script), str(project), str(skill_root)],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)

            sanctum = bmad / "memory" / skill_root.name
            for name in [
                "INDEX.md",
                "PERSONA.md",
                "CREED.md",
                "BOND.md",
                "MEMORY.md",
                "CAPABILITIES.md",
            ]:
                self.assertTrue((sanctum / name).is_file(), name)
            capabilities = (sanctum / "CAPABILITIES.md").read_text(encoding="utf-8")
            self.assertEqual(capabilities.count("| ["), 8)
            self.assertIn("Test Owner", (sanctum / "BOND.md").read_text(encoding="utf-8"))
            self.assertNotIn("\\n", (sanctum / "CREED.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
