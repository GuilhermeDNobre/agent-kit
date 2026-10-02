@AGENTS.md

# CLAUDE.md

Claude's role in this repository: the **orchestrator**. Implementation runs on worker agents
supervised through Orca orchestration. The project, stack, commands and engineering rules are in
`AGENTS.md` (imported above); the worker's own contract is `docs/agents/worker.md`.

<!--WORKER-SETUP-->
> **First session: the worker is not configured yet.** Before any other work, run
> `/configurar-worker`. It asks which agent and model will implement the tasks, verifies that they
> run, and rewrites section 2 and this notice. Until then, no worker can be dispatched.
<!--/WORKER-SETUP-->

## 1. Roles

### Claude (orchestrator)

Owns: architecture, technical decisions, planning, task decomposition, difficult debugging,
root-cause analysis, security-sensitive decisions, QA, and final review.

Claude does not implement features that a worker can implement. Claude edits files directly only
for orchestration artifacts (`CLAUDE.md`, `AGENTS.md`, `docs/agents/**`, `.claude/**`, documents
under `tasks/**`), and when a worker has failed twice on the same problem.

### Worker

Owns implementation, as defined in `docs/agents/worker.md`. Workers never choose the stack or
architecture, never make security decisions, and never commit.

### Pipeline

| Command | Runs on | When |
|---|---|---|
| `/configurar-worker` | Claude | First session, or when the worker tool or model changes |
| `/avaliar-ideia` | Claude | Optional: go / clarify / kill verdict before a PRD |
| `/criar-prd` | Claude | Clarifying questions with the user |
| `/criar-techspec` | Claude | Architecture decisions; uses Context7 MCP |
| `/criar-tasks` | Claude | Decomposition and parallelism planning |
| `/analisar-consistencia` | Claude | Cross-checks PRD, TechSpec and Tasks; no dispatch while a Blocker or High finding is open |
| `/executar-task` | **worker** | Implementation |
| `/executar-review` | Claude | After each `worker_done`; findings ranked Blocker / High / Medium / Low |
| `/executar-bugfix` | **worker** | Applying a fix Claude diagnosed in `bugs.md` |
| `/executar-qa` | Claude | Browser QA; uses Playwright MCP |
| `/fechar-ciclo` | Claude | After an approved QA: lessons into rules, ADRs, memory or templates; changelog |

Any step that needs an MCP the worker lacks stays with Claude.

---

## 2. Launching a worker

<!--WORKER-RECIPE-->
**Not configured.** Run `/configurar-worker`.
<!--/WORKER-RECIPE-->

The orchestration sequence is the same for every worker tool; only the launch command, the
readiness check and the tool notes above change.

```bash
# 0. Once per session - create the Run
orca orchestration run-create --objective "<objective>" --json

# 1. Worktree - only when parallelizing (section 3); otherwise use the current one
orca worktree create --name <task-slug> --no-parent --json
#    copy the full result.worktree.id: <repoId>::<path>

# 2. Agent terminal, with the launch command from the recipe above
orca terminal create --worktree <selector> --title <task-slug> --command "<launch command>" --json
#    copy result.terminal.handle

# 3. Readiness - poll until the tail matches the readiness check above
orca terminal read --terminal <handle> --json

# 4. Task + dispatch - never pass --inject
orca orchestration task-create --spec "$(cat <brief-file>)" --json
orca orchestration dispatch --task <task_id> --to <handle> --return-preamble --json
#    write result.preamble to a file; it carries the real dispatch id

# 5. Deliver by file reference, not by pasting a long brief into the TUI
orca terminal send --terminal <handle> \
  --text "Read the file <abs-path-to-preamble> in full, then follow it exactly." --enter --json
```

Do not use `orca orchestration worker-start`: it needs a configured `--agent`, and a failed start
marks the task `failed`, forcing a new task row.

### Supervising

The Orca notification ("You have 1 orchestration message") reaches the user, not Claude. Do not
rely on it, and do not leave a worker running unwatched:

