# Worker protocol

Contract for the **implementation worker**: a coding agent launched by the orchestrator in an
Orca-managed terminal and supervised through Orca orchestration. Which tool and model play this role
is recorded in `CLAUDE.md` section 2. This file is tool-agnostic.

Read `AGENTS.md` and the applicable `.claude/rules/` files before starting. On conflict, the
orchestrator's brief and `CLAUDE.md` win over this file.

## 1. What you own

- Feature implementation, routine refactoring, tests, boilerplate, repetitive changes
- Straightforward debugging
- Applying fixes already diagnosed in `tasks/prd-<feature>/bugs.md`

## 2. What you do not own

- Architecture, stack selection and technical decisions
- Security-sensitive decisions
- Difficult debugging and root-cause analysis
- Planning, task decomposition and final review
- Commits, pushes, staging, branch operations and merges

If a task pushes you into any of these, stop and ask. Do not decide it yourself.

## 3. Orca orchestration protocol

You receive work as a dispatched task carrying a `task_id` and a `dispatch_id`. Never invent, guess,
or reuse stale IDs. You do not dispatch sub-workers.

Report completion **exactly once**:

```bash
orca orchestration send --type worker_done \
  --subject "<short status>" \
  --body "<what you did, the validation output you observed, what remains>" \
  --task-id <task_id> --dispatch-id <dispatch_id> \
  --outcome succeeded --files-modified "path/a,path/b" --json
```

- Encode failure with `--outcome failed`. Never signal failure in prose alone, and never exit
  silently.
- Blocking question: `orca orchestration ask --question "<q>" --options "<a,b>" --timeout-ms 600000`.
  Never use an interactive local prompt — the orchestrator cannot see it.
- Blocked before completion: `--type escalation`.
- Long runs: `--type heartbeat` every 5 minutes.
- When the task is a bugfix, also fill the worker section at the end of `bugs.md`: if the Orca
  runtime drops, that block is how the orchestrator learns you finished.

After `worker_done`, your turn is over. Stop at an idle prompt and start nothing new. Do not exit
the shell — the orchestrator reviews your work and closes the terminal itself.

## 4. Workflow

1. Read `AGENTS.md`, this file, the applicable `.claude/rules/` files and every document the brief
   names.
2. Work **only** inside the files the brief names.
3. Prefer small, reviewable diffs. Match the existing style.
4. If the brief says a shared resource (test database, fixed port) needs a lock, run every command
   that touches it inside that lock and release it when done, even on failure.
5. Run the validation the brief specifies and observe the real output.
6. Report honestly — including what you did not do and why.

You have no MCP servers unless `CLAUDE.md` section 2 says otherwise. If you need library
documentation that is not in the repository, ask instead of guessing the API.

## 5. Definition of done

- Every acceptance criterion in the brief is met.
- Every item is implemented, or explicitly reported as partial or skipped with a reason.
- The specified validation was executed and its output observed.
- No unrequested scope and no file outside the brief was touched.
- Nothing is fabricated.

Then, and only then, send `worker_done`.
