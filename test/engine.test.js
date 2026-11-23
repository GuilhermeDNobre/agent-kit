import { test } from "node:test";
import assert from "node:assert/strict";
import * as engine from "../src/core/engine.js";
import { defaultAutonomy, defaultWorkflow } from "../src/core/config.js";

const T0 = "2026-11-23T10:00:00.000Z";
const at = (minutes) => new Date(Date.parse(T0) + minutes * 60000).toISOString();
const WORKER = "antigravity:model-a";
const VALIDATOR = "claudeAgent:model-b";

function plan(tasks) {
  return {
    objective: "demo",
    tasks: tasks.map((task) => ({ title: task.id, acceptance: ["works"], files: [`src/${task.id}/**`], ...task })),
  };
}

function newRun(tasks, autonomyPatch = {}) {
  const run = engine.createRun({ id: "r1", plan: plan(tasks), runtime: "t3", now: T0 });
  const autonomy = { ...defaultAutonomy(), ...autonomyPatch };
  return { run, autonomy };
}

function dispatch(run, id, profile = "standard", now = T0) {
  return engine.startAttempt(run, id, { profile, executor: WORKER, runtime: "t3", briefPath: "b.md", briefHash: "h", now });
}

const okReport = { valid: true, errors: [], report: { outcome: "succeeded", summary: "done", filesChanged: [], checks: [], blockers: [], notes: "" } };
const passed = { passed: true, skipped: false, results: [{ name: "t", passed: true, required: true }] };
const failedChecks = { passed: false, skipped: false, results: [{ name: "unit", passed: false, required: true }] };

function approveAll(run, id, autonomy, workflow = defaultWorkflow()) {
  const order = ["qa", "system", "uiux", "security", "acceptance"];
  const gates = engine.currentAttempt(run.tasks[id]).gates;
  for (const gate of order.filter((name) => gates[name])) {
    engine.recordReview(run, id, { gate, verdict: "approved", reviewer: VALIDATOR }, autonomy, T0);
  }
}

function finish(run, id, autonomy, workflow = defaultWorkflow()) {
  dispatch(run, id);
  engine.recordReport(run, id, okReport, autonomy, T0);
  engine.recordChecks(run, id, passed, autonomy, T0, workflow);
  approveAll(run, id, autonomy, workflow);
}

test("createRun rejects an invalid plan with every error listed", () => {
  assert.throws(
    () => engine.createRun({ id: "r", plan: { tasks: [{ id: "a", title: "a", files: ["x"], acceptance: ["y"], dependsOn: ["b"] }] }, runtime: "t3", now: T0 }),
    /depends on unknown task "b"/
  );
  assert.throws(() => engine.createRun({ id: "r", plan: { tasks: [{ id: "a" }] }, runtime: "t3", now: T0 }), /needs a title[\s\S]*files[\s\S]*acceptance/);
});

test("only tasks whose dependencies are completed become ready", () => {
  const { run, autonomy } = newRun([{ id: "a" }, { id: "b", dependsOn: ["a"] }]);
  assert.equal(run.tasks.a.state, "ready");
  assert.equal(run.tasks.b.state, "pending");
  assert.deepEqual(engine.nextActions(run, autonomy, T0).dispatch, ["a"]);
  finish(run, "a", autonomy);
  assert.equal(run.tasks.b.state, "ready");
});

test("nextActions never exceeds maxWorkers", () => {
  const { run, autonomy } = newRun([{ id: "a" }, { id: "b" }, { id: "c" }], { maxWorkers: 2 });
  assert.deepEqual(engine.nextActions(run, autonomy, T0).dispatch, ["a", "b"]);
  dispatch(run, "a");
  assert.deepEqual(engine.nextActions(run, autonomy, T0).dispatch, ["b"]);
  dispatch(run, "b");
  assert.deepEqual(engine.nextActions(run, autonomy, T0).dispatch, []);
});

test("a task waits while another task in review still owns its files", () => {
  const { run, autonomy } = newRun([{ id: "a", files: ["src/shared/**"] }, { id: "b", files: ["src/shared/b.ts"] }]);
  dispatch(run, "a");
  engine.recordReport(run, "a", okReport, autonomy, T0);
  engine.recordChecks(run, "a", passed, autonomy, T0, defaultWorkflow());
  const next = engine.nextActions(run, autonomy, T0);
  assert.deepEqual(next.dispatch, []);
  assert.deepEqual(next.waitingForFiles, ["b"]);
});

