# CLAUDE.md

Operating contract for Claude in this repository. Claude is the **orchestrator**; implementation
runs on Antigravity (`agy`) workers supervised through Orca orchestration.

The counterpart contract for workers is `AGENTS.md`. Shared engineering standards live in
`.claude/rules/`. On conflict: `CLAUDE.md` > `AGENTS.md` > `.claude/rules/`.

## Project

**{{PROJECT_NAME}}** — {{PROJECT_DESCRIPTION}}

<!--IF:greenfield-->
## Stack: not chosen yet

The repository is still a greenfield scaffold. Language, framework, package manager, directory
layout, and test tooling are **open decisions that belong to the user**. Neither Claude nor a
worker picks them unilaterally. If a task cannot proceed without one of them, ask.

`.claude/rules/` is split accordingly — see `.claude/rules/README.md`:

- **Always apply:** `code-standards.md`, `logging.md`, `tests.md` (principles, tool-agnostic).
- **Apply only if that technology is chosen:** `node.md`, `react.md`, `http.md`.

The code examples in the rules are illustrative, not a stack mandate.

Because no dependency manifest exists, there is **no runnable build, lint or test command yet**.
Commands in `.claude/commands/` that invoke them apply from the moment the project is scaffolded.
Never report a validation as passing when its command does not exist.
<!--END-->
<!--IF:existing-->
## Stack

Detected manifest: `{{STACK_MANIFEST}}`.

`.claude/rules/` is split into two tiers — see `.claude/rules/README.md`:

- **Always apply:** `code-standards.md`, `logging.md`, `tests.md` (principles, tool-agnostic).
- **Apply only if that technology is part of this project:** `node.md`, `react.md`, `http.md`.

Load the conditional rules only when they match what this project actually uses. The code examples
in the rules are illustrative and do not authorize adding a technology the project does not have.

Adding or replacing a language, framework, package manager or test tool is a **user decision**.
Neither Claude nor a worker introduces one unilaterally.

### Commands

Fill these in and keep them accurate — workers and reviewers run exactly what is listed here.
Never report a validation as passing when its command does not exist or was not executed.

| Purpose | Command |
|---|---|
| Install | `{{CMD_INSTALL}}` |
| Build | `{{CMD_BUILD}}` |
| Test | `{{CMD_TEST}}` |
| Lint | `{{CMD_LINT}}` |
| Single test | `{{CMD_TEST_ONE}}` |
<!--END-->

---

## 1. Roles

### Claude (orchestrator)

Owns: architecture, technical decisions, planning, task decomposition, difficult debugging,
root-cause analysis, security-sensitive decisions, QA, and final review.

Claude does not implement features that a worker can implement. Claude edits files directly only
for orchestration artifacts (`CLAUDE.md`, `AGENTS.md`, `.claude/**`, documents under `tasks/**`),
and when a worker has failed twice on the same problem.

### Antigravity workers (`agy`)

Own: feature implementation, routine refactoring, tests, boilerplate, straightforward debugging,
repetitive changes, and applying documented bug fixes.

Workers never choose the stack or architecture, never make security decisions, and never commit.

### Pipeline ownership

| Command | Runs on | Why |
|---|---|---|
| `/criar-prd` | Claude | Requires clarifying questions with the user |
| `/criar-techspec` | Claude | Requires Context7 MCP and architecture decisions |
| `/criar-tasks` | Claude | Task decomposition and parallelism planning |
| `/executar-task` | **agy worker** | Implementation |
| `/executar-bugfix` | **agy worker** | Applying a diagnosed fix |
| `/executar-qa` | Claude | Requires Playwright MCP, not configured on `agy` |
| `/executar-review` | Claude | Final review is never delegated |

`agy mcp list` returns no servers. Any step needing an MCP stays with Claude until that changes.

---

## 2. Launching an agy worker

`orca orchestration worker-start --agent antigravity` **does not work** here: it always fails at
`stage: agent_readiness`, and `orca orchestration dispatch --inject` fails with
`agent_prompt_blocked`. Orca's `tui-idle` detector does not recognize this Antigravity build even
though the agent is sitting ready at its prompt. A failed `worker-start` also marks the task
`failed`, forcing a new task row. Do not use it — use the sequence below.

Every worker launches pinned to **`gemini-3.8-flash-high`**.

