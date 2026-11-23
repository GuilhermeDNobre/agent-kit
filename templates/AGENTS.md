# AGENTS.md

Shared contract for **every coding agent** in this repository, whatever the tool. It states what
the project is and how code is written here. It does not assign roles:

- the **coordinator** role lives in `CLAUDE.md`, which imports this file;
- the **worker** role (implementers and validators) lives in `docs/agents/worker.md`. **If you were
  launched with a brief, you are a worker: follow that file and your brief, not `CLAUDE.md`;**
- coding standards live in `.claude/rules/` (see `.claude/rules/README.md`);
- the role pipeline, autonomy limits and protected actions live in `.agent-kit/` (`workflow.json`,
  `autonomy.json`), and apply to every agent.

On conflict: role file (`CLAUDE.md` or `docs/agents/worker.md`) > this file > `.claude/rules/`.

## Project

**{{PROJECT_NAME}}** — {{PROJECT_DESCRIPTION}}

<!--IF:greenfield-->
## Stack: not chosen yet

The repository is still a greenfield scaffold. Language, framework, package manager, directory
layout, and test tooling are **open decisions that belong to the user**. No agent picks them
unilaterally. If a task cannot proceed without one of them, ask.

`.claude/rules/` is split accordingly — see `.claude/rules/README.md`:

- **Always apply:** `code-standards.md`, `logging.md`, `tests.md` (principles, tool-agnostic).
- **Apply only if that technology is chosen:** `node.md`, `react.md`, `http.md`.

Because no dependency manifest exists, there is **no runnable build, lint or test command yet**.
Never report a validation as passing when its command does not exist. Once the stack is chosen,
add its commands here and to the `checks` of `.agent-kit/config.json`.
<!--END-->
<!--IF:existing-->
## Stack

Detected manifest: `{{STACK_MANIFEST}}`.

`.claude/rules/` is split into two tiers — see `.claude/rules/README.md`:

- **Always apply:** `code-standards.md`, `logging.md`, `tests.md` (principles, tool-agnostic).
- **Apply only if that technology is part of this project:** `node.md`, `react.md`, `http.md`.

The code examples in the rules are illustrative and do not authorize adding a technology the
project does not have. Adding or replacing a language, framework, package manager or test tool is a
**user decision**.

### Commands

The single source of truth for how to build, test and lint. Agents run exactly what is listed here;
if the one you need is missing, ask instead of guessing. Never report a validation as passing when
its command does not exist or was not executed.

| Purpose | Command |
|---|---|
| Install | `{{CMD_INSTALL}}` |
| Build | `{{CMD_BUILD}}` |
| Test | `{{CMD_TEST}}` |
| Lint | `{{CMD_LINT}}` |
| Typecheck | `{{CMD_TYPECHECK}}` |
| Single test | `{{CMD_TEST_ONE}}` |

The commands that gate a workflow (lint, typecheck, test, build) are mirrored in the `checks` of
`.agent-kit/config.json`. Keep both in sync.
<!--END-->

Design decisions and their rejected alternatives belong in `docs/adr/`, and the domain glossary in
`CONTEXT.md`, once they exist. Read both before planning or implementing: they explain why the
code looks the way it does.

## Environment pitfalls

Facts about this machine and toolchain that cost a debugging session once. Keep them short; the
`/fechar-ciclo` command adds to this list.

- (none yet)

---

## Engineering rules

These bias toward caution over speed. For trivial tasks, use judgment.

### Think before acting

Do not assume, do not hide confusion, surface tradeoffs. State assumptions explicitly; if multiple
interpretations exist, present them instead of silently picking one. If something is unclear: a
worker reports `blocked`; the coordinator follows the escalation rules in `CLAUDE.md` (decide and
record a reversible assumption, or ask).

### Simplicity first

Minimum code that solves the problem, nothing speculative. No features beyond what was asked, no
abstractions for single-use code, no unrequested configurability, no error handling for impossible
scenarios. Simplicity governs **how** each item is implemented, never **whether** it is
implemented. Cutting scope is not simplification.

### Surgical changes

Touch only what the task requires. Do not improve adjacent code, comments, or formatting. Do not
refactor what is not broken. Match existing style. Mention unrelated dead code instead of deleting
it. Remove only the imports and symbols your own change orphaned.

### Goal-driven execution

Turn every task into a verifiable goal before starting: "add validation" becomes "write tests for
invalid inputs, then make them pass". Weak success criteria ("make it work") guarantee rework.

### The spec is the request

A PRD, TechSpec, or task file is a contract. Every item gets implemented. Never silently drop,
defer, merge, or "phase" items; if one looks unnecessary, ask before skipping. Before declaring a
multi-item task done, enumerate every item and its status:

```
- [Item 1] -> done
- [Item 2] -> partial - what is missing and why
- [Item 3] -> skipped - reason, surfaced earlier
```

### Honesty about validation

Never fabricate command output, test results, file paths, or dependencies. A validation counts only
when its output was observed in this session. Missing output means it did not run.

### Language

- **English:** source code, identifiers, comments, commit messages, PR descriptions, `AGENTS.md`,
  `CLAUDE.md`, `docs/agents/`.
- **Portuguese:** `.claude/commands/`, `.claude/templates/`, `.claude/rules/`, and every generated
  process document (`prd.md`, `techspec.md`, `tasks.md`, `*_task.md`, `bugs.md`).
- Conversation with the user follows the user's language.

### Comments

Prefer self-explanatory code. No restating what the code does, no TODOs, no section headers, no
"added for X" notes. Comment only when the *why* is non-obvious.

### Commits

- [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`, imperative,
  lowercase, no trailing period.
- **Never add `Co-Authored-By:` trailers or any assistant attribution.**
- Only the coordinator commits, and only when the user asks or `permissions.localCommits` in
  `.agent-kit/autonomy.json` is true. Pushing follows `permissions.push`.

### Code quality

Keep functions small and well under the complexity ceiling, modules focused, dependencies pointing
toward stable abstractions with no cycles. Tests cover the branches that can break, and their
assertions would fail if the logic were subtly wrong (`>` to `>=`, a flipped sign, a deleted line).

---

## Maintaining this file

Generated by `agent-kit` as a starting point. Keep it true to what the project is: exact commands,
non-obvious relationships between modules, conventions a newcomer could not infer from one file.
Keep it under ~200 lines; move topic-specific rules into `.claude/rules/`.
