import {
  ACTIVE_TASK_STATES,
  TERMINAL_TASK_STATES,
  TransitionError,
  canTransitionTask,
  canTransitionWorkflow,
} from "./states.js";
import { executionWaves, selectDispatchable, validateGraph } from "./dag.js";
import { validatePlan } from "./config.js";

const TASK_FIELDS = ["id", "title", "role", "profile", "tags", "dependsOn", "files", "doc", "context", "acceptance", "validation", "tracker"];

function pickTask(task) {
  const picked = {};
  for (const field of TASK_FIELDS) if (task[field] !== undefined) picked[field] = task[field];
  picked.dependsOn = picked.dependsOn || [];
  picked.validation = picked.validation || [];
  picked.context = picked.context || [];
  picked.tags = picked.tags || [];
  picked.role = picked.role || "implementation";
  return picked;
}

export function assertPlan(plan) {
  const errors = [...validatePlan(plan)];
  if (errors.length === 0) errors.push(...validateGraph(plan.tasks));
  if (errors.length) throw new Error(`Invalid plan:\n- ${errors.join("\n- ")}`);
}

export function createRun({ id, objective, plan, runtime, now, completed = [] }) {
  assertPlan(plan);
  const run = {
    id,
    objective: objective || plan.objective || "",
    feature: plan.feature || null,
    runtime,
    state: "planning",
    createdAt: now,
    updatedAt: now,
    tasks: {},
    order: plan.tasks.map((task) => task.id),
    waves: executionWaves(plan.tasks),
    finalChecks: null,
    tracker: plan.tracker || null,
    history: [],
    events: [],
  };
  for (const task of plan.tasks) {
    run.tasks[task.id] = { ...pickTask(task), state: "pending", attempts: [], fixCycles: 0, budgetBase: 0, fix: null, notes: [] };
  }
  for (const taskId of completed) {
    const task = getTask(run, taskId);
    task.state = "completed";
    task.imported = true;
    log(run, { at: now, scope: "task", id: taskId, from: "pending", to: "completed", reason: "already completed in the tracker" });
  }
  setWorkflowState(run, "running", "plan accepted", now);
  refreshReadiness(run, now);
  return run;
}

function log(run, entry) {
  run.history.push(entry);
  run.events.push({ ...entry, synced: false });
  run.updatedAt = entry.at;
}

export function setTaskState(run, taskId, to, reason, now) {
  const task = getTask(run, taskId);
  if (task.state === to) return task;
  if (!canTransitionTask(task.state, to)) throw new TransitionError("task", taskId, task.state, to);
  log(run, { at: now, scope: "task", id: taskId, from: task.state, to, reason });
  task.state = to;
  return task;
}

export function setWorkflowState(run, to, reason, now) {
  if (run.state === to) return;
  if (!canTransitionWorkflow(run.state, to)) throw new TransitionError("workflow", run.id, run.state, to);
  log(run, { at: now, scope: "workflow", id: run.id, from: run.state, to, reason });
  run.state = to;
}

export function getTask(run, taskId) {
  const task = run.tasks[taskId];
  if (!task) throw new Error(`Unknown task "${taskId}" in run ${run.id}`);
  return task;
}

function orderedTasks(run) {
  return run.order.map((id) => run.tasks[id]).filter(Boolean);
}

export function refreshReadiness(run, now) {
  for (const task of orderedTasks(run)) {
    if (task.state !== "pending" && task.state !== "ready") continue;
    const deps = task.dependsOn.map((id) => run.tasks[id]);
    const dead = deps.find((dep) => dep.state === "cancelled" || dep.state === "failed");
    if (dead) {
      setTaskState(run, task.id, "blocked", `dependency ${dead.id} is ${dead.state}`, now);
    } else if (deps.every((dep) => dep.state === "completed")) {
      setTaskState(run, task.id, "ready", "dependencies completed", now);
    } else if (task.state === "ready") {
      setTaskState(run, task.id, "pending", "dependency reopened", now);
    }
  }
}

function minutesSince(iso, now) {
  return (Date.parse(now) - Date.parse(iso)) / 60000;
}

