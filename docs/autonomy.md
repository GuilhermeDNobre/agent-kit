# Autonomy policy

`.agent-kit/autonomy.json` decides what the coordinator does without asking, how failures are
retried and escalated, which actions are protected, and when a run counts as done.
`agent-kit validate` checks it. Missing keys fall back to the defaults below.

```json
{
  "version": 1,
  "level": "autonomous",
  "maxWorkers": 3,
  "maxAttemptsPerTask": 3,
  "maxFixCycles": 3,
  "taskTimeoutMinutes": 60,
  "retry": { "strategy": "escalate-profile", "ladder": ["fast", "standard", "advanced"] },
  "escalation": {
    "onBudgetExhausted": "coordinator-takeover",
    "askUserFor": ["greenfield-stack", "product-scope-ambiguity", "business-rule-conflict", "protected-action", "budget-exhausted-after-takeover"]
  },
  "permissions": {
    "installDevDependencies": true,
    "localCommits": false,
    "push": false,
    "denyWrite": [".env", ".env.*", "**/*.pem", "**/*.key", "**/secrets/**", "**/credentials*.json"]
  },
  "protectedActions": { "decision": "ask", "allow": [], "categories": ["…see below…"] },
  "completion": { "requireAllTasks": true, "requireFinalChecks": true, "requireIndependentReview": true, "requireTaskChecks": false },
  "recovery": { "reconcileBeforeRedispatch": true, "preservePartialResults": true }
}
```

## Settings

| Key | Effect |
|---|---|
| `level` | `autonomous`: no approvals for normal work. `supervised`: the coordinator presents the plan before dispatching (documented behaviour of the contracts) |
| `maxWorkers` | Concurrent implementation workers. Gates do not take slots. `1` = strictly one slice at a time |
| `maxAttemptsPerTask` | Dispatches per task before escalation (reset by `wf replan`) |
| `maxFixCycles` | Failed checks + rejected gates per task before escalation |
| `taskTimeoutMinutes` | After this long without progress, `wf next` lists the task as `overdue` — a prompt to **check** the runtime, never an automatic kill |
| `retry.strategy` | `escalate-profile` moves to the next profile in `retry.ladder` on each retry; `same-profile` keeps it |
| `escalation.onBudgetExhausted` | `coordinator-takeover` (`wf takeover`), `ask-user`, or `fail`. A takeover that fails again always goes to the user |
| `escalation.askUserFor` | The only categories in which the coordinator stops to ask. Everything else is decided, reversibly, and recorded in `assumptions.md` |
| `permissions.installDevDependencies` | Whether adding dev dependencies needs no approval |
| `permissions.localCommits` / `push` | Gate `git commit` / `git push` |
| `permissions.denyWrite` | Globs that need approval to write |
| `protectedActions.decision` | `ask` (Claude Code prompts you) or `deny` (blocked; the coordinator must ask in chat) |
| `protectedActions.allow` | Category ids to unprotect for this project (e.g. `"package-publish"` in a release repo) |
| `protectedActions.categories` | `{ id, description, patterns[] }` with case-insensitive regexes over the command line |
| `completion.*` | What `wf complete` requires |

## Protected categories (defaults)

| Id | Examples |
|---|---|
| `production-deploy` | `vercel --prod`, `flyctl deploy`, `gcloud … deploy`, `git push … production` |
| `production-infra` | `terraform apply/destroy`, `pulumi up`, `helm upgrade`, `kubectl apply/delete` |
| `data-destruction` | `DROP TABLE`, `TRUNCATE`, `DELETE FROM x;` without `WHERE`, `prisma migrate reset`, `rm -rf /` or `~` |
| `external-destructive` | `git push --force`, `gh repo delete`, `gh pr merge`, `aws s3 rm`, `docker push` |
| `package-publish` | `npm publish`, `cargo publish`, `twine upload`, `gh release create` |
| `financial` | Stripe charges, refunds, payouts, subscriptions |
| `credential-exposure` | `cat .env`, `printenv`, `echo $API_TOKEN`, `gh auth token` |
| `git-push` / `git-commit` | Any push / commit while the permission is off |
| `protected-path` | Writes matching `permissions.denyWrite` |

Check any command: `agent-kit policy check -- <command>` (exit `0` allowed, `3` needs approval).

## How approval works

1. **Coordinator (Claude Code):** the PreToolUse hook runs the same classifier before every
   Bash/PowerShell call and file write. Protected → Claude Code asks you (`ask`) or blocks (`deny`).
   The coordinator contract also says to ask before protected actions, so both layers agree.
2. **Workers:** other runtimes do not run Claude Code hooks. Every brief lists the forbidden actions,
   and the worker contract forbids commits, pushes and stack decisions. Treat this as a contract,
   not a sandbox; for hard isolation use the runtime's own permission modes.
3. **Release:** `/executar-release` only starts on your explicit order, and each deploy command
   still goes through the hook.

Limitations: pattern matching can be evaded by obfuscated commands; it guards against mistakes,
not against a malicious agent. In fully non-interactive sessions, `ask` may behave like `deny`.
