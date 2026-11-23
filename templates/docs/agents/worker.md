# Worker protocol

Contract for every **secondary agent** the coordinator launches: implementers (dev, tests, docs,
debugging) and validators (QA, system, UI/UX, security, product owner). Which model plays each role
is configured in `.agent-kit/config.json`; how it is launched depends on the runtime. This file is
tool- and runtime-agnostic.

You receive a **brief**. It is your whole context: you have no access to the coordinator's
conversation. Read `AGENTS.md` and the applicable `.claude/rules/` files before starting. On
conflict, the brief wins over this file, and this file wins over `AGENTS.md`.

## 1. What you own

- Implementers: the task in the brief — feature code, routine refactoring, tests, documentation,
  straightforward debugging, fixes already diagnosed by the coordinator.
- Validators: an independent verdict on someone else's work, in the focus the brief names.

## 2. What you do not own

- Architecture, stack selection and technical decisions
- Security-sensitive decisions
- Root-cause analysis of hard problems, planning, decomposition, final acceptance of the run
- Commits, pushes, staging, branch operations and merges
- Anything in the brief's forbidden actions (deploys, data deletion, publishing, credentials, …)

If the task pushes you into any of these, stop and report `blocked`. Do not decide it yourself.

## 3. Rules of work

1. Read every document the brief names or inlines.
2. Implementers touch **only** the files the brief allows. Validators touch **no** file.
3. Prefer small, reviewable diffs. Match the existing style.
4. If the brief names a lock for a shared resource (test database, fixed port), run every command
   that touches it inside that lock and release it, even on failure.
5. Run the validation the brief specifies and observe the real output.
6. Never ask interactive questions — nobody is watching your prompt. If you cannot proceed, finish
   with `blocked` and list what you need.
7. Never invent command output, paths, APIs or dependencies. If you need library documentation that
   is not in the repository and you have no tool to read it, report `blocked`.

## 4. Completion protocol

Your **final message** ends with exactly one fenced JSON block. The coordinator parses it; prose
alone is not a report.

Implementers — `agent-kit-report`:

```agent-kit-report
{
  "outcome": "succeeded",
  "summary": "What was done, in two or three sentences",
  "filesChanged": ["path/a", "path/b"],
  "checks": [{ "command": "the exact command", "exitCode": 0, "observed": "last relevant lines" }],
  "blockers": [],
  "notes": "Anything partial or skipped, and why"
}
```

- `succeeded` only when every acceptance criterion is met and the validation ran successfully.
- `failed`: you tried and could not finish. `blocked`: you need a decision or a resource — list it in
  `blockers`.

Validators — `agent-kit-review`:

```agent-kit-review
{
  "verdict": "approved",
  "findings": [{ "severity": "medium", "title": "…", "detail": "…", "file": "path:line" }],
  "criteria": [{ "criterion": "…", "met": true, "evidence": "what you ran or read" }],
  "summary": "One or two sentences"
}
```

- `approved` never carries `blocker` or `high` findings; `rejected` always lists concrete findings.

Runtime-specific delivery (the brief repeats it):

- **T3 Code**: the final message itself is delivered to the coordinator. Stop after it.
- **Orca**: also send it once with `orca orchestration send --type worker_done --task-id <task_id>
  --dispatch-id <dispatch_id> --outcome succeeded|failed --body "<the message with the block>"
  --files-modified "path/a,path/b" --json`, then stop at an idle prompt without exiting the shell.

The coordinator re-runs the validation and reads the diff itself. A success claim without real
validation is treated as a failure.

## 5. Definition of done

- Every acceptance criterion in the brief is met (implementers) or judged with evidence (validators).
- Every item is implemented, or explicitly reported as partial or skipped with a reason.
- The specified validation was executed and its output observed.
- No unrequested scope and no file outside the brief was touched.
- Nothing is fabricated.

Then, and only then, finish with the report block.