export function nextActions(run, autonomy, now) {
  refreshReadiness(run, now);
  const tasks = orderedTasks(run);
  const running = tasks.filter((task) => task.state === "running");
  const holders = tasks.filter((task) => ACTIVE_TASK_STATES.includes(task.state));
  const slots = Math.max(0, autonomy.maxWorkers - running.length);
  const ready = tasks.filter((task) => task.state === "ready");
  const dispatch = selectDispatchable(ready, holders, slots).map((task) => task.id);
  const waitingForFiles = ready.filter((task) => !dispatch.includes(task.id) && slots > dispatch.length).map((task) => task.id);
  const overdue = running
    .map((task) => ({ task, attempt: currentAttempt(task) }))
    .filter(({ attempt }) => attempt && minutesSince(attempt.lastProgressAt || attempt.dispatchedAt, now) > autonomy.taskTimeoutMinutes)
    .map(({ task, attempt }) => ({ id: task.id, runtimeRef: attempt.runtimeRef, runtime: attempt.runtime, since: attempt.dispatchedAt }));
  const unconfirmed = running
    .filter((task) => !currentAttempt(task)?.runtimeRef && currentAttempt(task)?.executor !== "coordinator")
    .map((task) => ({ id: task.id, clientRequestId: currentAttempt(task)?.clientRequestId }));
  return {
    workflow: run.state,
    dispatch,
    waitingForFiles,
    running: running.map((task) => ({ id: task.id, runtimeRef: currentAttempt(task)?.runtimeRef || null })),
    overdue,
    unconfirmed,
    awaitingChecks: tasks.filter((task) => task.state === "testing").map((task) => task.id),
    awaitingReview: tasks.filter((task) => task.state === "review").map((task) => reviewSummary(task)),
    blocked: tasks.filter((task) => task.state === "blocked").map((task) => ({ id: task.id, reason: lastReason(run, task.id) })),
    failed: tasks.filter((task) => task.state === "failed").map((task) => ({ id: task.id, reason: lastReason(run, task.id) })),
    allTasksDone: tasks.every((task) => TERMINAL_TASK_STATES.includes(task.state)),
  };
}

function reviewSummary(task) {
  const gates = currentAttempt(task).gates || {};
  const ids = Object.keys(gates);
  return {
    id: task.id,
    ready: ids.filter((id) => gateReady(gates, id) && !gates[id].dispatchedAt),
    inProgress: ids.filter((id) => gates[id].status === "pending" && gates[id].dispatchedAt).map((id) => ({ gate: id, runtimeRef: gates[id].runtimeRef })),
    waiting: ids.filter((id) => gates[id].status === "pending" && !gateReady(gates, id)),
    approved: ids.filter((id) => gates[id].status === "approved"),
  };
}

function lastReason(run, taskId) {
  const entry = [...run.history].reverse().find((item) => item.scope === "task" && item.id === taskId);
  return entry?.reason || null;
}

export function currentAttempt(task) {
  return task.attempts[task.attempts.length - 1] || null;
}

export function attemptsInBudget(task) {
  return task.attempts.length - task.budgetBase;
}

export function startAttempt(run, taskId, { profile, executor, runtime, briefPath, briefHash, now }) {
  const task = getTask(run, taskId);
  if (task.state !== "ready") throw new Error(`Task ${taskId} is ${task.state}, not ready`);
  const number = task.attempts.length + 1;
  task.attempts.push({
    number,
    profile,
    executor,
    runtime,
    clientRequestId: `agent-kit:${run.id}:${taskId}:${number}`,
    briefPath,
    briefHash,
    fix: task.fix,
    dispatchedAt: now,
    lastProgressAt: now,
    runtimeRef: null,
    report: null,
    checks: null,
    gates: null,
    outcome: null,
    finishedAt: null,
  });
  setTaskState(run, taskId, "running", `attempt ${number} dispatched (${profile})`, now);
  if (run.state === "blocked") setWorkflowState(run, "running", `task ${taskId} dispatched`, now);
  return task.attempts[number - 1];
}

