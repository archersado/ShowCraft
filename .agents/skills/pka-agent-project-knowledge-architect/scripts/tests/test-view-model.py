#!/usr/bin/env python3

import json
from pathlib import Path


def main() -> None:
    skill_root = Path(__file__).resolve().parents[2]
    cases = json.loads((skill_root / "evals" / "cases.json").read_text())
    archive = next(case for case in cases["cases"] if case["id"] == "archive-existing-project")
    contract = "\n".join(archive["rubric"])
    for filename in ("structure.md", "runtime.md", "mechanism.md"):
        assert filename in contract

    question_root = skill_root / "evals" / "fixtures" / "question" / "project-knowledge"
    for dimension in ("business", "product", "technology"):
        view_dir = question_root / dimension
        assert {path.name for path in view_dir.iterdir()} == {
            "structure.md",
            "runtime.md",
            "mechanism.md",
        }

    model = (skill_root / "references" / "view-model.md").read_text()
    assert "空间—时间—逻辑" in model
    assert "结构—运行—机制" in model
    assert "不自动重命名" in model
    print("ok: structure-runtime-mechanism contract and legacy mapping are complete")


if __name__ == "__main__":
    main()
