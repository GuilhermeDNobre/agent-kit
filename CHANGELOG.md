# Changelog

## 0.4.0 — unreleased

### Changed

- **Orca is a first-class runtime again.** The Orca adapter now dispatches one supervised
  `orca orchestration worker-start --spec-file <brief> --agent --model --effort` per task, records
  the dispatch id, and lets Orca wake the coordinator with `worker_done` / `question` /
  `escalation`. Status, cancel and resume use `worker-show`, `worker-read` and `worker-stop`. The
  old terminal recipe (`terminal create` + `dispatch` + `terminal send`) and the polling Monitor —
  which Orca forbids, because a script's `check` swallows the coordinator's mail — are gone.
  Attempts recorded with the old `<terminal>|<task>` ref still get the old status/cancel commands.
- **The session decides the runtime.** `init` installs both runtime guides and detects the
  runtime (T3 session → `t3`; Orca terminal → `orca`; any other terminal → `orca`).
  `/configurar-worker` confirms it with `agent-kit runtime detect` and switches with
  `agent-kit runtime set <t3|orca>` (config, `CLAUDE.md` import, Linear route).
- `/configurar-worker` covers both runtimes in one file; on Orca, profiles store the Orca agent id
  as `provider`, the model, and `options.effort`; smoke tests are real `worker-start` workers.
- `runtimes.orca` is now `{ worktree: "current" | "new-child", keepOpen }`; `launchCommand` and
  `readiness` are obsolete (`agent-kit validate` warns).

### Added

- **Linear through Orca** (`tracker.linear.via: "orca"`, default on Orca): no API key; the CLI runs
  `orca linear create/relation/status/comment` itself — real sub-issues, `blocks` relations and
  automatic sync.
- **One Linear project per repository** on every route (`t3`, `orca`, `api`):
  `tracker.linear.project.name` (default: the project name, `init --linear-project` overrides) is
  required, and every issue is created in it. The API route finds the project in the team or
  creates it; the Orca route creates it through the API when a key is available, otherwise asks
  the user to create it once; the T3 route passes `project` on every `create_issue`.
- `agent-kit runtime detect [--t3-tools]` and `agent-kit runtime set <t3|orca>`.

## 0.3.0 — unreleased

### Added

- Runtime-independent core (`src/core`): configuration and plan validation, task/workflow state
  machine with history, DAG scheduler (dependencies, waves, `maxWorkers`, file ownership),
  retry/escalation, coordinator takeover, blocked/unblock, replan, resume, completion criteria.
- `agent-kit wf` — the coordinator's workflow CLI: `new`, `next`, `dispatch`, `started`, `touch`,
  `report`, `verify` (task and `--final`), `gate`, `review`, `lost`, `takeover`, `unblock`,
  `cancel`, `replan`, `status`, `resume`, `complete`, `sync`, `list`.
- Self-contained, hashed briefs for implementers and validators.
- Worker and validator report protocols (`agent-kit-report`, `agent-kit-review`).
- Role pipeline (`.agent-kit/workflow.json`): PM → architect → dev → QA / system / UI/UX / security
  gates → product owner → release on demand. Reviewer independence enforced.
- Model profiles per role (`fast`, `standard`, `advanced`, `validator`, `coordinator`).
- Runtime adapters: **T3 Code** (default; `delegate_task` calls with retry keys) and Orca (legacy
  recipe), plus `registerAdapter` for new runtimes.
- Linear tracker, two ways: **through T3** (`via: "t3"`, default on T3 — no API key; the CLI prints
  `create_issue` / `set_issue_state` / `comment_on_issue` calls, `wf tracker-bind` and
  `wf sync --ack` close the loop; tested live) and **through the API** (`via: "api"` — sub-issues,
  `blocks` relations, automatic sync, import with `wf new --from-linear`). Failures queue instead
  of blocking.
- Autonomy policy (`.agent-kit/autonomy.json`) with protected-action categories, write protection,
  `agent-kit policy check`, and a Claude Code PreToolUse hook enforcing it; SessionStart hook that
  surfaces unfinished runs.
- Commands `/executar-workflow`, `/status-workflow`, `/retomar-workflow`, `/replanejar-workflow`,
  `/executar-release`; autonomous mode in the planning commands; `plan.json` output in
  `/criar-tasks`.
- `init --runtime t3|orca`, `--tracker local|linear`, `--linear-team`; `.agent-kit/` generation with
  checks derived from the detected commands; Node `typecheck` detection.
- `agent-kit validate`, `agent-kit runtimes`.
- Docs: audit, architecture, autonomy, T3 runtime (with the real integration run), Linear,
  migration.

### Changed

- `CLAUDE.md` is runtime-neutral and imports `.agent-kit/runtime/<runtime>.md`; the Orca recipe
  moved there.
- `docs/agents/worker.md` covers implementers and validators and the new report protocol.
- `/executar-review` became the gate command; `/executar-task` and `/executar-bugfix` no longer
  depend on Orca; `/configurar-worker` configures profiles from the runtime's live catalogue.
- The template guard test now forbids model ids everywhere and tool names outside runtime-specific
  files.

## 0.2.0

- First session chooses the worker agent; shared, orchestrator and worker contracts split.
