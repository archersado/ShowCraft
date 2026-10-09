#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# ///
"""Register PKA in BMad 6.12's durable TOML customization layers."""

from __future__ import annotations

import argparse
import json
import sys
import tomllib
from pathlib import Path


TEAM_BEGIN = "# >>> pka module (managed)"
TEAM_END = "# <<< pka module (managed)"
USER_BEGIN = "# >>> pka user settings (managed)"
USER_END = "# <<< pka user settings (managed)"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Register PKA in _bmad/custom TOML config."
    )
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--answers", required=True)
    return parser.parse_args()


def toml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def remove_managed_block(text: str, begin: str, end: str) -> str:
    start = text.find(begin)
    finish = text.find(end)
    if start == -1 and finish == -1:
        return text
    if start == -1 or finish == -1 or finish < start:
        raise ValueError(f"incomplete managed block: {begin}")
    finish += len(end)
    return (text[:start].rstrip() + "\n\n" + text[finish:].lstrip()).strip() + "\n"


def append_managed_block(text: str, block: str) -> str:
    base = text.rstrip()
    return (base + "\n\n" if base else "") + block.rstrip() + "\n"


def validate_toml(text: str, path: Path) -> None:
    try:
        tomllib.loads(text)
    except tomllib.TOMLDecodeError as error:
        raise ValueError(f"invalid TOML for {path}: {error}") from error


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".pka.tmp")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(path)


def team_block() -> str:
    return f'''{TEAM_BEGIN}
[modules.pka]
name = "项目知识架构"
description = "以业务、产品、技术三维架构和结构、运行、机制三视图，通过项目证据与问题生命周期持续沉淀可复用知识。"
version = "1.2.0"
default_selected = false

[agents.pka-agent-project-knowledge-architect]
module = "pka"
team = "knowledge"
name = ""
title = "项目知识架构师"
icon = "🧭"
description = "把新建或存量项目建模为可由问题生命周期驱动演化、可复盘、可跨项目聚合的知识资产。"
{TEAM_END}'''


def user_block(knowledge_hub_root: str) -> str:
    return f'''{USER_BEGIN}
[modules.pka]
knowledge_hub_root = {toml_string(knowledge_hub_root)}
{USER_END}'''


def register(project_root: Path, answers: dict) -> dict:
    bmad_dir = project_root / "_bmad"
    base_config = bmad_dir / "config.toml"
    if not base_config.is_file():
        raise ValueError(f"BMad 6.12 config not found: {base_config}")
    validate_toml(base_config.read_text(encoding="utf-8"), base_config)

    team_path = bmad_dir / "custom" / "config.toml"
    user_path = bmad_dir / "custom" / "config.user.toml"
    team_text = team_path.read_text(encoding="utf-8") if team_path.exists() else ""
    user_text = user_path.read_text(encoding="utf-8") if user_path.exists() else ""

    team_text = append_managed_block(
        remove_managed_block(team_text, TEAM_BEGIN, TEAM_END), team_block()
    )
    user_text = remove_managed_block(user_text, USER_BEGIN, USER_END)
    knowledge_hub_root = str(
        answers.get("module", {}).get("knowledge_hub_root", "")
    ).strip()
    if knowledge_hub_root:
        user_text = append_managed_block(user_text, user_block(knowledge_hub_root))

    validate_toml(team_text, team_path)
    validate_toml(user_text, user_path)
    atomic_write(team_path, team_text)
    atomic_write(user_path, user_text)

    return {
        "status": "success",
        "module_code": "pka",
        "team_config_path": str(team_path.resolve()),
        "user_config_path": str(user_path.resolve()),
        "module_keys": ["name", "description", "version", "default_selected"],
        "user_keys": ["knowledge_hub_root"] if knowledge_hub_root else [],
        "agent_keys": ["pka-agent-project-knowledge-architect"],
    }


def main() -> int:
    args = parse_args()
    if "{project-root}" in args.project_root:
        print("error: resolve {project-root} before running", file=sys.stderr)
        return 1
    try:
        answers = json.loads(Path(args.answers).read_text(encoding="utf-8"))
        result = register(Path(args.project_root).resolve(), answers)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(json.dumps({"status": "error", "error": str(error)}), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
