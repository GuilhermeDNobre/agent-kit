import { test } from "node:test";
import assert from "node:assert/strict";
import { createOrcaRunner, linearOrcaTracker, pickIssue } from "../src/trackers/linear-orca.js";
import { createTracker } from "../src/trackers/index.js";
import * as engine from "../src/core/engine.js";
import { defaultConfig } from "../src/core/config.js";

const T0 = "2026-11-25T10:00:00.000Z";

function settings(overrides = {}) {
  const base = defaultConfig({ runtime: "orca" }).tracker.linear;
  return { ...base, teamKey: "ENG", project: { ...base.project, name: "shop" }, ...overrides };
}

function fakeOrca({ projects = [{ id: "proj-1", name: "shop" }] } = {}) {
  const calls = [];
  let counter = 0;
  const orca = (args, input) => {
    calls.push({ args, input });
    const verb = args.slice(1, 3).join(" ");
    if (verb === "project list") return { projects };
    if (verb.startsWith("create")) {
      counter += 1;
      return { issue: { id: `uuid-${counter}`, identifier: `ENG-${counter}`, url: `https://linear.app/x/ENG-${counter}` } };
    }
    return { ok: true };
  };
  return { calls, orca };
}

function makeRun() {
  return engine.createRun({
    id: "r1",
    runtime: "orca",
    now: T0,
    plan: {
      objective: "Auth",
      tasks: [
        { id: "1.0", title: "Users", files: ["src/users/**"], acceptance: ["a"] },
        { id: "2.0", title: "Login", dependsOn: ["1.0"], files: ["src/login/**"], acceptance: ["b"] },
      ],
    },
  });
}

test("publishing through Orca puts the parent and real sub-issues in the repository's project", async () => {
  const { calls, orca } = fakeOrca();
  const tracker = linearOrcaTracker({ settings: settings(), orca });
  const run = makeRun();
  const result = await tracker.publishPlan(run);
  assert.deepEqual(result.created, ["1.0", "2.0"]);
  const creates = calls.filter((call) => call.args[1] === "create");
  assert.equal(creates.length, 3);
  for (const create of creates) {
    assert.deepEqual(create.args.slice(0, 10), ["linear", "create", "--title", create.args[3], "--team", "ENG", "--project", "proj-1", "--body-file", "-"]);
    assert.ok(create.args.includes("--label") && create.args.includes("agent-kit"));
  }
  assert.equal(creates[0].args[3], "[r1] Auth");
  assert.deepEqual(creates[2].args.slice(-2), ["--parent", "ENG-1"]);
  assert.match(creates[2].input, /```agent-kit-task/);
  const relation = calls.find((call) => call.args[1] === "relation").args;
  assert.deepEqual(relation, ["linear", "relation", "add", "ENG-2", "--related", "ENG-3", "--type", "blocks"]);
  assert.equal(run.tracker.project.id, "proj-1");
  assert.equal((await tracker.publishPlan(run)).created.length, 0);
});

test("a missing project is created through the API when a key exists, otherwise reported", async () => {
  const run = makeRun();
  const { orca } = fakeOrca({ projects: [{ id: "x", name: "shopping" }] });
  await assert.rejects(linearOrcaTracker({ settings: settings(), orca }).publishPlan(run), /Linear project "shop" does not exist\. Create it in Linear \(team ENG\) or export LINEAR_API_KEY/);
  let asked = 0;
  const viaApi = async () => {
    asked += 1;
    return { id: "proj-api", name: "shop", created: true };
  };
  const { calls, orca: orca2 } = fakeOrca({ projects: [] });
  await linearOrcaTracker({ settings: settings(), orca: orca2, ensureProjectViaApi: viaApi }).publishPlan(makeRun());
  assert.equal(asked, 1);
  assert.ok(calls.filter((call) => call.args[1] === "create").every((call) => call.args.includes("proj-api")));
});

test("sync sets the mapped status and comments each transition through Orca", async () => {
  const { calls, orca } = fakeOrca();
  const tracker = linearOrcaTracker({ settings: settings(), orca });
  const run = makeRun();
  await tracker.publishPlan(run);
  for (const event of run.events) event.synced = true;
  engine.startAttempt(run, "1.0", { profile: "standard", executor: "w", runtime: "orca", briefPath: "b", briefHash: "h", now: T0 });
  calls.length = 0;
  const result = await tracker.sync(run);
  assert.ok(result.synced >= 1);
  assert.deepEqual(calls[0].args, ["linear", "status", "set", "ENG-2", "--to", "In Progress"]);
  assert.deepEqual(calls[1].args, ["linear", "comment", "add", "ENG-2", "--body-file", "-"]);
  assert.match(calls[1].input, /agent-kit ·/);
  assert.ok(run.events.every((event) => event.synced));
});

test("the runner calls the Orca binary without a shell, sends --json and surfaces failures", () => {
  const seen = [];
  const ok = createOrcaRunner({ command: "orca", spawn: (cmd, args, options) => (seen.push({ cmd, args, options }), { status: 0, stdout: JSON.stringify({ ok: true, result: { teams: [] } }) }) });
  assert.deepEqual(ok(["linear", "team", "list"], "body"), { teams: [] });
  assert.deepEqual(seen[0].args, ["linear", "team", "list", "--json"]);
  assert.equal(seen[0].options.input, "body");
  assert.equal(seen[0].options.shell, undefined);
  const failing = createOrcaRunner({ spawn: () => ({ status: 1, stdout: JSON.stringify({ ok: false, error: { message: "not connected" } }) }) });
  assert.throws(() => failing(["linear", "create"]), /orca linear create failed: not connected/);
  const missing = createOrcaRunner({ command: "nope", spawn: () => ({ error: new Error("ENOENT") }) });
  assert.throws(() => missing(["linear"]), /Cannot run "nope": ENOENT/);
  assert.throws(() => pickIssue({}), /identifier/);
});

test("createTracker routes via orca to the Orca tracker", () => {
  const config = defaultConfig({ runtime: "orca" });
  config.tracker.kind = "linear";
  config.tracker.linear = settings({ via: "orca" });
  const tracker = createTracker(config, { env: {}, orcaRunner: () => ({}) });
  assert.equal(tracker.via, "orca");
});