export function bindRuntimeRef(run, taskId, runtimeRef, now, gateId) {
  const attempt = requireAttempt(run, taskId);
  if (gateId) {
    const gate = attempt.gates?.[gateId];
    if (!gate?.dispatchedAt) throw new Error(`Gate "${gateId}" of ${taskId} was not started`);
    gate.runtimeRef = runtimeRef;
    log(run, { at: now, scope: "attempt", id: taskId, from: null, to: "bound", reason: `gate ${gateId} runtime ref ${runtimeRef}` });
    return gate;
  }
  attempt.runtimeRef = runtimeRef;
  attempt.lastProgressAt = now;
  log(run, { at: now, scope: "attempt", id: taskId, from: null, to: "bound", reason: `runtime ref ${runtimeRef}` });
  return attempt;
}

export function touch(run, taskId, note, now) {
  const attempt = requireAttempt(run, taskId);
  attempt.lastProgressAt = now;
  getTask(run, taskId).notes.push({ at: now, note });
  return attempt;
}

function requireAttempt(run, taskId) {
  const attempt = currentAttempt(getTask(run, taskId));
  if (!attempt) throw new Error(`Task ${taskId} has no attempt`);
  return attempt;
}

export function recordReport(run, taskId, parsed, autonomy, now) {
  const task = getTask(run, taskId);
  if (task.state !== "running") throw new Error(`Task ${taskId} is ${task.state}; a report is only accepted while running`);
  const attempt = currentAttempt(task);
  attempt.report = parsed.report || { outcome: "unreported", errors: parsed.errors };
  attempt.finishedAt = now;
  if (!parsed.valid) {
    setTaskState(run, taskId, "testing", `report invalid (${parsed.errors.join("; ")}); verifying independently`, now);
    return { next: "verify" };
  }
  const { outcome } = parsed.report;
  if (outcome === "succeeded") {
    setTaskState(run, taskId, "testing", "worker reported success; awaiting independent checks", now);
    return { next: "verify" };
  }
  if (outcome === "blocked") {
    attempt.outcome = "blocked";
    setTaskState(run, taskId, "blocked", `worker blocked: ${parsed.report.blockers.join("; ")}`, now);
    syncWorkflow(run, now);
    return { next: "resolve-blocker", blockers: parsed.report.blockers };
  }
  return applyFailure(run, taskId, { kind: "worker", details: parsed.report.summary }, autonomy, now);
}

export function applicableGates(task, workflow) {
  const gates = workflow?.gates?.length ? workflow.gates : [{ id: "review", role: "review", when: "always" }];
  const chosen = gates.filter((gate) => {
    const when = gate.when || "always";
    return when === "always" || (when.startsWith("tag:") && task.tags.includes(when.slice(4)));
  });
  const ids = new Set(chosen.map((gate) => gate.id));
  const result = {};
  for (const gate of chosen) {
    result[gate.id] = { role: gate.role, after: (gate.after || []).filter((id) => ids.has(id)), status: "pending", runtimeRef: null, dispatchedAt: null, profile: null, executor: null, review: null };
  }
  return result;
}

function gateReady(gates, id) {
  return gates[id].status === "pending" && gates[id].after.every((dep) => gates[dep].status === "approved");
}

export function recordChecks(run, taskId, checks, autonomy, now, workflow) {
  const task = getTask(run, taskId);
  if (task.state !== "testing") throw new Error(`Task ${taskId} is ${task.state}, not testing`);
  const attempt = currentAttempt(task);
  attempt.checks = { at: now, ...checks };
  if (checks.skipped && autonomy.completion.requireTaskChecks) {
    return applyFailure(run, taskId, { kind: "checks", details: "task has no validation commands and requireTaskChecks is on" }, autonomy, now);
  }
  if (checks.passed) {
    attempt.gates = applicableGates(task, workflow);
    setTaskState(run, taskId, "review", checks.skipped ? "no task checks defined; review must cover behaviour" : "checks passed", now);
    return { next: "review" };
  }
  const failing = checks.results.filter((result) => !result.passed && result.required).map((result) => result.name);
  return applyFailure(run, taskId, { kind: "checks", details: `failing: ${failing.join(", ")}`, results: checks.results }, autonomy, now);
}

