#!/usr/bin/env python3

import csv
from pathlib import Path


def main() -> None:
    skill_root = Path(__file__).resolve().parents[2]
    prompt = (skill_root / "references" / "explore-question.md").read_text(
        encoding="utf-8"
    )
    required_contracts = [
        "问题生命周期",
        "Q-YYYYMMDD-NNN",
        "captured → defined → decomposed → mapped → discussing → decided → applied → verified → closed",
        "定义、决策、更新、关闭四个门禁",
        "讨论尚未收敛时",
        "不改写已确立的架构结论",
        "`business/`",
        "`product/`",
        "`technology/`",
        "结构模块",
        "运行行为",
        "原始需求、方案、代码和交付物永远只读",
    ]
    assert all(contract in prompt for contract in required_contracts)

    lifecycle = (skill_root / "references" / "issue-lifecycle.md").read_text(
        encoding="utf-8"
    )
    lifecycle_contracts = [
        "问题 = 期望状态 - 当前状态",
        "静态分解",
        "动态分析",
        "# Discussion",
        "# 方案",
        "# 架构更新",
        "# 验证与关闭",
        "`traceability.md` 只保存",
    ]
    assert all(contract in lifecycle for contract in lifecycle_contracts)

    view_model = (skill_root / "references" / "view-model.md").read_text(
        encoding="utf-8"
    )
    for filename in ("structure.md", "runtime.md", "mechanism.md"):
        assert filename in view_model
    for legacy in ("space.md", "time.md", "logic.md"):
        assert legacy in view_model
    assert "不自动重命名" in view_model

    with (skill_root / "assets" / "module-help.csv").open(
        encoding="utf-8", newline=""
    ) as handle:
        rows = list(csv.DictReader(handle))
    matches = [row for row in rows if row["action"] == "explore-question"]
    assert len(matches) == 1
    assert matches[0]["menu-code"] == "QD"

    print("ok: question lifecycle and architecture update contract are registered")


if __name__ == "__main__":
    main()
