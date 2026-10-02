# @guilhermednobre/agent-kit

Scaffolds a multi-agent development workflow into any repository: **Claude orchestrates, a worker
agent of your choice implements**, supervised through Orca orchestration.

```bash
npx @guilhermednobre/agent-kit init
```

Installed globally, the command is just `agent-kit`.

## What it writes

| Path | Purpose |
|---|---|
| `AGENTS.md` | Shared contract for every agent and tool: project, stack, commands, engineering rules. Read natively by Claude Code, opencode, Codex and others |
| `CLAUDE.md` | Imports `AGENTS.md` (`@AGENTS.md`) and adds only the orchestrator role: pipeline, worker launch, supervision, review, bugfix loop |
| `docs/agents/worker.md` | The worker role: what it owns, the `worker_done` protocol, definition of done. Every brief points to it |
| `.claude/commands/` | The pipeline commands (below) |
| `.claude/rules/` | Engineering rules split into always-applicable principles and technology-conditional ones |
| `.claude/templates/` | Document templates for PRD, TechSpec, tasks, bugs and worker briefs |

Existing files are never overwritten without `--force` or an explicit confirmation.

### Why three files

The orchestrator and the worker get opposite orders ("dispatch and review" against "implement and
stop"). In one file, each reads the other's orders. So the shared part lives in `AGENTS.md`, which
every tool reads, and each role adds only its own file. Nothing is written twice.

## The worker is chosen in the first session

The kit does not hard-code a worker tool or model. The generated `CLAUDE.md` opens with a notice;
in the first Claude Code session, run `/configurar-worker`. It asks which tool (opencode,
Antigravity, Codex CLI, another Claude Code, or none) and which model and effort level, lists the
models the tool offers, smoke-tests the choice, confirms readiness in a real Orca terminal, and
then writes the launch recipe into `CLAUDE.md` section 2 and removes the notice. Run it again to
switch.

## The pipeline

| Command | Runs on | When |
|---|---|---|
| `/configurar-worker` | Claude | First session, or to switch worker tool or model |
| `/avaliar-ideia` | Claude | Optional: go / clarify / kill verdict before writing a PRD |
| `/criar-prd` | Claude | Clarifying questions with the user |
| `/criar-techspec` | Claude | Architecture decisions |
| `/criar-tasks` | Claude | Decomposition into `itemized-tasks/`, parallelism marking |
| `/analisar-consistencia` | Claude | Cross-checks PRD, TechSpec and Tasks; nothing is dispatched while a Blocker or High finding is open |
| `/executar-task` | worker | Implementation |
| `/executar-review` | Claude | After each `worker_done`; findings ranked Blocker / High / Medium / Low |
| `/executar-bugfix` | worker | Applies a fix Claude diagnosed in `bugs.md` |
| `/executar-qa` | Claude | Browser QA with Playwright MCP |
| `/fechar-ciclo` | Claude | After an approved QA: turns the cycle's lessons into rules, ADRs, memory or templates, and writes the changelog |

## Two modes

`init` inspects the target directory and picks a mode. Override it with `--mode`.

- **greenfield** — no dependency manifest found. `AGENTS.md` states that the stack is an open user
  decision, and forbids every agent from choosing one unilaterally.
- **existing** — a manifest was found (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`,
  `pom.xml`, `Gemfile`, `composer.json`, `mix.exs`, and others). `AGENTS.md` gets a commands table.
  For Node projects it is prefilled from the actual `scripts` and lockfile; anything unknown is
  written as `TBD` rather than guessed.

## Usage

```bash
npx @guilhermednobre/agent-kit init [directory]
```

| Option | Effect |
|---|---|
| `--name <name>` | Project name written into `AGENTS.md` |
| `--description <text>` | One-line project description |
| `--mode <mode>` | `greenfield` or `existing`, overriding detection |
| `--force` | Overwrite existing files without asking |
| `-y, --yes` | Non-interactive; skip files that already exist |
| `--dry-run` | Print the plan, write nothing |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

## Language

The contracts (`AGENTS.md`, `CLAUDE.md`, `docs/agents/worker.md`) are in English. The commands,
rules and document templates are in Portuguese, matching the workflow they came from.

## Requirements

Node 20+ to run the generator. The workflow assumes Claude Code as orchestrator and Orca for
worktrees and orchestration. The worker can be any CLI agent that runs in a terminal and can call
`orca orchestration send`.

## After generating

1. Open Claude Code and run `/configurar-worker`.
2. Read `AGENTS.md` and fill in anything marked `TBD`.
3. In `existing` mode, verify the commands table actually runs.
4. Delete the rule files under `.claude/rules/` that do not match your project, and update
   `.claude/rules/README.md`.

## Development

```bash
npm test
```

Zero runtime dependencies. Tests use the built-in `node:test` runner.

## License

MIT
