import { test } from "node:test";
import assert from "node:assert/strict";
import { getAdapter, listAdapters, registerAdapter } from "../src/runtimes/index.js";
import { defaultConfig } from "../src/core/config.js";

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

test("Orca dispatch produces the legacy recipe with the brief file, the model and the Linear issue", () => {
  const config = defaultConfig({ runtime: "orca" });
  config.runtimes.orca = { launchCommand: "tool --model {model}", readiness: "prompt >" };
  const call = getAdapter("orca").dispatch({ run, task, attempt, brief: "b", profile, config });
  assert.equal(call.kind, "shell");
  const text = call.commands.join("\n");
  assert.match(text, /--command "tool --model model-x"/);
  assert.match(text, /--linear-issue ENG-42/);
  assert.match(text, /task-create --spec "\$\(cat \.agent-kit\/runs\/r1\/briefs\/2\.0\.1\.md\)"/);
  assert.doesNotMatch(text, /--inject/);
  assert.match(getAdapter("orca").cancel({ attempt: { runtimeRef: "term-1|task-1" } }).commands[0], /--terminal term-1 /);
  assert.equal(getAdapter("orca").interpretStatus({ type: "worker_done", body: "x" }).finished, true);
});

test("Orca needs a configured launch command", () => {
  assert.match(getAdapter("orca").validateProfile(profile, defaultConfig({ runtime: "orca" }))[0], /launchCommand is not set/);
});