test("invalid transitions are refused", () => {
  const { run } = newRun([{ id: "a" }]);
  assert.throws(() => engine.setTaskState(run, "a", "completed", "skip", T0), /Invalid task transition for a: ready -> completed/);
  assert.throws(() => engine.recordReport(run, "a", okReport, defaultAutonomy(), T0), /only accepted while running/);
});

test("the happy path runs report, checks and every applicable gate before completion", () => {
  const { run, autonomy } = newRun([{ id: "a", tags: ["ui"] }]);
  dispatch(run, "a");
  assert.equal(engine.recordReport(run, "a", okReport, autonomy, T0).next, "verify");
  assert.equal(engine.recordChecks(run, "a", passed, autonomy, T0, defaultWorkflow()).next, "review");
  const gates = Object.keys(engine.currentAttempt(run.tasks.a).gates);
  assert.deepEqual(gates.sort(), ["acceptance", "qa", "system", "uiux"]);
  approveAll(run, "a", autonomy);
  assert.equal(run.tasks.a.state, "completed");
  assert.equal(run.state, "running");
});

test("conditional gates follow tags and the acceptance gate waits for the others", () => {
  const { run, autonomy } = newRun([{ id: "a", tags: ["security"] }]);
  dispatch(run, "a");
  engine.recordReport(run, "a", okReport, autonomy, T0);
  engine.recordChecks(run, "a", passed, autonomy, T0, defaultWorkflow());
  const review = engine.nextActions(run, autonomy, T0).awaitingReview[0];
  assert.deepEqual(review.ready.sort(), ["qa", "security", "system"]);
  assert.deepEqual(review.waiting, ["acceptance"]);
  assert.throws(() => engine.recordReview(run, "a", { gate: "acceptance", verdict: "approved", reviewer: VALIDATOR }, autonomy, T0), /must wait for/);
});

test("a gate cannot be approved by the agent that implemented the task", () => {
  const { run, autonomy } = newRun([{ id: "a" }]);
  dispatch(run, "a");
  engine.recordReport(run, "a", okReport, autonomy, T0);
  engine.recordChecks(run, "a", passed, autonomy, T0, defaultWorkflow());
  assert.throws(() => engine.recordReview(run, "a", { gate: "qa", verdict: "approved", reviewer: WORKER }, autonomy, T0), /must be independent/);
});

test("a rejected gate sends the task back to the dev with the findings and an escalated profile", () => {
  const { run, autonomy } = newRun([{ id: "a" }]);
  dispatch(run, "a", "fast");
  engine.recordReport(run, "a", okReport, autonomy, T0);
  engine.recordChecks(run, "a", passed, autonomy, T0, defaultWorkflow());
  const result = engine.recordReview(run, "a", { gate: "qa", verdict: "rejected", reviewer: VALIDATOR, findings: ["crash on empty input"] }, autonomy, T0);
  assert.equal(result.next, "redispatch");
  assert.equal(result.decision.profile, "standard");
  assert.equal(run.tasks.a.state, "ready");
  assert.deepEqual(run.tasks.a.fix.findings, ["[qa] crash on empty input"]);
});

test("failed checks become a fix attempt until the budget runs out, then the run blocks", () => {
  const { run, autonomy } = newRun([{ id: "a" }], { maxAttemptsPerTask: 2, maxFixCycles: 5 });
  dispatch(run, "a", "standard");
  engine.recordReport(run, "a", okReport, autonomy, T0);
  const first = engine.recordChecks(run, "a", failedChecks, autonomy, T0, defaultWorkflow());
  assert.equal(first.next, "redispatch");
  assert.equal(first.decision.profile, "advanced");
  dispatch(run, "a", "advanced");
  engine.recordReport(run, "a", okReport, autonomy, T0);
  const second = engine.recordChecks(run, "a", failedChecks, autonomy, T0, defaultWorkflow());
  assert.equal(second.next, "coordinator-takeover");
  assert.equal(run.tasks.a.state, "failed");
  assert.equal(run.state, "blocked");
});

test("the fail policy stops the run when a budget is exhausted", () => {
  const { run, autonomy } = newRun([{ id: "a" }, { id: "b" }], { maxAttemptsPerTask: 1, escalation: { ...defaultAutonomy().escalation, onBudgetExhausted: "fail" } });
  dispatch(run, "a");
  const result = engine.recordReport(run, "a", { valid: true, errors: [], report: { ...okReport.report, outcome: "failed" } }, autonomy, T0);
  assert.equal(result.next, "fail");
  assert.equal(run.state, "failed");
});

