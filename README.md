# @guilhermednobre/agent-kit

Scaffolds a multi-agent development workflow into any repository: **Claude orchestrates,
Antigravity (`agy`) workers implement**, supervised through Orca orchestration.

```bash
npx @guilhermednobre/agent-kit init
```

Installed globally, the command is just `agent-kit`.

## What it writes

| Path | Purpose |
|---|---|
| `CLAUDE.md` | Orchestrator contract — roles, worker launch recipe, parallel worktrees, review and shutdown, bugfix loop, engineering rules |
| `AGENTS.md` | Worker contract — what the worker owns, the `worker_done` protocol, stack constraints, definition of done |
| `.claude/commands/` | Seven pipeline commands: `criar-prd`, `criar-techspec`, `criar-tasks`, `executar-task`, `executar-bugfix`, `executar-qa`, `executar-review` |
| `.claude/rules/` | Engineering rules split into always-applicable principles and technology-conditional ones |
| `.claude/templates/` | Document templates for PRD, TechSpec, tasks, bugs and worker briefs |

Existing files are never overwritten without `--force` or an explicit confirmation.

## Two modes

`init` inspects the target directory and picks a mode. Override it with `--mode`.

- **greenfield** — no dependency manifest found. The generated contracts state that the stack is
  an open user decision, and forbid Claude and workers from choosing one unilaterally.
- **existing** — a manifest was found (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`,
  `pom.xml`, `Gemfile`, `composer.json`, `mix.exs`, and others). The contracts instead point at a
  commands table. For Node projects the table is prefilled from the actual `scripts` and lockfile;
  anything unknown is written as `TBD` rather than guessed.

## Usage

```bash
npx @guilhermednobre/agent-kit init [directory]
```

| Option | Effect |
|---|---|
| `--name <name>` | Project name written into the contracts |
| `--description <text>` | One-line project description |
| `--mode <mode>` | `greenfield` or `existing`, overriding detection |
| `--force` | Overwrite existing files without asking |
| `-y, --yes` | Non-interactive; skip files that already exist |
| `--dry-run` | Print the plan, write nothing |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

Run without flags in a terminal and it prompts for name and description, and asks what to do about
each file that already exists (skip, overwrite, or write a `.new` sibling).

## Language

The contracts (`CLAUDE.md`, `AGENTS.md`) are in English. The commands, rules and document
templates are in Portuguese, matching the workflow they came from. Change either after generating —
nothing in the kit depends on the wording.

## Requirements

Node 20+ to run the generator. The workflow it scaffolds assumes Claude Code, and the worker half
assumes the Antigravity CLI (`agy`) plus Orca; the documents are still readable and useful without
them, but the launch recipe in `CLAUDE.md` section 2 is specific to that setup.

## After generating

1. Read `CLAUDE.md` and fill in anything marked `TBD`.
2. In `existing` mode, verify the commands table actually runs.
3. Delete the rule files under `.claude/rules/` that do not match your project, and update
   `.claude/rules/README.md`.

## Development

```bash
npm test
```

Zero runtime dependencies. Tests use the built-in `node:test` runner.

## License

MIT
