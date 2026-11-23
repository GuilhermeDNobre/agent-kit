# Runtime: T3 Code (+ Antigravity)

T3 Code is the recommended runtime. The coordinator is the parent thread (Claude Opus in Claude
Code); every worker and validator is a child thread started with `delegate_task`. The generated
project guide is `.agent-kit/runtime/t3.md`; this page is the setup and background.

## T3 tools used

Verified against the tool schemas T3 exposes to the coordinator session (2026-11-23):

| Tool | Parameters agent-kit relies on |
|---|---|
| `orchestrator_capabilities` | Returns `providers[]` with `providerInstanceId`, `canRunChildTask`, `models[].id`, `models[].options` |
| `delegate_task` | `task` (the only context the child receives), `title`, `role` (`implementation`/`research`/`review`/`design`/`test`/`general`), `mode` (`async` default; `wait` ≤ 45 s and a timeout does not cancel), `isolation` (`shared`/`worktree`), `clientRequestId` (retry key), `target` `{ providerInstanceId, model, options }` → returns `taskId` |
| `task_status` | `workState` (`working`, `waiting_for_children`, `result_available`), `summary`. Not to be polled — completion wakes the parent |
| `task_cancel` | Stops a task and its children; finished tasks keep their result |
| `t3_thread_send` | Follow-up on a child; a send to a finished child starts a fresh task |

`agent-kit wf dispatch` prints `call.args` ready to pass to `delegate_task` unchanged; `wf gate`
does the same for validators.

## Choosing models

Profiles live in `.agent-kit/config.json`. `/configurar-worker` calls `orchestrator_capabilities`,
shows what your account can run, and saves the choice:

```json
"profiles": {
  "fast":      { "provider": "antigravity", "model": "<fast model id>",     "options": { "thought_level": "low" } },
  "standard":  { "provider": "antigravity", "model": "<everyday model id>", "options": { "thought_level": "high" } },
  "advanced":  { "provider": "antigravity", "model": "<strongest model id>", "options": { "thought_level": "xhigh" } },
  "validator": { "provider": "claudeAgent", "model": "<a model different from the implementers>", "options": { "effort": "medium" } },
  "coordinator": { "provider": "coordinator", "model": null }
},
"roles": { "pm": "coordinator", "architect": "coordinator", "implementation": "standard", "docs": "fast",
           "debug": "advanced", "qa": "validator", "system": "validator", "uiux": "validator",
           "security": "validator", "product-owner": "validator", "release": "coordinator" }
```

Model ids are never shipped in templates: catalogues change and differ by account. On the machine
used to build this release, `orchestrator_capabilities` listed an enabled `antigravity` provider
with several Gemini models (each with a `thought_level` option) plus Claude models, and the
`claudeAgent` provider; `agy models` (Antigravity CLI 1.5.15) listed the same Gemini family with
effort suffixes. Use whatever your own listing shows.

**Quotas.** Antigravity models run under your Google plan's limits; a Pro subscription is not
unlimited API access. Keep `maxWorkers` low (2–3), put mechanical work on `fast`, and expect
rate-limit errors to show up as failed attempts — the retry ladder handles them.

## Isolation

`runtimes.t3.isolation`:

- `shared` (default): children edit the parent checkout. The scheduler keeps parallel tasks on
  disjoint files. Simple, and the coordinator sees changes immediately.
- `worktree`: each child gets a checkout from the parent **commit**. Uncommitted work is invisible
  to it and its changes must be integrated. Use only with `permissions.localCommits: true`.

## Real integration test (manual)

Automated tests cover the adapter contract with mocks. To exercise a real session:

1. In a scratch directory: `npx @guilhermednobre/agent-kit init -y`, then set real model ids in
   `.agent-kit/config.json` (or run `/configurar-worker`).
2. Write a one-task `tasks/prd-x/plan.json` (small function + test, with a `validation` command).
3. In the coordinator session:
   ```bash
   agent-kit wf new t1 --plan tasks/prd-x/plan.json
   agent-kit wf dispatch t1 1.0          # pass call.args to delegate_task
   agent-kit wf started t1 1.0 --ref <taskId>
   ```
4. When the completion arrives, save the summary under `.agent-kit/runs/t1/inbox/1.0.md`, then
   `wf report`, `wf verify`, `wf gate t1 1.0 qa` (dispatch it), `wf review … --gate qa --file …`,
   the remaining gates, `wf verify t1 --final`, `wf complete t1`.

### Result on 2026-11-23

Executed in this environment with T3 Code, Claude Opus 5.5 as coordinator:

| Step | Outcome |
|---|---|
| `delegate_task` with the args printed by `wf dispatch` (Antigravity, Gemini 3.8 Flash, `thought_level: low`) | Accepted; `wait` timed out at 45 s with the child still `working`, as documented; completion was delivered to the parent afterwards |
| Worker result | Ended with a valid `agent-kit-report`, touched only the two files the brief allowed |
| `wf report` → `wf verify` | Report valid; the coordinator re-ran the validation itself (exit 0) |
| Gate `qa` via `delegate_task` (claudeAgent, Claude Sonnet 5.5) | Returned a valid `agent-kit-review` (approved, one `low` finding, limitations declared honestly) |
| Gates `system`, `acceptance` (coordinator), `wf verify --final`, `wf complete` | Run `completed` |

Lessons applied: gate briefs now carry the runtime delivery note and no longer assume a git
repository.

Not covered by that run: `isolation: "worktree"`, `task_cancel`, resuming after a real session
restart, and quota exhaustion. They are covered by the mocked contract tests only.
