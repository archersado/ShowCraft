# Module Setup

Register this standalone module in a BMad 6.12+ project after the skill folder has been installed. Registration uses BMad's durable TOML customization layers and current help catalog; it never edits installer-managed `_bmad/config.toml`.

## Detect Existing Registration

Run:

```bash
uv run {project-root}/_bmad/scripts/resolve_config.py --project-root {project-root} --key modules.pka
```

This is an update when the result contains `modules.pka`. Also check whether `{project-root}/_bmad/_config/bmad-help.csv` contains `pka-agent-project-knowledge-architect`; setup repairs either missing part.

## Collect Configuration

Ask one question only:

- `knowledge_hub_root`: 跨项目知识统一目录放在哪里？暂不使用跨项目聚合时可留空。

Existing `modules.pka.knowledge_hub_root` is the default. Inline values or “accept defaults” skip prompting.

Write a temporary JSON file:

```json
{"module": {"knowledge_hub_root": ""}}
```

## Register

Resolve `{project-root}` in command arguments to the real absolute project path, then run:

```bash
uv run scripts/merge-config.py --project-root "{project-root}" --answers {temp-file}
uv run scripts/merge-help-csv.py --target "{project-root}/_bmad/_config/bmad-help.csv" --source assets/module-help.csv --module-code pka
```

The first command writes a managed PKA block to:

- `_bmad/custom/config.toml`: shared module metadata and Agent roster
- `_bmad/custom/config.user.toml`: personal `knowledge_hub_root`, only when non-empty

Both files preserve unrelated content, validate as TOML before replacement, and are idempotent. The second command replaces existing PKA help rows before adding the current nine entries.

If `knowledge_hub_root` is non-empty, create that directory. Do not create or modify project knowledge, source documents, code, or deliverables during setup.

## Verify

Run the config resolver again and require `modules.pka`; require exactly nine PKA rows in `_bmad/_config/bmad-help.csv`. If either check fails, report the error and do not claim installation succeeded.

Confirm the written config paths, whether this was a fresh install or update, the help-row count, and then display:

> 项目知识架构模块已完成注册。你可以新建或归档项目知识架构、用问题生命周期驱动架构演化、刷新和检查模型、执行项目复盘、审计证据，或从多个项目聚合主题认知。