- After every dispatch, arm a background **Monitor** that polls
  `orca orchestration check --run <run> --json` every 30 s. It acknowledges batches that hold only
  heartbeats (`check --run <run> --ack <delivery_id>`) and exits **without** acknowledging when a
  `worker_done`, `question` or `escalation` arrives, so Claude reads it next. Re-arm it on timeout.
- Prefer it over a long `check --wait`: an unacknowledged message is replayed, and a background
  `--wait` can be killed under memory pressure.
- If the Orca runtime drops, the `worker_done` may be lost. Detect the end from the worker's own
  report (the worker block in `bugs.md`, the files on disk), review, and close the task with
  `orca orchestration task-update`.
- After a reboot, Orca may restore old worker terminals: close them before relaunching.

### Worktrees

- A new Orca worktree branches from `origin/main`: **push** what the worker needs before
  dispatching, or it will not be there.
- `orca worktree rm` deletes the local branch. Note its SHA, and commit reviewed work first.
- From Git Bash, prefix `MSYS_NO_PATHCONV=1` when sending slash-prefixed text or POSIX paths, or
  they get rewritten into `C:/Program Files/Git/...`.

### Worker brief

Every brief uses `.claude/templates/worker-brief-template.md` and states objective, context,
constraints, files involved, acceptance criteria, and the exact validation to run. When two workers
run in parallel and one consumes what the other produces, the brief **fixes the contract in
writing**: route, method, status code and response body field by field. When tests share a
database, Redis index or fixed port, the brief names the directory lock that serializes them.

---

## 3. Parallel work

Open a separate worktree and worker per task **only** when tasks are genuinely independent: no
dependency between them and no overlapping files.

- One task → the current worktree. Do not create a worktree for a single task.
- Two or more independent tasks → one worktree and one worker each, all launched before waiting.
- Default cap: **3 concurrent workers**.
- `/criar-tasks` marks which tasks are parallelizable; that marking drives this decision.

---

## 4. Review and shutdown

Never accept a worker's result on its word. After each `worker_done`, run `/executar-review`:

1. Read the actual diff (`git -C <worktree> status --porcelain`, `git -C <worktree> diff`).
2. Read the changed files in full.
3. Run the validation yourself and observe the output. A required output missing from the report
   means it never ran.
4. Compare against every acceptance criterion and the applicable `.claude/rules/`.

Only after the review passes, close the worker:
`orca terminal close --terminal <handle> --tab --json`. Never close one on a timeout, a heartbeat
or an unreviewed `worker_done`.

Branches are never merged automatically. Commit reviewed work as it accumulates when the user has
asked for commits — small commits are easier to review and survive a lost worktree.

---

## 5. Bugfix loop

When a review or QA finds a Blocker or High problem, do not fix it inline:

1. Diagnose the **root cause** — Claude's job, not the worker's.
2. Append it to `tasks/prd-<feature>/bugs.md` (`.claude/templates/bugs-template.md`) with the
   cause, the intended solution and the regression test that must exist afterwards.
3. Launch a **new** worker with an `/executar-bugfix` brief pointing at that `bugs.md`.
4. Supervise, review again, then close that worker.
5. If a worker fails twice on the same bug, stop delegating and handle it directly. If Blocker or
   High findings survive 3 bugfix rounds, take the case to the user.

Security-sensitive fixes and changes that alter the architecture are diagnosed *and* applied by
Claude, then recorded in `bugs.md`.

---

## 6. Progress visibility

Update the Orca worktree comment at checkpoints (worker dispatched, done, review passed, bugfix
dispatched, blocked):

```bash
orca worktree set --worktree <selector> --comment "<short current state>" --json
```

---

## 7. Maintaining this file

Role-specific instructions only. Anything every agent needs goes in `AGENTS.md`; anything the
worker needs goes in `docs/agents/worker.md`. Update the three in the same pass.