test("retryDecision honours maxFixCycles and the same-profile strategy", () => {
  const autonomy = { ...defaultAutonomy(), maxFixCycles: 1, retry: { strategy: "same-profile", ladder: ["fast", "standard", "advanced"] } };
  const task = { attempts: [{ profile: "fast" }], budgetBase: 0, fixCycles: 0 };
  assert.deepEqual(engine.retryDecision(task, autonomy, "checks"), { action: "retry", profile: "fast", attempts: 1, fixCycles: 1 });
  task.fixCycles = 1;
  assert.equal(engine.retryDecision(task, autonomy, "review").action, "escalate");
  assert.equal(engine.retryDecision(task, autonomy, "worker").action, "retry");
});

test("a takeover that fails again escalates to the user", () => {
  const { run, autonomy } = newRun([{ id: "a" }], { maxAttemptsPerTask: 1 });
  dispatch(run, "a");
  engine.recordReport(run, "a", { valid: true, errors: [], report: { ...okReport.report, outcome: "failed" } }, autonomy, T0);
  assert.equal(run.tasks.a.state, "failed");
  engine.reopenForTakeover(run, "a", T0);
  engine.startAttempt(run, "a", { profile: "coordinator", executor: "coordinator", runtime: "t3", briefPath: "b", briefHash: "h", now: T0 });
  assert.equal(run.state, "running");
  const result = engine.recordReport(run, "a", { valid: true, errors: [], report: { ...okReport.report, outcome: "failed" } }, autonomy, T0);
  assert.equal(result.next, "ask-user");
});

test("a blocked report blocks the task until the coordinator unblocks it", () => {
  const { run, autonomy } = newRun([{ id: "a" }]);
  dispatch(run, "a");
  const result = engine.recordReport(run, "a", { valid: true, errors: [], report: { ...okReport.report, outcome: "blocked", blockers: ["which OAuth provider?"] } }, autonomy, T0);
  assert.equal(result.next, "resolve-blocker");
  assert.equal(run.state, "blocked");
  engine.unblock(run, "a", "use the existing provider", T0);
  assert.equal(run.tasks.a.state, "ready");
  assert.equal(run.state, "running");
  assert.equal(run.tasks.a.fix.kind, "blocker");
});

test("an invalid report is not trusted but still goes to independent checks", () => {
  const { run, autonomy } = newRun([{ id: "a" }]);
  dispatch(run, "a");
  const result = engine.recordReport(run, "a", { valid: false, errors: ["no block"], report: null }, autonomy, T0);
  assert.equal(result.next, "verify");
  assert.equal(run.tasks.a.state, "testing");
});

test("skipped task checks fail the attempt only when requireTaskChecks is on", () => {
  const strict = { ...defaultAutonomy(), completion: { ...defaultAutonomy().completion, requireTaskChecks: true } };
  const { run } = newRun([{ id: "a" }]);
  dispatch(run, "a");
  engine.recordReport(run, "a", okReport, strict, T0);
  assert.equal(engine.recordChecks(run, "a", { passed: true, skipped: true, results: [] }, strict, T0, defaultWorkflow()).next, "redispatch");
});

test("a failed dependency blocks its dependents", () => {
  const { run, autonomy } = newRun([{ id: "a" }, { id: "b", dependsOn: ["a"] }], { maxAttemptsPerTask: 1 });
  dispatch(run, "a");
  engine.recordReport(run, "a", { valid: true, errors: [], report: { ...okReport.report, outcome: "failed" } }, autonomy, T0);
  engine.nextActions(run, autonomy, T0);
  assert.equal(run.tasks.b.state, "blocked");
});

test("overdue and unconfirmed attempts are reported, never cancelled automatically", () => {
  const { run, autonomy } = newRun([{ id: "a" }, { id: "b" }], { taskTimeoutMinutes: 30 });
  dispatch(run, "a", "standard", T0);
  engine.bindRuntimeRef(run, "a", "task-1", T0);
  dispatch(run, "b", "standard", T0);
  const next = engine.nextActions(run, autonomy, at(31));
  assert.deepEqual(next.overdue.map((item) => item.id), ["a", "b"]);
  assert.deepEqual(next.unconfirmed.map((item) => item.id), ["b"]);
  assert.equal(run.tasks.a.state, "running");
  engine.touch(run, "a", "still working", at(31));
  assert.deepEqual(engine.nextActions(run, autonomy, at(40)).overdue.map((item) => item.id), ["b"]);
});

