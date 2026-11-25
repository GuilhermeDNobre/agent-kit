# Migrating from 0.3 to 0.4

1. `npx @guilhermednobre/agent-kit@latest init -y` in the project: it adds the runtime guide you
   do not have yet and keeps every existing file. Take the new `.agent-kit/runtime/orca.md`,
   `.claude/commands/configurar-worker.md` and `docs/agents/worker.md` with `init` (choose `b`) and
   merge them.
2. Open Claude Code in the session that will coordinate (an Orca terminal or T3) and run
   `/configurar-worker`. It detects the runtime, switches with `agent-kit runtime set` if needed,
   and rewrites the Orca profiles (`provider` = Orca agent id, `model`, `options.effort`).
3. Remove `runtimes.orca.launchCommand` and `runtimes.orca.readiness` from `.agent-kit/config.json`.
4. With Linear: set `tracker.linear.project.name` (the repository's dedicated Linear project) and,
   on Orca, `tracker.linear.via: "orca"` and `tracker.linear.teamKey`. `projectId` still works, but
   `project.id` replaces it.
5. `agent-kit validate`.

Runs in flight keep their old Orca refs (`<terminal>|<task>`); `wf cancel` and `wf resume` print
the old terminal commands for them.

# Migrating from 0.2 (Orca-only) to 0.3

0.3 keeps every 0.2 command and template, and adds a runtime-independent core, the T3 runtime, a
role pipeline with validation gates, autonomy policy and the Linear tracker.

## What changed for a generated project

| 0.2 | 0.3 |
|---|---|
| `CLAUDE.md` §2 held the Orca recipe | `CLAUDE.md` imports `.agent-kit/runtime/<runtime>.md`; the Orca recipe lives in `.agent-kit/runtime/orca.md` |
| One worker recipe | Model profiles per role in `.agent-kit/config.json` |
| Worker finished with `orca orchestration send --type worker_done` | Worker ends its final message with an `agent-kit-report` block; on Orca it also sends `worker_done` with that block in the body |
| `orca orchestration ask` for questions | Workers report `outcome: "blocked"` with `blockers` |
| Review = one `/executar-review` | Gates `qa`, `system`, `uiux` (tag `ui`), `security` (tag `security`), `acceptance` |
| Planning commands always interactive | Interactive alone; assumption-driven inside `/executar-workflow` |
| Parallelism, retries, limits in prose | Enforced by `agent-kit wf` from `plan.json` and `autonomy.json` |
| Workers marked tasks done in `tasks.md` | State is owned by `agent-kit wf`; workers do not edit `tasks.md` |

## Upgrading an existing project

1. `npx @guilhermednobre/agent-kit@latest init --dry-run` to see the plan.
2. Run `init` interactively and choose **both** (`b`) for `CLAUDE.md`, `AGENTS.md`,
   `docs/agents/worker.md` and changed commands, so your edits stay and the new versions land as
   `*.new`. Merge them by hand; keep your project-specific sections (commands, pitfalls, rules).
3. New files (`.agent-kit/**`, new commands, `.claude/settings.json`) are created directly. If you
   already have `.claude/settings.json`, merge the `hooks` section from the `.new` file.
4. To keep using Orca: `init --runtime orca`, then move the recipe from your old `CLAUDE.md` §2 into
   the `WORKER-RECIPE` block of `.agent-kit/runtime/orca.md` and set `runtimes.orca.launchCommand`
   and `runtimes.orca.readiness` in `.agent-kit/config.json` (or rerun `/configurar-worker`).
5. To switch to T3: `init --runtime t3` and run `/configurar-worker`.
6. For features already planned with 0.2: add a `plan.json` next to `tasks.md`
   (`.claude/templates/plan-template.json`), then `agent-kit validate --plan …` and `wf new`.
7. `agent-kit validate`.

The package itself has no breaking change in `init` flags: `--name`, `--description`, `--mode`,
`--force`, `-y` and `--dry-run` behave as before; `--runtime` defaults to `t3`, and
`--tracker` to `local`.
