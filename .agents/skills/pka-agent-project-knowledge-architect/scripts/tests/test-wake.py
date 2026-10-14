#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class WakeTest(unittest.TestCase):
    def test_routes_first_breath_then_waking(self) -> None:
        skill_root = Path(__file__).resolve().parents[2]
        script = skill_root / "scripts" / "wake.py"
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            first = subprocess.run(
                [sys.executable, str(script), str(project)],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(first.returncode, 0)
            self.assertIn("MODE: FIRST_BREATH", first.stdout)

            sanctum = project / "_bmad" / "memory" / skill_root.name
            sanctum.mkdir(parents=True)
            for name in [
                "INDEX.md",
                "PERSONA.md",
                "CREED.md",
                "BOND.md",
                "MEMORY.md",
                "CAPABILITIES.md",
            ]:
                (sanctum / name).write_text(f"# {name}\n", encoding="utf-8")

            waking = subprocess.run(
                [sys.executable, str(script), str(project)],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(waking.returncode, 0)
            self.assertIn("MODE: WAKING", waking.stdout)
            self.assertIn("===== CREED.md =====", waking.stdout)


if __name__ == "__main__":
    unittest.main()
