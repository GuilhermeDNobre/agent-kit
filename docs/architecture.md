# Architecture

agent-kit has two halves:

- **Contracts** (Markdown written into the project): who does what, how to behave, what to report.
  Agents read them.
- **The `agent-kit` CLI** (this package): deterministic state, scheduling, briefs, verification and
  policy. The coordinator calls it; it never calls an LLM.

The runtime tools (T3's `delegate_task`, Orca's terminals) are only reachable by the coordinator
session, not by a Node process. So the CLI computes *what to call* and records *what happened*; the
coordinator makes the call. That keeps the package dependency-free, testable without a live
session, and honest about what it controls.

```
            objective
                │
   ┌────────────▼────────────┐   reads    ┌──────────────────────────────┐
   │ Coordinator (Claude)    │──────────▶│ CLAUDE.md · AGENTS.md ·       │
   │  pm · architect · gates │           │ .agent-kit/runtime/<rt>.md    │
   └──┬───────────────▲──────┘           └──────────────────────────────┘
      │ agent-kit wf  │ JSON: next / call / verdicts
   ┌──▼───────────────┴──────────────────────────────────────────────┐
   │ CLI (src/cli)                                                   │
   │  ┌──────────── Core (src/core) — no runtime imports ──────────┐ │
   │  │ config · states · dag · engine · policy · briefing ·      │ │
   │  │ report · verify · store                                   │ │
   │  └───────────────────────────────────────────────────────────┘ │
   │  Runtime adapters (src/runtimes): t3 · orca · registerAdapter  │
   │  Trackers (src/trackers): local · linear                       │
   └──┬─────────────────────────────────────────┬────────────────────┘
      │ call printed for the coordinator        │ GraphQL (fetch)
   ┌──▼──────────────────────┐            ┌──────▼──────┐
   │ T3 delegate_task / Orca │            │ Linear      │
   │ → worker / validator    │            └─────────────┘
   └─────────────────────────┘
```

## Core (`src/core`)

| Module | Responsibility |
|---|---|
| `config.js` | Defaults and validation for `config.json`, `autonomy.json`, `workflow.json` and plans; role → profile resolution |
| `states.js` | Task and workflow states and their allowed transitions |
| `dag.js` | Graph validation (unknown deps, cycles with path), waves, conservative file-overlap, slot-limited selection |
| `engine.js` | The workflow: create, readiness, next actions, attempts, reports, checks, gates, retry/escalation, takeover, unblock, cancel, replan, resume, completion |
| `briefing.js` | Self-contained implementation and gate briefs; context inlining with size limits; SHA-256 hash |
| `report.js` | Worker (`agent-kit-report`) and validator (`agent-kit-review`) block parsing |
| `verify.js` | Runs checks as child processes with timeouts and captures real exit codes |
| `policy.js` | Protected-action and protected-path classification; self-contained so it is copied into projects for the hook |
| `store.js` | Atomic persistence of runs and artifacts under `.agent-kit/runs/<run>/` |

### States

Task: `pending → ready → running → testing → review → completed`, plus `blocked`, `failed`,
`cancelled`. Workflow: `planning → running ⇄ blocked → completed | failed | cancelled`.
(`planning` covers the PRD/TechSpec/tasks phase, which happens before `wf new`.) Every transition
is validated, appended to `history`, and queued in `events` for the tracker.

```
pending ──deps done──▶ ready ──dispatch──▶ running ──report ok──▶ testing ──checks pass──▶ review ──all gates──▶ completed
   ▲                     ▲                    │ failed/lost            │ checks fail             │ gate rejected
   │                     └──────── retry (budget left, profile may escalate) ◀────────────────────┘
   │                                          │ budget exhausted → failed ──takeover──▶ ready
   └── unblock ◀── blocked ◀── worker reported "blocked" / dependency failed
```

### Run files

```
.agent-kit/runs/<run>/
  run.json             state, attempts, gates, history, tracker events
  briefs/<task>.<n>.md  briefs/<task>.<n>.gate-<gate>.md
  inbox/                raw worker answers saved by the coordinator
  reports/ reviews/ checks/
```

Whether to commit `.agent-kit/runs/` is a project choice: committing gives an audit trail and lets
another machine resume; ignoring keeps history clean (use the Linear tracker to share state).

## Runtime adapters (`src/runtimes`)

An adapter turns the same core inputs into runtime-specific instructions:

```js
{
  name, description,
  completionNote,                     // one line appended to every brief
  validateProfile(profile, config),   // -> [errors]
  dispatch({ run, task, attempt, brief, profile, config }),  // -> printed call
  status({ attempt }), cancel({ attempt, reason }),
  interpretStatus(rawStatus),         // -> { finished, summary }
}
```

### Adding a runtime

1. Create `src/runtimes/<name>.js` exporting an object with the shape above.
2. Register it in `src/runtimes/index.js` (`registerAdapter`) and add the name to `RUNTIMES` in
   `src/core/config.js`.
3. Add `templates/agent-kit/runtime/<name>.md` explaining how the coordinator performs dispatch,
   result collection, overdue handling and resume on that runtime. `init --runtime <name>` installs
   only that guide, and `<!--IF:runtime-<name>-->` blocks select runtime-specific template text.
4. Add contract tests next to `test/runtimes.test.js`.

## Trackers (`src/trackers`)

`local` only marks events as synced. `linear` mirrors runs into Linear (see `docs/linear.md`).
Tracker calls are outside the core and never block a transition: failures leave events queued.

## Hooks

- `PreToolUse` → `.agent-kit/hooks/pretooluse.mjs`: classifies Bash/PowerShell commands and file
  writes with the project's `autonomy.json`; answers `ask` (or `deny`) for protected actions.
- `SessionStart` → `.agent-kit/hooks/session-context.mjs`: lists unfinished runs so a new session
  resumes instead of starting over.

## Decisions

- **No `workflow` engine process.** A long-running daemon would need its own access to T3/Orca and
  would duplicate the runtime's lifecycle management. The CLI is stateless between calls; state is
  the run file.
- **No duplicate monitoring on T3.** T3 delivers completions to the parent; polling is forbidden by
  its contract. agent-kit only adds timeouts *as prompts to check*, never as kills.
- **Briefs inline context** because T3 children get no parent history and worktree-isolated
  children do not see uncommitted files.
- **Conservative file overlap.** Glob prefixes, not exact matching: a false conflict costs time, a
  missed one costs a merge conflict between workers.
- **Model ids live only in project config**, filled from the runtime's live catalogue.