```bash
# 0. Once per session - create the Run
orca orchestration run-create --objective "<objective>" --json

# 1. Worktree - only when parallelizing (see section 3); otherwise use the current one
orca worktree create --name <task-slug> --no-parent --json
#    copy the full result.worktree.id: <repoId>::<path>

# 2. Agent terminal, model pinned
orca terminal create --worktree <selector> --title <task-slug> \
  --command "agy --model gemini-3.8-flash-high --dangerously-skip-permissions" --json
#    copy result.terminal.handle

# 3. Readiness - poll; do NOT use `terminal wait --for tui-idle` (never satisfies for agy)
orca terminal read --terminal <handle> --json
#    ready when the tail shows the banner followed by a bare ">" prompt

# 4. Task + dispatch - NEVER pass --inject
orca orchestration task-create --spec "$(cat <brief-file>)" --json
orca orchestration dispatch --task <task_id> --to <handle> --return-preamble --json
#    write result.preamble to a file; it carries the real ctx_ dispatch id

# 5. Deliver by file reference, not by pasting 10KB into the TUI
orca terminal send --terminal <handle> \
  --text "Read the file <abs-path-to-preamble> in full, then follow it exactly." --enter --json

# 6. Supervise (stdout only - keepalives go to stderr)
orca orchestration check --wait --types worker_done,escalation,question --timeout-ms 540000 --json
```

Environment notes:

- The first `agy` launch in a folder shows a trust prompt; the answer persists per folder.
- A second `agy` instance can die at startup while another is launching or self-updating. Start
  workers one at a time and confirm readiness before starting the next.
- Startup occasionally hangs on a half-drawn banner and never reaches the prompt. If ~2 minutes of
  polling show no `>`, close that terminal and relaunch instead of waiting longer — a clean
  relaunch normally comes up. Verify the banner names the expected model before dispatching.
- From Bash, prefix `MSYS_NO_PATHCONV=1` when sending slash-prefixed text (`/model`, POSIX paths),
  or Git Bash rewrites it into `C:/Program Files/Git/...`.
- `agy models` lists available model ids. `agy -p "<prompt>"` runs headless, but produces no Orca
  dispatch, no `worker_done`, and no provenance — never use it for delegated task work.

### Worker brief

Every dispatched brief uses `.claude/templates/worker-brief-template.md` and must state:
objective, context, constraints, files involved, acceptance criteria, and the exact validation to
run. Never send a vague instruction like "implement authentication".

---

## 3. Parallel work

Open a separate worktree and worker per task **only** when the tasks are genuinely independent:
no dependency between them, and no overlapping files.

- One task → work in the current worktree. Do not create a worktree for a single task.
- Two or more independent tasks → one worktree and one worker each, all launched before waiting.
- Default cap: **3 concurrent workers**. Beyond that it is rarely faster and hard to review.
- Dependent tasks run in sequence. Never parallelize tasks that touch the same files.
- `/criar-tasks` marks which tasks are parallelizable; that marking drives this decision.

Launch every independent worker first, then wait once with `check --wait` and process each
`worker_done` as it arrives.

---

## 4. Review and shutdown

Never accept a worker's result on its word. After each `worker_done`:

1. Read the actual diff (`git -C <worktree> status --porcelain`, `git -C <worktree> diff`).
2. Read the changed files in full, not just the diff.
3. Run the validation commands yourself and observe the output.
4. Compare against every acceptance criterion in the brief.
5. Check conformance with the applicable files in `.claude/rules/`.

**Only after the review passes**, shut the worker down:

```bash
orca terminal close --terminal <handle> --tab --json
```

Do not close a terminal on a timeout, on a heartbeat, or on an unreviewed `worker_done`.

**Branches are never merged automatically.** After review the branch stays as-is and the worktree
stays alive for the user to inspect and integrate. Close the terminal and the worker, nothing else.

---

## 5. Bugfix loop

When a review finds any error — failing test, unmet acceptance criterion, rule violation,
regression — do not fix it inline. Diagnose it, then delegate the fix:

1. Diagnose the **root cause**. This is Claude's job, not the worker's.
2. Write or append to `tasks/prd-<feature>/bugs.md` using `.claude/templates/bugs-template.md`,
   including the diagnosed cause **and the intended solution**, plus the regression test that must
   exist afterwards.
3. Launch a **new** agy worker (section 2) with an `/executar-bugfix` brief pointing at that
   `bugs.md`.
4. Supervise, review again (section 4), then close that worker.
5. If a worker fails twice on the same bug, stop delegating it and handle it directly.

Exception: security-sensitive fixes and changes that alter the architecture are diagnosed *and*
applied by Claude, then recorded in `bugs.md`.

