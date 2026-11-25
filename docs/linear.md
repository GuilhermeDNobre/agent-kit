# Linear as the task base

With `tracker.kind: "linear"`, Linear holds the backlog and its state; no runtime owns it. Task state
is owned by `agent-kit wf` and mirrored to Linear, so the same backlog can be worked from T3 Code or
Orca sessions without either one interfering.

## One Linear project per repository

Every route creates issues **only** in the repository's dedicated Linear project,
`tracker.linear.project` (`name`, optional `id`). Its default name is the project name written by
`init` (`--linear-project` overrides it), and `agent-kit validate` refuses a Linear tracker
without it. This keeps each repository's tasks isolated from other projects in the same team.

| Route | How the project is ensured |
|---|---|
| `api` | Looked up by name in the team; created (`projectCreate`) when missing |
| `orca` | Looked up with `orca linear project list`; when missing, created through the API if the key variable is set, otherwise the sync reports it and the user creates it once in Linear |
| `t3` | Every `create_issue` carries `project: <name>`; `/configurar-worker` confirms the issues land there |

## Routes

There are three ways to reach Linear:

| | `via: "t3"` (default on T3) | `via: "orca"` (default on Orca) | `via: "api"` |
|---|---|---|---|
| Credentials | None — the T3 project's Linear connection | None — Orca's Linear connection | Personal API key in an env var |
| Who calls Linear | The coordinator, with T3's issue tools; the CLI prints the calls | The CLI itself, through `orca linear …` | The CLI itself (GraphQL) |
| Hierarchy | Parent issue + task issues; "Parte de ANY-5" and "Depende de" in the body | Real sub-issues and `blocks` relations | Real sub-issues and `blocks` relations |
| Sync | `wf sync` prints `set_issue_state` / `comment_on_issue`; ack with `wf sync --ack` | Automatic after every command | Automatic after every command |
| Import a run from Linear | Not available (resume from the run file) | Not available (resume from the run file) | `wf new <run> --from-linear <ISSUE-ID>` |

## Linear through T3

1. In T3 Code, connect the project to Linear. `list_issues` should return issues with
   `tracker: "linear"`.
2. `npx @guilhermednobre/agent-kit init --tracker linear` (runtime `t3` is the default).
3. In a run:
   ```bash
   agent-kit wf new r1 --plan tasks/prd-x/plan.json     # prints create_issue for the parent
   agent-kit wf tracker-bind r1 _parent --key ANY-5 --url <url>
   agent-kit wf sync r1                                   # prints create_issue for each task
   agent-kit wf tracker-bind r1 1.0 --key ANY-6 ...
   agent-kit wf sync r1                                   # later: state changes + comments
   agent-kit wf sync r1 --ack 2,3,4                       # after making those calls
   ```

State names default to `Todo`, `In Progress`, `Done` and `Canceled` (`tracker.linear.stateNames`
overrides them; `read_issue` lists the team's real states). The parent issue moves to `Done` or
`Canceled` when the run completes or is cancelled.

### Tested for real on 2026-11-23

In this environment's T3 project connected to a Linear team:
- the parent issue and two task issues were created with the printed calls;
- the task issues were bound, one task was taken through dispatch, report, checks and three gates,
  the other was cancelled, and the run was completed;
- one `wf sync` produced three `set_issue_state` calls (task → `Done`, task → `Canceled`,
  parent → `Done`) and three grouped comments;
- `read_issue` confirmed the state, the comment and the intact `agent-kit-task` block;
- `wf sync --ack` left zero unsynced events.

The task lifecycle in that run was driven by the coordinator to exercise the tracker; the real
worker and gate run is described in `docs/runtime-t3.md`.

## Linear through the API

```bash
npx @guilhermednobre/agent-kit init --runtime orca --tracker linear --linear-team ENG
export LINEAR_API_KEY=lin_api_...     # variable name: tracker.linear.apiKeyEnv
```

`stateMap` values are a workflow state **name** of your team (e.g. `"In Review"`) or a state
**type** (`backlog`, `unstarted`, `started`, `completed`, `canceled`); names win. Labels are applied
only if they already exist in the team.

| agent-kit | Linear |
|---|---|
| `wf new` (with `--plan`) | Parent issue; one sub-issue per task; `blocks` relations for `dependsOn` |
| Every task transition | `issueUpdate` to the mapped state + a comment with the reason |
| `wf replan` | New tasks become new sub-issues |
| `wf new --from-linear ENG-123` | Rebuilds the plan from sub-issues that carry an `agent-kit-task` block; completed ones stay completed |

API surface, verified against Linear's public schema (`linear/linear`,
`packages/sdk/src/schema.graphql`) and <https://linear.app/developers/graphql>: endpoint
`https://api.linear.app/graphql`, header `Authorization: <API_KEY>` (no `Bearer`),
`teams(filter: { key })`, `workflowStates(filter: { team })`, `issueLabels`, `issueCreate`,
`issueUpdate`, `issueRelationCreate` (`type: blocks`), `commentCreate`, `issue(id)` with `children`
and `inverseRelations`. This mode is covered by mocked tests; it was **not** run against a live
workspace (no API key was provided).

## Failure behaviour

Linear is never on the critical path: if a call fails, the transition is still saved locally and
the event stays queued (`wf status` shows `unsyncedEvents`) until `agent-kit wf sync <run>` delivers
it.

## Linear through Orca

```bash
orca linear team list --json            # Linear connected in Orca; note the team key
npx @guilhermednobre/agent-kit init --runtime orca --tracker linear --linear-team ANY
```

| agent-kit | `orca linear` |
|---|---|
| `wf new` (with `--plan`) | `create --team --project --label agent-kit` for the parent; `create … --parent <parent>` per task; `relation add <dep> --related <task> --type blocks` |
| Every task transition | `status set <issue> --to <state name>` + `comment add <issue>` |
| Run completed / cancelled | Parent moves to `Done` / `Canceled` |

State names come from `tracker.linear.stateNames` (defaults: `Todo`, `In Progress`, `Done`,
`Canceled`; `orca linear team states` lists the team's real ones). The CLI calls the `orca`
executable (or `ORCA_CLI_COMMAND`) directly with `--json`; bodies go through stdin. Covered by
tests with a mocked `orca`; not yet run against a live workspace.
