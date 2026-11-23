# @guilhermednobre/agent-kit

An autonomous, multi-agent development workflow for any repository. **Claude Opus coordinates;
secondary agents (Gemini via Antigravity by default) implement and validate**, on T3 Code or Orca,
with tasks tracked locally or in Linear.

```bash
npx @guilhermednobre/agent-kit init
```

Give the coordinator an objective — *"Implement authentication with sign-up, login, password
recovery, tests and docs"* — and `/executar-workflow` takes it from spec to an accepted,
independently verified result, asking you only for decisions it cannot safely infer and for
protected actions (deploys, publishing, pushes, data deletion, credentials).

## The pipeline

| # | Role | Runs on (default) | Output |
|---|---|---|---|
| 1 | Product manager | Coordinator (Opus) | Spec — *what* |
| 2 | Architect | Coordinator (Opus) | TechSpec, contracts, tasks, `plan.json` |
| 3 | Dev | `standard` / `fast` / `advanced` profiles | One slice per task |
| 4 | QA · System · UI/UX · Security | `validator` profile, in parallel | Gate verdicts; UI/UX only for `ui` tasks, Security only for `security` tasks |
| 5 | Product owner | `validator` profile | Last gate: every acceptance criterion |
| 6 | Release | Coordinator | Only when you order it |

Any rejected gate sends the task back to the dev with the findings. Retries escalate the model
(`fast → standard → advanced`); an exhausted budget hands the task to the coordinator, then to you.

## What makes it autonomous (and not just prompts)

The Markdown contracts tell agents *how* to behave. The `agent-kit` CLI is the coordinator's
deterministic tool for *what* to do next, and it persists everything:

| Concern | Implemented by |
|---|---|
| Dependencies, waves, max workers, file ownership | `agent-kit wf next` (DAG scheduler) |
| Self-contained, reproducible briefs | `agent-kit wf dispatch` / `wf gate` (stored with a hash) |
| The exact runtime call | Runtime adapters: T3 `delegate_task` args, or the Orca command recipe |
| Independent verification | `agent-kit wf verify` runs the checks itself and records exit codes |
| Gates and reviewer independence | `agent-kit wf review --gate …` refuses the implementer as reviewer |
| Retry, escalation, fix cycles, timeouts | `.agent-kit/autonomy.json` + the workflow engine |
| Resume after interruption, no duplicate workers | `agent-kit wf resume` + idempotent `clientRequestId` |
| Definition of done | `agent-kit wf complete` refuses while a criterion is unmet |
| Protected actions | `.agent-kit/autonomy.json` + a Claude Code PreToolUse hook |
| Tracker | Local run files, or Linear issues kept in sync |

## What `init` writes

| Path | Purpose |
|---|---|
| `AGENTS.md` | Shared contract for every agent: project, stack, commands, engineering rules |
| `CLAUDE.md` | Coordinator contract; imports `AGENTS.md` and the runtime guide |
| `docs/agents/worker.md` | Worker contract (implementers and validators) and the report protocol |
| `.agent-kit/config.json` | Runtime, tracker, checks, model profiles, role → profile map |
| `.agent-kit/autonomy.json` | Limits, retry/escalation, permissions, protected actions, completion criteria |
| `.agent-kit/workflow.json` | Role pipeline and validation gates |
| `.agent-kit/runtime/<runtime>.md` | How each step maps onto T3 Code or Orca |
| `.agent-kit/hooks/` | Approval hook and session-context hook (no install needed) |
| `.claude/settings.json` | Wires the hooks into Claude Code |
| `.claude/commands/` | Pipeline commands (below) |
| `.claude/rules/`, `.claude/templates/` | Engineering rules; PRD, TechSpec, tasks, plan, bugs, brief templates |

Existing files are never overwritten without `--force` or an explicit confirmation.

## Commands (in Claude Code)

| Command | Purpose |
|---|---|
| `/configurar-worker` | First session: pick a model per profile from the runtime's real catalogue, smoke-test, save |
| `/executar-workflow <objective>` | Full autonomous run |
| `/status-workflow`, `/retomar-workflow`, `/replanejar-workflow` | Inspect, resume, re-plan |
| `/executar-release` | Deploy — only on your explicit order |
| `/avaliar-ideia`, `/criar-prd`, `/criar-techspec`, `/criar-tasks`, `/analisar-consistencia` | Planning steps (interactive when used alone) |
| `/executar-task`, `/executar-bugfix` | Worker steps |
| `/executar-review`, `/executar-qa` | Gates |
| `/fechar-ciclo` | Lessons and changelog |

## CLI

```bash
npx @guilhermednobre/agent-kit init [dir] [--runtime t3|orca] [--tracker local|linear --linear-team KEY]
                                         [--mode greenfield|existing] [--name] [--description]
                                         [--force] [-y] [--dry-run]
agent-kit validate [--plan tasks/prd-x/plan.json]
agent-kit policy check -- <command>        # exit 3 = needs human approval
agent-kit policy check --path <file>
agent-kit runtimes
agent-kit wf help                          # the workflow commands the coordinator uses
```

`init` detects the mode: **greenfield** (no manifest: the stack is the user's decision) or
**existing** (manifest found; for Node, commands and checks come from the real `scripts` and
lockfile; anything unknown stays `TBD`).

## Setup

1. **Node 20+**.
2. **Claude Code** with Claude Opus as the coordinator model.
3. **T3 Code** (recommended runtime) with the providers you want enabled — e.g. **Antigravity** for
   Gemini workers. `/configurar-worker` reads `orchestrator_capabilities`, so only models your
   account really has are offered. Quotas are real: Google AI Pro does not mean unlimited API use;
   tune `maxWorkers` and use the `fast` profile for cheap work.
4. Optional **Linear**: `init --tracker linear`. On T3, connect the project to Linear in T3 and that
   is all — the coordinator reaches Linear through T3's issue tools, no API key. On Orca (or to get
   real sub-issues and import), use the API mode: `--linear-team ENG` and a personal key in
   `LINEAR_API_KEY`. See [docs/linear.md](docs/linear.md).
5. Run `npx @guilhermednobre/agent-kit init`, open Claude Code, run `/configurar-worker`, then
   `/executar-workflow <objective>`.

Orca stays supported: `init --runtime orca` writes the Orca guide and the legacy terminal recipe.

## Documentation

- [docs/architecture.md](docs/architecture.md) — layers, state machine, adapters, how to add a runtime
- [docs/autonomy.md](docs/autonomy.md) — every setting in `autonomy.json`, approvals, escalation
- [docs/runtime-t3.md](docs/runtime-t3.md) — T3 Code, Antigravity, model selection, the real integration test
- [docs/linear.md](docs/linear.md) — Linear as the shared task base for T3 and Orca
- [docs/migration.md](docs/migration.md) — upgrading a project from 0.2 (Orca-only)
- [docs/audit.md](docs/audit.md) — the audit of 0.2.0 that motivated this design

## Language

Contracts (`AGENTS.md`, `CLAUDE.md`, `docs/agents/`, runtime guides) are in English. Commands, rules,
templates and briefs are in Portuguese.

## Development

```bash
npm test
```

Zero runtime dependencies. Tests use the built-in `node:test` runner; runtimes and Linear are
exercised through mocks, and [docs/runtime-t3.md](docs/runtime-t3.md) describes the manual
integration test against a real T3 session.

## License

MIT