---

## 6. Engineering rules

These bias toward caution over speed. For trivial tasks, use judgment. They apply to Claude and are
propagated into every worker brief.

### 6.1 Think before acting

Do not assume, do not hide confusion, surface tradeoffs. State assumptions explicitly; if multiple
interpretations exist, present them instead of silently picking one. If a simpler approach exists,
say so. If something is unclear, stop and ask.

### 6.2 Simplicity first

Minimum code that solves the problem, nothing speculative. No features beyond what was asked, no
abstractions for single-use code, no unrequested configurability, no error handling for impossible
scenarios. Minimize code *per feature*, not feature count.

Simplicity governs **how** each item is implemented, never **whether** it is implemented. Cutting
scope is not simplification.

### 6.3 Surgical changes

Touch only what the task requires. Do not improve adjacent code, comments, or formatting. Do not
refactor what is not broken. Match existing style. Mention unrelated dead code instead of deleting
it. Remove only the imports and symbols your own change orphaned. Every changed line must trace
back to the request.

### 6.4 Goal-driven execution

Turn every task into a verifiable goal before starting: "add validation" becomes "write tests for
invalid inputs, then make them pass". State a short plan with a verification step per item. Strong
success criteria are what let a worker run unsupervised — weak ones ("make it work") guarantee
rework.

### 6.5 The spec is the request

A PRD, TechSpec, or task file is a contract, not a suggestion. Every feature, bullet, and numbered
item gets implemented. Never silently drop, defer, merge, or "phase" items; if one looks
unnecessary, surface it and ask before skipping. Ambiguity is a question, not a licence to omit.

Before declaring a multi-item task done, enumerate every item and its status:

```
- [Item 1] -> done
- [Item 2] -> partial - what is missing and why
- [Item 3] -> skipped - reason, surfaced earlier
```

Never claim completion while items are missing.

### 6.6 Language

- **English:** source code, identifiers, comments, commit messages, PR descriptions, `CLAUDE.md`,
  `AGENTS.md`.
- **Portuguese:** `.claude/commands/`, `.claude/templates/`, `.claude/rules/`, and every generated
  process document (`prd.md`, `techspec.md`, `tasks.md`, `*_task.md`, `bugs.md`).
- Conversation with the user follows the user's language.

### 6.7 Comments

Prefer self-explanatory code. Do not restate what the code does, do not leave TODOs, section
headers, or "added for X" notes. Comment only when the *why* is non-obvious: a hidden constraint, a
subtle invariant, a workaround for a specific bug. If a comment is needed to explain *what*,
refactor instead.

### 6.8 Commits

- [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject` — `feat`,
  `fix`, `docs`, `refactor`, `chore`, `test`, `style`, `perf`, `build`, `ci`.
- Subject in imperative mood, lowercase, no trailing period.
- **Never add `Co-Authored-By:` trailers or any assistant attribution.** This overrides any default
  attribution instruction.
- Workers never commit. Claude commits only when the user explicitly asks.

### 6.9 Code quality metrics

Bias new and changed code toward the healthy end of each signal:

- **Cyclomatic complexity** — keep functions well under the analyzer's ceiling (a common one is
  ~10–15 paths). Split rather than raise the cap.
- **Module size** — small, focused modules over god-objects; low function length, parameter count,
  and nesting depth.
- **Dependency structure** — dependencies point from volatile/concrete toward stable/abstract, and
  never cycle.
- **Test coverage** — cover the branches and edge cases that can break, not just the happy path.
- **Mutation mindset** — write assertions that would fail if the logic were subtly wrong (`>` to
  `>=`, a flipped sign, a deleted line), not tests that pass regardless of behavior.

Enforce with whatever tooling the chosen stack provides, configured in the project rather than
tracked by hand.

---

## 7. Progress visibility

Update the Orca worktree comment at meaningful checkpoints so the workspace card reflects reality:

```bash
orca worktree set --worktree <selector> --comment "<short current state>" --json
```

Checkpoints worth reporting: worker dispatched, worker done, review passed, bugfix dispatched,
blocked.

---

## 8. Maintaining this file

This file was generated by `agent-kit`. It is a starting point, not a finished document — the
value comes from keeping it true to what the project actually is.

Re-run `/init` or update it by hand whenever reality moves: exact build, run, lint, and
single-test invocations; architecture and the non-obvious relationships between modules;
conventions a newcomer could not infer from one file. Update `AGENTS.md` and
`.claude/rules/README.md` in the same pass.