test("resumePlan separates reconcile, same-key redispatch and foreign attempts", () => {
  const { run, autonomy } = newRun([{ id: "a" }, { id: "b" }, { id: "c" }]);
  dispatch(run, "a");
  engine.bindRuntimeRef(run, "a", "t3-task", T0);
  dispatch(run, "b");
  engine.startAttempt(run, "c", { profile: "standard", executor: WORKER, runtime: "orca", briefPath: "b", briefHash: "h", now: T0 });
  const plan = engine.resumePlan(run, autonomy, T0, "t3");
  assert.deepEqual(plan.reconcile, [{ id: "a", runtimeRef: "t3-task" }]);
  assert.equal(plan.redispatchSameKey[0].clientRequestId, "agent-kit:r1:b:1");
  assert.deepEqual(plan.foreign.map((item) => item.id), ["c"]);
});

test("markLost counts as a failed attempt and keeps history", () => {
  const { run, autonomy } = newRun([{ id: "a" }]);
  dispatch(run, "a");
  assert.equal(engine.markLost(run, "a", "task_status says unknown task", autonomy, T0).next, "redispatch");
  assert.equal(run.tasks.a.attempts[0].outcome, "failed");
  assert.ok(run.history.some((entry) => /lost failed/.test(entry.reason)));
});

test("completion requires every task, final checks newer than the last change, and gates", () => {
  const config = { checks: [{ name: "test", command: "npm test" }] };
  const { run, autonomy } = newRun([{ id: "a" }]);
  assert.equal(engine.completionStatus(run, autonomy, config).complete, false);
  finish(run, "a", autonomy);
  assert.match(engine.completionStatus(run, autonomy, config).missing.join(), /final checks have not run/);
  engine.recordFinalChecks(run, { passed: false, results: [] }, at(5));
  assert.match(engine.completionStatus(run, autonomy, config).missing.join(), /final checks failed/);
  engine.recordFinalChecks(run, { passed: true, results: [] }, at(6));
  assert.equal(engine.completeRun(run, autonomy, config, at(7)).complete, true);
  assert.equal(run.state, "completed");
});

test("completion flags a project without configured checks", () => {
  const { run, autonomy } = newRun([{ id: "a" }]);
  finish(run, "a", autonomy);
  assert.match(engine.completionStatus(run, autonomy, { checks: [] }).missing.join(), /no project checks configured/);
});

test("final checks refuse to run while a worker is running", () => {
  const { run } = newRun([{ id: "a" }]);
  dispatch(run, "a");
  assert.throws(() => engine.recordFinalChecks(run, { passed: true, results: [] }, T0), /still running: a/);
});

test("replan keeps completed work, resets failed tasks, adds and cancels tasks", () => {
  const { run, autonomy } = newRun([{ id: "a" }, { id: "b" }, { id: "c" }], { maxAttemptsPerTask: 1 });
  finish(run, "a", autonomy);
  dispatch(run, "b");
  engine.recordReport(run, "b", { valid: true, errors: [], report: { ...okReport.report, outcome: "failed" } }, autonomy, T0);
  assert.equal(run.tasks.b.state, "failed");
  engine.replan(run, plan([{ id: "a" }, { id: "b", profile: "advanced" }, { id: "d", dependsOn: ["b"] }]), at(1));
  assert.equal(run.tasks.a.state, "completed");
  assert.equal(run.tasks.b.state, "ready");
  assert.equal(engine.attemptsInBudget(run.tasks.b), 0);
  assert.equal(run.tasks.b.profile, "advanced");
  assert.equal(run.tasks.c.state, "cancelled");
  assert.equal(run.tasks.d.state, "pending");
});

test("replan refuses to drop a task that is still running", () => {
  const { run } = newRun([{ id: "a" }, { id: "b" }]);
  dispatch(run, "a");
  assert.throws(() => engine.replan(run, plan([{ id: "b" }]), T0), /Cannot drop a while it is running/);
});

test("tasks imported as completed skip the gate requirement", () => {
  const run = engine.createRun({ id: "r", plan: plan([{ id: "a" }, { id: "b", dependsOn: ["a"] }]), runtime: "t3", now: T0, completed: ["a"] });
  assert.equal(run.tasks.a.state, "completed");
  assert.equal(run.tasks.b.state, "ready");
  assert.doesNotMatch(engine.completionStatus(run, defaultAutonomy(), { checks: [] }).missing.join(), /without review: a/);
});

test("every transition is recorded in the history and queued for the tracker", () => {
  const { run, autonomy } = newRun([{ id: "a" }]);
  finish(run, "a", autonomy);
  const states = run.history.filter((entry) => entry.scope === "task").map((entry) => entry.to);
  assert.deepEqual(states, ["ready", "running", "testing", "review", "completed"]);
  assert.ok(run.events.every((event) => event.synced === false));
});