export function startGate(run, taskId, gateId, { profile, executor, now }) {
  const attempt = reviewAttempt(run, taskId);
  const gate = attempt.gates[gateId];
  if (!gate) throw new Error(`Gate "${gateId}" does not apply to task ${taskId}`);
  if (!gateReady(attempt.gates, gateId)) throw new Error(`Gate "${gateId}" of ${taskId} is not ready (status ${gate.status}; after: ${gate.after.join(", ") || "none"})`);
  Object.assign(gate, { profile, executor, dispatchedAt: now, runtimeRef: null });
  log(run, { at: now, scope: "attempt", id: taskId, from: null, to: `gate:${gateId}`, reason: `gate ${gateId} started (${profile})` });
  return gate;
}

function reviewAttempt(run, taskId) {
  const task = getTask(run, taskId);
  if (task.state !== "review") throw new Error(`Task ${taskId} is ${task.state}, not in review`);
  const attempt = currentAttempt(task);
  if (!attempt.gates) attempt.gates = applicableGates(task, null);
  return attempt;
}

export function recordReview(run, taskId, { gate: gateId, verdict, reviewer, findings = [], criteria = [] }, autonomy, now) {
  const task = getTask(run, taskId);
  const attempt = reviewAttempt(run, taskId);
  const pending = Object.keys(attempt.gates).filter((id) => attempt.gates[id].status === "pending");
  const id = gateId || (pending.length === 1 ? pending[0] : null);
  if (!id) throw new Error(`Task ${taskId} has several pending gates (${pending.join(", ")}); pass --gate`);
  const gate = attempt.gates[id];
  if (!gate) throw new Error(`Gate "${id}" does not apply to task ${taskId}`);
  if (!gateReady(attempt.gates, id)) throw new Error(`Gate "${id}" of ${taskId} must wait for: ${gate.after.join(", ")}`);
  if (autonomy.completion.requireIndependentReview && reviewer === attempt.executor) {
    throw new Error(`Gate "${id}" of ${taskId} must be independent: reviewer "${reviewer}" implemented it`);
  }
  if (verdict !== "approved" && verdict !== "rejected") throw new Error('verdict must be "approved" or "rejected"');
  gate.status = verdict;
  gate.review = { at: now, verdict, reviewer, findings, criteria };
  log(run, { at: now, scope: "attempt", id: taskId, from: `gate:${id}`, to: verdict, reason: `gate ${id} ${verdict} by ${reviewer}${findings.length ? `: ${findings.length} finding(s)` : ""}` });
  if (verdict === "rejected") {
    const labelled = findings.map((finding) => `[${id}] ${finding}`);
    return applyFailure(run, taskId, { kind: "review", details: `gate ${id} rejected the work`, findings: labelled }, autonomy, now);
  }
  const remaining = Object.keys(attempt.gates).filter((key) => attempt.gates[key].status !== "approved");
  if (remaining.length) return { next: "gates", remaining, ready: remaining.filter((key) => gateReady(attempt.gates, key)) };
  attempt.outcome = "succeeded";
  task.fix = null;
  setTaskState(run, taskId, "completed", `all gates approved (${Object.keys(attempt.gates).join(", ")})`, now);
  refreshReadiness(run, now);
  syncWorkflow(run, now);
  return { next: "continue" };
}

export function retryDecision(task, autonomy, kind) {
  const attempts = attemptsInBudget(task);
  const fixCycles = task.fixCycles + (kind === "checks" || kind === "review" ? 1 : 0);
  if (attempts >= autonomy.maxAttemptsPerTask || fixCycles > autonomy.maxFixCycles) {
    const takenOver = currentAttempt(task)?.executor === "coordinator";
    const to = takenOver && autonomy.escalation.onBudgetExhausted === "coordinator-takeover" ? "ask-user" : autonomy.escalation.onBudgetExhausted;
    return { action: "escalate", to, attempts, fixCycles };
  }
  const last = currentAttempt(task)?.profile;
  let profile = last;
  if (autonomy.retry.strategy === "escalate-profile") {
    const ladder = autonomy.retry.ladder;
    const index = ladder.indexOf(last);
    if (index >= 0 && index < ladder.length - 1) profile = ladder[index + 1];
  }
  return { action: "retry", profile, attempts, fixCycles };
}

