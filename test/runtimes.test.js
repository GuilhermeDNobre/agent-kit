import { test } from "node:test";
import assert from "node:assert/strict";
import { getAdapter, listAdapters, registerAdapter } from "../src/runtimes/index.js";
import { defaultConfig } from "../src/core/config.js";
import { detectRuntime } from "../src/runtimes/detect.js";

const run = { id: "r1", objective: "auth" };
const task = { id: "2.0", title: "Login form", role: "implementation", tracker: { identifier: "ENG-42" } };
const attempt = { number: 1, clientRequestId: "agent-kit:r1:2.0:1", briefPath: ".agent-kit/runs/r1/briefs/2.0.1.md", runtimeRef: "task-9" };
const profile = { name: "standard", provider: "antigravity", model: "model-x", options: { thought_level: "high" } };

test("both runtimes are registered and incomplete adapters are refused", () => {
  assert.deepEqual(listAdapters().map((adapter) => adapter.name).sort(), ["orca", "t3"]);
  assert.throws(() => registerAdapter({ name: "half" }), /missing: completionNote, validateProfile, dispatch/);
  assert.throws(() => getAdapter("nope"), /Unknown runtime "nope"/);
});

test("a custom adapter can be registered without touching the core", () => {
  const custom = {
    name: "custom",
    completionNote: "",
    validateProfile: () => [],
    dispatch: () => ({ runtime: "custom" }),
    status: () => ({}),
    cancel: () => ({}),
    interpretStatus: () => ({ finished: false }),
  };
  registerAdapter(custom);
  assert.equal(getAdapter("custom").dispatch().runtime, "custom");
});

test("T3 dispatch maps onto delegate_task with the brief inline, async mode and the retry key", () => {
  const config = defaultConfig();
  const call = getAdapter("t3").dispatch({ run, task, attempt, brief: "BRIEF TEXT", profile, config });
  assert.equal(call.tool, "delegate_task");
  assert.deepEqual(call.args, {
    task: "BRIEF TEXT",
    title: "2.0 Login form",
    role: "implementation",
    mode: "async",
    isolation: "shared",
    clientRequestId: "agent-kit:r1:2.0:1",
    target: { providerInstanceId: "antigravity", model: "model-x", options: { thought_level: "high" } },
  });
  assert.match(call.then, /agent-kit wf started r1 2.0 --ref/);
});

test("T3 maps validator roles, honours worktree isolation and omits empty options", () => {
  const config = defaultConfig();
  config.runtimes.t3.isolation = "worktree";
  const call = getAdapter("t3").dispatch({ run, task: { ...task, role: "security" }, attempt, brief: "b", profile: { ...profile, options: {} }, config });
  assert.equal(call.args.role, "review");
  assert.equal(call.args.isolation, "worktree");
  assert.equal(call.args.target.options, undefined);
});

test("a coordinator profile is never delegated", () => {
  const call = getAdapter("t3").dispatch({ run, task, attempt, brief: "b", profile: { name: "coordinator", provider: "coordinator" }, config: defaultConfig() });
  assert.equal(call.kind, "coordinator");
  assert.match(call.instruction, /do task 2.0 yourself/);
});

test("T3 status and cancel use the bound task id; status results are interpreted", () => {
  const t3 = getAdapter("t3");
  assert.deepEqual(t3.status({ attempt }).args, { taskId: "task-9" });
  assert.deepEqual(t3.cancel({ attempt, reason: "stuck" }).args, { taskId: "task-9", reason: "stuck" });
  assert.deepEqual(t3.interpretStatus({ workState: "result_available", summary: "S" }), { finished: true, summary: "S" });
  assert.deepEqual(t3.interpretStatus({ workState: "waiting_for_children" }), { finished: false });
  assert.equal(t3.interpretStatus({}).unknown, true);
});

test("T3 refuses a worker profile without a model", () => {
  assert.match(getAdapter("t3").validateProfile({ name: "fast", provider: "antigravity", model: null })[0], /has no model/);
  assert.deepEqual(getAdapter("t3").validateProfile({ name: "c", provider: "coordinator" }), []);
});

