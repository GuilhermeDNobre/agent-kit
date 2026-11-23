# Audit — agent-kit 0.2.0

Date: 2026-11-23. Scope: everything tracked in the repository at commit `cafa3f8`, plus the
runtimes available on the audit machine (T3 Code orchestrator tools, Antigravity CLI `agy` 1.5.15,
Orca CLI).

## 1. Current state

`@guilhermednobre/agent-kit` is a **scaffolder**. `npx @guilhermednobre/agent-kit init` copies a
tree of Markdown templates into a target repository, filling a handful of placeholders.

| Area | Files | What it really does |
|---|---|---|
| CLI | `bin/cli.js` | Parses `init [dir]`, `--name`, `--description`, `--mode`, `--force`, `-y`, `--dry-run`; asks name/description on a TTY; resolves conflicts (skip / overwrite / keep-both `.new`) |
| Detection | `src/detect.js` | Finds a manifest among 13 ecosystems → `existing`, else `greenfield`. Only Node gets real commands (from `scripts` + lockfile); everything else is `TBD` |
| Install | `src/install.js` | Lists `templates/`, maps `templates/claude/**` → `.claude/**`, renders, writes, honours dry-run |
| Render | `src/render.js` | `<!--IF:mode-->…<!--END-->` blocks and `{{PLACEHOLDER}}` substitution |
| Contracts | `templates/AGENTS.md`, `templates/CLAUDE.md`, `templates/docs/agents/worker.md` | Shared rules / orchestrator role / worker role |
| Pipeline | `templates/claude/commands/*.md` (11) | PRD → TechSpec → tasks → consistency → task → review → bugfix → QA → close-cycle |
| Rules, templates | `templates/claude/rules/*`, `templates/claude/templates/*` | Engineering rules, document templates |
| Tests | `test/*.test.js` (30, all passing) | Detection, rendering, installation, a guard that no template hard-codes a worker tool |

Zero runtime dependencies, Node ≥ 20, `node --test`. LF line endings are forced so the published
shebang stays valid.

## 2. Architecture found

```
bin/cli.js ──► detect.js ──► install.js ──► render.js ──► templates/**  (static text)
```

There is no runtime code after `init`. Every behaviour of the "workflow" — planning, dispatch,
supervision, review, retry — exists **only as instructions in Markdown** that a Claude Code session
is expected to follow.

## 3. Implemented vs. only documented

| Capability | Status |
|---|---|
| Scaffold, modes, stack detection, overwrite protection, `--force`/`-y`/`--dry-run` | **Implemented and tested** |
| Pipeline commands (PRD, TechSpec, tasks, review, bugfix, QA) | Documented (prompt text) |
| Parallelism marking (`Paralelizável`, waves) | Documented; nothing computes or enforces it |
| DAG / dependency ordering | Documented as a table in `tasks.md`; no machine-readable form |
| Concurrency cap (3 workers) | Documented only |
| Worker briefs | Template only; no generator, no storage, not reproducible |
| Supervision (Orca Monitor loop) | Documented only |
| Retry / bugfix loop limits (2 worker failures, 3 rounds) | Documented only |
| Timeouts, stall detection, resume after interruption | **Absent** (only prose about lost `worker_done`) |
| Workflow / task state | **Absent** — no state file, no transitions, no history |
| Approval policy for dangerous actions | **Absent** (prose: "only commit when the user asks") |
| Independent verification of worker claims | Documented (`/executar-review`), nothing runs the checks |
| Model selection per role / complexity | Absent — one worker recipe chosen in `/configurar-worker` |

## 4. Orca dependencies

All runtime coupling is in prose, concentrated in:

- `CLAUDE.md` §2 (run-create, worktree create, terminal create/read/send, task-create, dispatch,
  Monitor polling `orchestration check`, terminal close), §6 (worktree comments) — 23 mentions.
- `docs/agents/worker.md` §3 (`orca orchestration send --type worker_done|heartbeat|escalation`,
  `orca orchestration ask`).
- `executar-task.md`, `executar-bugfix.md` (worker_done, ask), `executar-review.md` (terminal close,
  worktree comment), `configurar-worker.md` (Orca terminal readiness), `worker-brief-template.md`,
  `task-template.md`.

Everything else (PRD, TechSpec, tasks, consistency, QA, close-cycle, rules, templates) is
runtime-neutral and reusable as is.

## 5. Compatibility with T3 Code

Verified against the tool schemas exposed in this session (the authoritative interface on this
machine) and a live `orchestrator_capabilities` call:

| T3 tool | Contract (as exposed) | Use in agent-kit |
|---|---|---|
| `orchestrator_capabilities` | Lists provider instances, models, options, runtime modes | Configure model profiles; never hard-code ids |
| `delegate_task` | `task` (only context the child gets — no parent history), `title`, `role` (`implementation`/`research`/`review`/`design`/`test`/`general`), `mode` (`async` default, `wait` ≤ 45 s), `isolation` (`shared` / `worktree` — uncommitted edits stay out), `target` `{providerInstanceId, model, options}`, `clientRequestId` (retry key). Returns a `taskId` | Dispatch |
| `task_status` | `workState`: `working` / `waiting_for_children` / `result_available`; `summary` is the final result. Must not be polled — completion wakes the parent | Collect result, reconcile on resume |
| `task_cancel` | Stops a task and its delegates; finished tasks keep their result | Cancel / replace |
| `t3_thread_send` | Steer/queue/restart a thread; a send to a finished child starts a fresh task | Follow-up on the same child |
| `t3_thread_read`, `t3_thread_wait` | Read a thread; wait for a run | Diagnostics / recovery |