function applyFailure(run, taskId, failure, autonomy, now) {
  const task = getTask(run, taskId);
  const attempt = currentAttempt(task);
  attempt.outcome = "failed";
  attempt.finishedAt = attempt.finishedAt || now;
  const decision = retryDecision(task, autonomy, failure.kind);
  task.fixCycles = decision.fixCycles;
  if (decision.action === "retry") {
    task.fix = { kind: failure.kind, details: failure.details, findings: failure.findings || [], fromAttempt: attempt.number, profile: decision.profile };
    setTaskState(run, taskId, "ready", `${failure.kind} failed; retry ${decision.attempts + 1} with profile ${decision.profile}`, now);
    return { next: "redispatch", decision };
  }
  setTaskState(run, taskId, "failed", `${failure.kind} failed; budget exhausted (${decision.attempts} attempts, ${decision.fixCycles} fix cycles) -> ${decision.to}`, now);
  task.fix = { kind: failure.kind, details: failure.details, findings: failure.findings || [], fromAttempt: attempt.number, profile: null };
  if (decision.to === "fail") setWorkflowState(run, "failed", `task ${taskId} exhausted its budget and the policy is "fail"`, now);
  else syncWorkflow(run, now);
  return { next: decision.to, decision };
}

export function markLost(run, taskId, reason, autonomy, now) {
  const task = getTask(run, taskId);
  if (task.state !== "running") throw new Error(`Task ${taskId} is ${task.state}, not running`);
  return applyFailure(run, taskId, { kind: "lost", details: reason }, autonomy, now);
}

export function unblock(run, taskId, resolution, now) {
  const task = getTask(run, taskId);
  if (task.state !== "blocked") throw new Error(`Task ${taskId} is ${task.state}, not blocked`);
  task.notes.push({ at: now, note: `unblocked: ${resolution}` });
  task.fix = { kind: "blocker", details: resolution, findings: [], fromAttempt: currentAttempt(task)?.number || 0, profile: currentAttempt(task)?.profile || null };
  setTaskState(run, taskId, "pending", `unblocked: ${resolution}`, now);
  refreshReadiness(run, now);
  syncWorkflow(run, now);
}

export function reopenForTakeover(run, taskId, now) {
  const task = getTask(run, taskId);
  if (task.state !== "failed" && task.state !== "blocked") throw new Error(`Task ${taskId} is ${task.state}; takeover is for failed or blocked tasks`);
  setTaskState(run, taskId, "ready", "coordinator takes the task over", now);
  if (run.state === "blocked") setWorkflowState(run, "running", `coordinator took over ${taskId}`, now);
  return task;
}

export function cancelTask(run, taskId, reason, now) {
  setTaskState(run, taskId, "cancelled", reason, now);
  refreshReadiness(run, now);
  syncWorkflow(run, now);
}

function syncWorkflow(run, now) {
  if (!["running", "blocked"].includes(run.state)) return;
  const tasks = orderedTasks(run);
  const stuck = tasks.some((task) => task.state === "failed" || task.state === "blocked");
  const moving = tasks.some((task) => ["ready", "running", "testing", "review"].includes(task.state));
  if (stuck && !moving) setWorkflowState(run, "blocked", "no task can progress without coordinator action", now);
  else if (run.state === "blocked" && moving) setWorkflowState(run, "running", "work can progress again", now);
}

export function recordFinalChecks(run, checks, now) {
  const active = orderedTasks(run).filter((task) => task.state === "running");
  if (active.length) throw new Error(`Final checks need a quiet checkout; still running: ${active.map((task) => task.id).join(", ")}`);
  run.finalChecks = { at: now, ...checks };
  log(run, { at: now, scope: "workflow", id: run.id, from: null, to: "final-checks", reason: checks.passed ? "final checks passed" : "final checks failed" });
}