test("Orca dispatch is one supervised worker-start with the brief file, agent, model and effort", () => {
  const config = defaultConfig({ runtime: "orca" });
  const call = getAdapter("orca").dispatch({ run, task, attempt, brief: "b", profile: { ...profile, options: { effort: "high" } }, config });
  assert.equal(call.kind, "shell");
  const start = call.commands.find((command) => command.includes("worker-start"));
  assert.match(start, /^orca orchestration worker-start --environment local --spec-file \.agent-kit\/runs\/r1\/briefs\/2\.0\.1\.md /);
  assert.match(start, /--task-title "2\.0 Login form" --agent antigravity --model "model-x" --effort high --worktree current --json$/);
  const text = call.commands.join("\n");
  assert.doesNotMatch(text, /--inject|terminal (create|send)|\bdispatch --task/);
  assert.match(call.then, /wf started r1 2\.0 --ref <dispatch_id/);
  assert.ok(call.notes.some((note) => /Never poll/.test(note)));
});

test("Orca honours new-child worktrees and keep-open, but gates always share the current worktree", () => {
  const config = defaultConfig({ runtime: "orca" });
  config.runtimes.orca = { worktree: "new-child", keepOpen: true };
  const orca = getAdapter("orca");
  const start = orca.dispatch({ run, task, attempt, brief: "b", profile, config }).commands[1];
  assert.match(start, /--worktree new-child --name r1-2-0 --keep-open --json$/);
  const gate = orca.dispatch({ run, task, attempt, brief: "b", profile, config, gate: "qa" }).commands[1];
  assert.match(gate, /--worktree current --keep-open --json$/);
  assert.doesNotMatch(start, /--effort/, "effort is only passed with a model option");
});

test("Orca status, cancel and messages use the dispatch id; pre-0.4 terminal refs still work", () => {
  const orca = getAdapter("orca");
  const ref = { runtimeRef: "dsp_1" };
  assert.deepEqual(orca.status({ attempt: ref }).commands, ["orca orchestration worker-show --dispatch dsp_1 --json", "orca orchestration worker-read --dispatch dsp_1 --limit 50 --json"]);
  assert.deepEqual(orca.cancel({ attempt: ref }).commands, ["orca orchestration worker-stop --dispatch dsp_1 --json"]);
  assert.match(orca.cancel({ attempt: { runtimeRef: "term-1|task-1" } }).commands[0], /terminal close --terminal term-1 /);
  assert.deepEqual(orca.interpretStatus({ type: "worker_done", body: "x", payload: { outcome: "failed" } }), { finished: true, summary: "x", failed: true });
  assert.equal(orca.interpretStatus({ type: "escalation", payload: { stopReason: "exited" } }).stopReason, "exited");
  assert.equal(orca.interpretStatus({ type: "question", id: "m1" }).messageId, "m1");
  assert.deepEqual(orca.interpretStatus({ type: "heartbeat" }), { finished: false });
});

test("Orca refuses a worker profile without agent or model, unless the agent picks its own model", () => {
  const orca = getAdapter("orca");
  assert.match(orca.validateProfile({ name: "fast", provider: "antigravity", model: null })[0], /has no model/);
  assert.match(orca.validateProfile({ name: "fast", provider: null, model: "m" })[0], /no Orca agent id/);
  assert.deepEqual(orca.validateProfile({ name: "fast", provider: "zcode", model: null, options: { agentDefaultModel: true } }), []);
  assert.deepEqual(orca.validateProfile({ name: "c", provider: "coordinator" }), []);
  assert.equal(orca.dispatch({ run, task, attempt, brief: "b", profile: { name: "c", provider: "coordinator" }, config: defaultConfig({ runtime: "orca" }) }).kind, "coordinator");
});

test("runtime detection: T3 tools or T3 env win, an Orca terminal is Orca, anything else defaults to Orca", () => {
  assert.equal(detectRuntime({ TERM_PROGRAM: "Orca" }, { t3Tools: true }).runtime, "t3");
  assert.equal(detectRuntime({ T3CODE_THREAD_ID: "x", ORCA_TERMINAL_HANDLE: "t" }).runtime, "t3");
  assert.match(detectRuntime({ ORCA_TERMINAL_HANDLE: "term_1" }).evidence, /ORCA_TERMINAL_HANDLE/);
  assert.equal(detectRuntime({ TERM_PROGRAM: "Orca" }).runtime, "orca");
  assert.match(detectRuntime({ TERM_PROGRAM: "vscode" }).evidence, /default outside T3/);
});
