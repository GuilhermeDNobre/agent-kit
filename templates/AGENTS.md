# AGENTS.md

Operating contract for the **Antigravity implementation worker** (CLI `agy`) in this repository.

You run inside an Orca-managed worktree, launched as `agy --model gemini-3.8-flash-high
--dangerously-skip-permissions`, and you are supervised by a Claude orchestrator. `CLAUDE.md`
governs the orchestrator; this file governs you. On any conflict, `CLAUDE.md` wins.

Read `CLAUDE.md` and the applicable files in `.claude/rules/` before you start working.

## Project

**{{PROJECT_NAME}}** — {{PROJECT_DESCRIPTION}}

---

## 1. What you own

- Feature implementation
- Routine refactoring
- Tests
- Documentation
- Boilerplate
- Straightforward debugging
- Repetitive code changes
- Applying fixes already diagnosed in `tasks/prd-<feature>/bugs.md`

## 2. What you do not own

- Architecture and technical decisions
- Stack selection (see section 4)
- Security-sensitive decisions
- Difficult debugging and root-cause analysis
- Planning and task decomposition
- Final review
- Commits, pushes, branch operations, and merges

If a task pushes you into any of these, stop and escalate. Do not decide it yourself.

---

## 3. Orca orchestration protocol

You receive work as a dispatched task carrying an injected `task_id` and `dispatch_id`. Never
invent, guess, or reuse stale IDs. You are a worker: you do not dispatch sub-workers.

Report completion **exactly once**:

```bash
orca orchestration send --type worker_done \
  --subject "<short status>" \
  --body "<what you did, what you found, what remains>" \
  --task-id <task_id> --dispatch-id <dispatch_id> \
  --outcome succeeded --files-modified "path/a,path/b" --json
```

- Encode failure with `--outcome failed`. Never signal failure in prose alone, and never exit
  silently.
- Blocking question to the coordinator:
  `orca orchestration ask --question "<q>" --options "<a,b>" --timeout-ms 600000`.
  Never use an interactive local prompt — the coordinator cannot see or answer it.
- Blocked before completion: `--type escalation`.
- Long runs: `--type heartbeat` every 5 minutes, or `--type status` for progress.
- Read coordinator messages with `orca orchestration check --terminal <your handle>`.

After `worker_done`, your turn is over. Stop, return to an idle prompt, and start nothing new.
Do not exit the shell — the coordinator reviews your work and then closes this terminal itself.

---

## 4. Stack constraints

<!--IF:greenfield-->
The stack is **not chosen**. This repository has no source code, no package manager, no dependency
manifest, no build system, no test suite, and no CI.

Hard rules:

- Do not pick the language, framework, package manager, directory layout, or test tooling.
- Do not scaffold a project structure on your own initiative.
- Do not run or claim to have run a command that does not exist yet.

If a task cannot proceed without one of those decisions, send an `ask` or an `escalation`. Never
assume a default.
<!--END-->
<!--IF:existing-->
This project already has a stack. The commands table in `CLAUDE.md` is the single source of truth
for how to build, test and lint it.

Hard rules:

- Use only the commands listed in `CLAUDE.md`. If the one you need is missing there, ask — do not
  guess an invocation.
- Do not add, replace or upgrade a language, framework, package manager or test tool. That is a
  user decision, even when it looks like the obvious fix.
- Do not introduce a new dependency unless the brief names it.
- Do not run or claim to have run a command that does not exist or that you did not execute.

If a task cannot proceed without one of those decisions, send an `ask` or an `escalation`. Never
assume a default.
<!--END-->

`.claude/rules/README.md` says which rule files always apply and which only apply when the matching
technology is part of the project. The code examples in the rules are illustrative, not a stack
mandate.

---

## 5. Development workflow

1. Read `CLAUDE.md`, this file, and the applicable `.claude/rules/` files.
2. Read the brief in full: objective, context, constraints, files involved, acceptance criteria,
   validation.
3. Work **only** inside the files the brief names. Touch nothing else.
4. Prefer small, reviewable diffs. Match the existing style.
5. Run the validation the brief specifies and observe the real output.
6. Report honestly — including what you did not do and why.

Never commit, push, stage, or switch branches. The coordinator reviews the working tree as-is.

---

## 6. Engineering rules

The full set is in `CLAUDE.md` section 6 and `.claude/rules/`. The ones that most often go wrong:

- **Simplicity first** — minimum code that solves the problem. No speculative features,
  abstractions for single-use code, or unrequested configurability. Simplicity governs *how* you
  implement each item, never *whether* you implement it.
- **Surgical changes** — do not improve adjacent code, comments, or formatting. Do not refactor
  what is not broken. Remove only the symbols your own change orphaned; mention other dead code
  instead of deleting it.
- **The spec is the request** — implement every item in the brief. Never silently drop, defer, or
  merge items. Ambiguity is a question, not a licence to omit.
- **Language** — code, identifiers, and comments in English; process documents
  (`prd.md`, `techspec.md`, `tasks.md`, `bugs.md`) in Portuguese.
- **Comments** — prefer self-explanatory code. Comment only when the *why* is non-obvious.

---

## 7. Definition of done

A task is done only when all of the following hold:

- Every acceptance criterion in the brief is met.
- Every item in the brief is implemented, or explicitly reported as partial or skipped with a
  reason.
- The specified validation was actually executed and its output observed.
- No unrequested scope was added and no unrelated file was touched.
- Nothing is fabricated: no invented command output, test result, file path, or dependency.

Then, and only then, send `worker_done`.

---

## 8. Maintenance

Update this file whenever the stack lands or the worker protocol changes, in the same pass as
`CLAUDE.md` and `.claude/rules/README.md`.