Live provider list on this machine: `antigravity` is enabled and can run child tasks with Gemini
models (`thought_level` option) as well as Claude models; `claudeAgent` is the coordinator's own
provider. `agy models` lists the same catalogue with effort suffixes.

Consequences for the design:

1. T3 already owns child lifecycle, completion delivery and cancellation. agent-kit must **not**
   re-implement monitoring loops (the Orca Monitor recipe has no T3 equivalent and must not be
   ported — T3 forbids polling `task_status`).
2. T3 does **not** own the workflow: dependencies, waves, concurrency caps, file ownership, retry
   budgets, verification results and approval policy are not T3 concepts. That is the gap
   agent-kit fills.
3. A brief must be self-contained text inside `task`. With `isolation: "worktree"`, uncommitted
   files (including a brief written to disk) are invisible to the child, so the brief is inlined.
4. `clientRequestId` gives idempotent dispatch, which removes the duplicate-worker risk after a
   coordinator crash between dispatch and recording.
5. A child cannot call an Orca-style `ask`. Blockers are returned as a structured result.

T3 tools are MCP tools callable only by the agent session, not by a Node process. Therefore the
Node side cannot "call T3"; it can only compute *what* to call and record *what happened*.

## 6. Gaps for real autonomy

1. No machine-readable plan → nothing can enforce dependencies or file ownership.
2. No state → an interrupted session loses track of dispatched workers; work is duplicated or lost.
3. No retry budget or escalation in code → loops depend on the model remembering counts.
4. No independent check runner → verification is whatever the model chooses to run.
5. Every planning command stops for user questions or approvals (`criar-prd`, `criar-techspec`,
   `criar-tasks`, `analisar-consistencia`, `fechar-ciclo`) → a full run needs a human at each step.
6. No approval policy → either everything is gated by habit or nothing is.
7. One worker recipe for every task → no cheap/strong split by complexity.

## 7. Problems and inconsistencies

- The guard test forbids tool names in templates, while the target architecture names a default
  worker runtime. The intent (no hard-coded **model ids**) is kept; the test is narrowed.
- `CLAUDE.md` mixes runtime-independent policy (roles, review, bugfix loop) with Orca mechanics.
- Worker completion is a CLI side effect (`worker_done`) in Orca and a final message in T3; there
  was no runtime-neutral report format.
- `AGENTS.md` forbids `Co-Authored-By` trailers for generated projects; fine, but it is project
  policy and must stay overridable by the user.

## 8. Migration plan (executed)

1. **Core** (`src/core/`, no runtime imports): config defaults + validation, task/workflow state
   machine, DAG + scheduler (deps, concurrency, file-ownership conflicts), retry/escalation policy,
   approval policy, completion criteria, brief builder, worker report parser, check runner,
   persistent run store with history.
2. **Runtime adapters** (`src/runtimes/`): `t3` (primary) and `orca` (legacy) produce the exact
   call/commands for dispatch, status and cancel from the same core inputs.
3. **CLI**: `init --runtime t3|orca`, `agent-kit validate`, `agent-kit policy check`, and
   `agent-kit wf …` (new, next, dispatch, started, report, verify, review, status, resume, replan,
   complete) as the coordinator's deterministic tool.
4. **Templates**: `.agent-kit/` config + runtime guide, runtime-neutral `CLAUDE.md` importing the
   runtime guide, worker report contract, autonomous mode for the planning commands, new commands
   `executar-workflow`, `status-workflow`, `retomar-workflow`, `replanejar-workflow`, a PreToolUse
   hook enforcing protected actions.
5. **Orca** kept as a runtime guide + adapter with the previous recipe.
6. **Added during implementation, at the user's request:** a role pipeline
   (`.agent-kit/workflow.json`: PM → architect → dev → QA/system/UI-UX/security gates → product
   owner → release on demand) with per-role model profiles, and a **Linear tracker** so the task
   base is independent of the runtime (T3 or Orca).

## 9. Technical risks

| Risk | Mitigation |
|---|---|
| T3 tool contract changes (no public versioned spec on this machine) | Adapter isolates names/params; `/configurar-worker` re-reads `orchestrator_capabilities`; documented manual integration test |
| Model ids change | Never in templates; profiles filled from the live catalogue |
| Antigravity quota / rate limits (not unlimited) | `maxWorkers`, profile `fast` for cheap work, failures counted as attempts with backoff guidance |
| Parallel children in a shared checkout interfering | File-ownership conflicts block co-scheduling; per-task checks only on owned scope; full checks only when nothing is running |
| The coordinator skips the CLI and drifts from state | Contract makes `wf` the source of truth; `wf status` detects inconsistencies; `wf complete` refuses to close unmet criteria |
| Approval hook bypassed by workers in another runtime | Hook covers the Claude coordinator; workers get the forbidden-action list in every brief; documented limitation |
| "ask" hook decision in non-interactive sessions | Configurable to `deny` |
