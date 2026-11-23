# Runtime: Orca (legacy)

How the coordinator runs workers on **Orca**. Imported by `CLAUDE.md`. The workflow rules come from
`agent-kit wf`; this file only maps each step onto Orca commands. T3 Code is the recommended
runtime; Orca stays supported for existing setups.

## Worker recipe

<!--WORKER-RECIPE-->
**Not configured.** Run `/configurar-worker`.
<!--/WORKER-RECIPE-->

`/configurar-worker` also writes `runtimes.orca.launchCommand` (with an optional `{model}`
placeholder) and `runtimes.orca.readiness` into `.agent-kit/config.json`.

## Dispatch

```bash
agent-kit wf next <run>
agent-kit wf dispatch <run> <task>     # prints { call: { kind: "shell", commands: [...] } }
```

Run the printed commands in order (run-create once per run; a worktree only when parallelizing),
then record the terminal handle and Orca task id:
`agent-kit wf started <run> <task> --ref "<handle>|<task_id>"`.

- Never pass `--inject`. Deliver the preamble by file reference, not by pasting a long brief.
- Do not use `orca orchestration worker-start`: a failed start marks the task `failed` and forces a
  new task row.
- When the task has a Linear issue (tracker `linear`), the worktree command carries
  `--linear-issue`, so Orca shows the same issue the tracker updates.

## Supervising

The Orca notification reaches the user, not Claude. After every dispatch, arm a background
**Monitor** that polls `orca orchestration check --run <run> --json` every 30 s. It acknowledges
batches that hold only heartbeats (`check --run <run> --ack <delivery_id>`) and exits **without**
acknowledging when a `worker_done`, `question` or `escalation` arrives. Re-arm it on timeout.

On `worker_done`: save its body (it carries the `agent-kit-report` block) to
`.agent-kit/runs/<run>/inbox/<task>.md` and run
`agent-kit wf report <run> <task> --file .agent-kit/runs/<run>/inbox/<task>.md`.

On `question`: answer it if the answer is inferable and reversible; otherwise follow the
escalation rules in `CLAUDE.md`. On `escalation`: record it as a blocked report.

If the Orca runtime drops, the `worker_done` may be lost. Detect the end from the files on disk and
the worker's terminal (`orca terminal read`), then record the report or `wf lost`.

## Closing workers

Close a worker only after its review is recorded: `orca terminal close --terminal <handle> --tab --json`
(`agent-kit wf cancel` prints this for cancelled tasks). Never close one on a timeout, a heartbeat or
an unreviewed `worker_done`. After a reboot, Orca may restore old worker terminals: close them
before relaunching.

## Worktrees

- A new Orca worktree branches from `origin/main`: what the worker needs must be pushed first —
  which is a protected action unless `autonomy.permissions.push` is true. Prefer the current
  worktree when pushing is not allowed.
- `orca worktree rm` deletes the local branch. Note its SHA, and commit reviewed work first.
- From Git Bash, prefix `MSYS_NO_PATHCONV=1` when sending slash-prefixed text or POSIX paths.

## Progress visibility

Update the worktree comment at checkpoints:
`orca worktree set --worktree <selector> --comment "<short current state>" --json`.