export function completionStatus(run, autonomy, config) {
  const missing = [];
  const tasks = orderedTasks(run);
  const rules = autonomy.completion;
  if (rules.requireAllTasks) {
    const open = tasks.filter((task) => task.state !== "completed" && task.state !== "cancelled");
    if (open.length) missing.push(`tasks not completed: ${open.map((task) => `${task.id} (${task.state})`).join(", ")}`);
  }
  if (rules.requireFinalChecks) {
    if (!(config.checks || []).length) missing.push("no project checks configured in .agent-kit/config.json (checks)");
    else if (!run.finalChecks) missing.push("final checks have not run (agent-kit wf verify <run> --final)");
    else if (!run.finalChecks.passed) missing.push("final checks failed");
    else if (lastTaskChange(run) > run.finalChecks.at) missing.push("final checks are older than the last task change");
  }
  if (rules.requireIndependentReview) {
    const unreviewed = tasks.filter((task) => {
      if (task.state !== "completed" || task.imported) return false;
      const gates = currentAttempt(task)?.gates;
      return !gates || Object.values(gates).some((gate) => gate.status !== "approved");
    });
    if (unreviewed.length) missing.push(`completed without review: ${unreviewed.map((task) => task.id).join(", ")}`);
  }
  return { complete: missing.length === 0, missing };
}

function lastTaskChange(run) {
  const entries = run.history.filter((entry) => entry.scope === "task");
  return entries.length ? entries[entries.length - 1].at : "";
}

export function completeRun(run, autonomy, config, now) {
  const status = completionStatus(run, autonomy, config);
  if (!status.complete) return status;
  setWorkflowState(run, "completed", "all completion criteria met", now);
  return status;
}

export function resumePlan(run, autonomy, now, runtime) {
  const tasks = orderedTasks(run);
  const reconcile = [];
  const redispatchSameKey = [];
  const foreign = [];
  const coordinatorOwned = [];
  for (const task of tasks.filter((item) => item.state === "running")) {
    const attempt = currentAttempt(task);
    if (attempt.executor === "coordinator") {
      coordinatorOwned.push({ id: task.id, briefPath: attempt.briefPath });
    } else if (attempt.runtime && runtime && attempt.runtime !== runtime) {
      foreign.push({ id: task.id, runtime: attempt.runtime, runtimeRef: attempt.runtimeRef });
    } else if (attempt.runtimeRef) {
      reconcile.push({ id: task.id, runtimeRef: attempt.runtimeRef });
    } else {
      redispatchSameKey.push({ id: task.id, clientRequestId: attempt.clientRequestId, briefPath: attempt.briefPath });
    }
  }
  return { workflow: run.state, reconcile, redispatchSameKey, foreign, coordinatorOwned, next: nextActions(run, autonomy, now) };
}

export function replan(run, plan, now) {
  assertPlan(plan);
  const incoming = new Map(plan.tasks.map((task) => [task.id, task]));
  for (const task of orderedTasks(run)) {
    if (!incoming.has(task.id) && !TERMINAL_TASK_STATES.includes(task.state)) {
      if (ACTIVE_TASK_STATES.includes(task.state)) throw new Error(`Cannot drop ${task.id} while it is ${task.state}; cancel it first`);
      setTaskState(run, task.id, "cancelled", "removed by replan", now);
    }
  }
  for (const spec of plan.tasks) {
    const existing = run.tasks[spec.id];
    if (!existing) {
      run.tasks[spec.id] = { ...pickTask(spec), state: "pending", attempts: [], fixCycles: 0, budgetBase: 0, fix: null, notes: [] };
      log(run, { at: now, scope: "task", id: spec.id, from: null, to: "pending", reason: "added by replan" });
      continue;
    }
    if (existing.state === "completed" || ACTIVE_TASK_STATES.includes(existing.state)) continue;
    Object.assign(existing, pickTask(spec));
    if (existing.state === "failed" || existing.state === "blocked") {
      existing.budgetBase = existing.attempts.length;
      existing.fixCycles = 0;
      setTaskState(run, spec.id, "pending", "reset by replan", now);
    }
  }
  run.order = [...new Set([...plan.tasks.map((task) => task.id), ...run.order])];
  const live = run.order.map((id) => run.tasks[id]);
  const errors = validateGraph(live);
  if (errors.length) throw new Error(`Replan produced an invalid graph:\n- ${errors.join("\n- ")}`);
  run.waves = executionWaves(live);
  if (run.state === "blocked" || run.state === "failed") setWorkflowState(run, run.state === "failed" ? "planning" : "running", "replanned", now);
  if (run.state === "planning") setWorkflowState(run, "running", "replanned", now);
  refreshReadiness(run, now);
  syncWorkflow(run, now);
}
