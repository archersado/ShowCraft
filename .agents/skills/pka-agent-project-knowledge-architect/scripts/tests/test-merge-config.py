#!/usr/bin/env python3

import json
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path


def main() -> None:
    skill_root = Path(__file__).resolve().parents[2]
    script = skill_root / "scripts" / "merge-config.py"
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp)
        custom = project / "_bmad" / "custom"
        custom.mkdir(parents=True)
        (project / "_bmad" / "config.toml").write_text(
            '[core]\noutput_folder = "{project-root}/_bmad-output"\n',
            encoding="utf-8",
        )
        (custom / "config.toml").write_text(
            '[unrelated]\nkeep = "yes"\n', encoding="utf-8"
        )
        answers = project / "answers.json"
        answers.write_text(
            json.dumps({"module": {"knowledge_hub_root": "/private/knowledge"}}),
            encoding="utf-8",
        )

        command = [
            sys.executable,
            str(script),
            "--project-root",
            str(project),
            "--answers",
            str(answers),
        ]
        for _ in range(2):
            result = subprocess.run(command, capture_output=True, text=True)
            assert result.returncode == 0, result.stderr

        with (custom / "config.toml").open("rb") as stream:
            team = tomllib.load(stream)
        with (custom / "config.user.toml").open("rb") as stream:
            personal = tomllib.load(stream)

        assert team["unrelated"]["keep"] == "yes"
        assert team["modules"]["pka"]["version"] == "1.2.0"
        assert "问题生命周期" in team["modules"]["pka"]["description"]
        assert "结构、运行、机制" in team["modules"]["pka"]["description"]
        assert "knowledge_hub_root" not in team["modules"]["pka"]
        assert personal["modules"]["pka"]["knowledge_hub_root"] == "/private/knowledge"
        assert (custom / "config.toml").read_text().count("# >>> pka module") == 1

    print("ok: PKA TOML registration is durable, private, and idempotent")


if __name__ == "__main__":
    main()
