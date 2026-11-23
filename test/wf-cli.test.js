import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWorkflowCommand } from "../src/cli/wf.js";
import { runPolicy, runValidate } from "../src/cli/tools.js";
import { buildConfig } from "../src/generate.js";
import { defaultAutonomy, defaultWorkflow } from "../src/core/config.js";

const WORKER_MODEL = "model-standard";

async function project({ checks = [{ name: "ok", command: "node -e \"process.exit(0)\"", required: true }], tracker = "local", via = null } = {}) {
  const root = await mkdtemp(join(tmpdir(), "agent-kit-wf-"));
  const config = buildConfig({ detected: { stack: "Node.js", manifest: "package.json", commands: {} }, answers: { name: "demo", description: "d" }, choices: { runtime: "t3", tracker, linearTeam: tracker === "linear" ? "ENG" : null } });
  config.checks = checks;
  if (via) config.tracker.linear.via = via;
  for (const name of ["fast", "standard", "advanced"]) config.profiles[name].model = WORKER_MODEL;
  config.profiles.validator = { provider: "claudeAgent", model: "model-validator", options: {} };
  await mkdir(join(root, ".agent-kit"), { recursive: true });
  await writeFile(join(root, ".agent-kit", "config.json"), JSON.stringify(config));
  await writeFile(join(root, ".agent-kit", "autonomy.json"), JSON.stringify(defaultAutonomy()));
  await writeFile(join(root, ".agent-kit", "workflow.json"), JSON.stringify(defaultWorkflow()));
  await mkdir(join(root, "tasks", "prd-x", "itemized-tasks"), { recursive: true });
  await writeFile(join(root, "tasks", "prd-x", "itemized-tasks", "1_task.md"), "# Tarefa 1.0\nDetalhe X");
  await writeFile(
    join(root, "tasks", "prd-x", "plan.json"),
    JSON.stringify({
      feature: "x",
      tasks: [
        { id: "1.0", title: "Core", files: ["src/core/**"], acceptance: ["works"], doc: "tasks/prd-x/itemized-tasks/1_task.md", validation: ["node -e \"process.exit(0)\""] },
        { id: "2.0", title: "Fail", files: ["src/fail/**"], acceptance: ["works"], validation: ["node -e \"process.exit(1)\""] },
      ],
    })
  );
  return root;
}

async function wf(root, ...args) {
  const output = [];
  const code = await runWorkflowCommand(args, { root, out: (text) => output.push(text), env: {} });
  return { code, json: JSON.parse(output.join("\n")) };
}

async function report(root, run, task, outcome = "succeeded") {
  const file = join(root, `${task}.md`);
  await writeFile(file, "Done.\n\n```agent-kit-report\n" + JSON.stringify({ outcome, summary: "did it", filesChanged: [`src/${task}/x.js`] }) + "\n```\n");
  return wf(root, "report", run, task, "--file", file);
}

test("a run goes from plan to completion through the CLI, with briefs, checks and gates on disk", async () => {
  const root = await project();
  const created = await wf(root, "new", "r1", "--plan", "tasks/prd-x/plan.json", "--objective", "demo");
  assert.deepEqual(created.json.next.dispatch, ["1.0", "2.0"]);

  const dispatched = await wf(root, "dispatch", "r1", "1.0");
  assert.equal(dispatched.json.call.tool, "delegate_task");
  assert.equal(dispatched.json.call.args.target.model, WORKER_MODEL);
  assert.match(dispatched.json.call.args.task, /Detalhe X/);
  assert.ok(existsSync(join(root, dispatched.json.briefPath)));

  await wf(root, "started", "r1", "1.0", "--ref", "t3-task-1");
  assert.equal((await report(root, "r1", "1.0")).json.next, "verify");
  const verified = await wf(root, "verify", "r1", "1.0");
  assert.equal(verified.code, 0);
  assert.equal(verified.json.state, "review");

  const gate = await wf(root, "gate", "r1", "1.0", "qa");
  assert.equal(gate.json.call.args.role, "test");
  assert.equal(gate.json.reviewer, "claudeAgent:model-validator");
  assert.match(gate.json.call.args.task, /Não altere nenhum arquivo/);
  await wf(root, "started", "r1", "1.0", "--gate", "qa", "--ref", "t3-gate-1");
  const reviewFile = join(root, "qa.md");
  await writeFile(reviewFile, "```agent-kit-review\n" + JSON.stringify({ verdict: "approved", findings: [] }) + "\n```");
  await wf(root, "review", "r1", "1.0", "--gate", "qa", "--reviewer", gate.json.reviewer, "--file", reviewFile);
  await wf(root, "review", "r1", "1.0", "--gate", "system", "--reviewer", gate.json.reviewer, "--verdict", "approved");
  const accepted = await wf(root, "review", "r1", "1.0", "--gate", "acceptance", "--reviewer", gate.json.reviewer, "--verdict", "approved");
  assert.equal(accepted.json.state, "completed");

  await wf(root, "cancel", "r1", "2.0", "--reason", "out of scope");
  const notYet = await wf(root, "complete", "r1");
  assert.equal(notYet.code, 3);
  assert.match(notYet.json.missing.join(), /final checks have not run/);
  const final = await wf(root, "verify", "r1", "--final");
  assert.equal(final.json.passed, true);
  const done = await wf(root, "complete", "r1");
  assert.equal(done.code, 0);
  assert.equal(done.json.state, "completed");

  const run = JSON.parse(await readFile(join(root, ".agent-kit", "runs", "r1", "run.json"), "utf8"));
  assert.ok(run.history.length > 10);
  assert.ok(existsSync(join(root, ".agent-kit", "runs", "r1", "checks", "final.json")));
  assert.ok(existsSync(join(root, ".agent-kit", "runs", "r1", "reviews", "1.0.1.qa.md")));
});

test("failing checks are observed independently and trigger a fix attempt with an escalated profile", async () => {
  const root = await project();
  await wf(root, "new", "r1", "--plan", "tasks/prd-x/plan.json");
  await wf(root, "dispatch", "r1", "2.0");
  await report(root, "r1", "2.0");
  const verified = await wf(root, "verify", "r1", "2.0");
  assert.equal(verified.code, 3);
  assert.equal(verified.json.next, "redispatch");
  assert.equal(verified.json.results[0].exitCode, 1);
  const again = await wf(root, "dispatch", "r1", "2.0");
  assert.equal(again.json.attempt, 2);
  assert.equal(again.json.profile, "advanced");
  assert.match(again.json.call.args.task, /## CORREÇÃO/);
});

test("an unconfirmed dispatch is re-issued with the same retry key instead of a new attempt", async () => {
  const root = await project();
  await wf(root, "new", "r1", "--plan", "tasks/prd-x/plan.json");
  const first = await wf(root, "dispatch", "r1", "1.0");
  const second = await wf(root, "dispatch", "r1", "1.0");
  assert.equal(second.json.redispatch, true);
  assert.equal(second.json.call.args.clientRequestId, first.json.call.args.clientRequestId);
  const resume = await wf(root, "resume", "r1");
  assert.equal(resume.json.redispatchSameKey[0].id, "1.0");
  await wf(root, "started", "r1", "1.0", "--ref", "t3-1");
  const reconciled = await wf(root, "resume", "r1");
  assert.deepEqual(reconciled.json.reconcile[0].call.args, { taskId: "t3-1" });
});

test("dispatch refuses an unconfigured profile and wf new refuses a duplicate run", async () => {
  const root = await project();
  const configPath = join(root, ".agent-kit", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.profiles.standard.model = null;
  await writeFile(configPath, JSON.stringify(config));
  await wf(root, "new", "r1", "--plan", "tasks/prd-x/plan.json");
  await assert.rejects(wf(root, "dispatch", "r1", "1.0"), /has no model/);
  await assert.rejects(wf(root, "new", "r1", "--plan", "tasks/prd-x/plan.json"), /already exists/);
});

test("takeover lets the coordinator implement a failed task, still subject to the gates", async () => {
  const root = await project();
  const autonomyPath = join(root, ".agent-kit", "autonomy.json");
  await writeFile(autonomyPath, JSON.stringify({ ...defaultAutonomy(), maxAttemptsPerTask: 1 }));
  await wf(root, "new", "r1", "--plan", "tasks/prd-x/plan.json");
  await wf(root, "dispatch", "r1", "1.0");
  const failed = await report(root, "r1", "1.0", "failed");
  assert.equal(failed.json.next, "coordinator-takeover");
  const takeover = await wf(root, "takeover", "r1", "1.0");
  assert.equal(takeover.json.call.kind, "coordinator");
  const status = await wf(root, "status", "r1");
  assert.equal(status.json.tasks[0].profile, "coordinator");
});

test("Linear through T3 prints the issue tool calls, binds keys and acknowledges events", async () => {
  const root = await project({ tracker: "linear", via: "t3" });
  const created = await wf(root, "new", "r1", "--plan", "tasks/prd-x/plan.json", "--objective", "demo");
  assert.deepEqual(created.json.published.operations.map((op) => op.bind), ["_parent"]);
  await wf(root, "tracker-bind", "r1", "_parent", "--key", "ANY-10");
  const children = (await wf(root, "sync", "r1")).json;
  assert.match(children.note, /Create and bind the issues first/);
  assert.deepEqual(children.operations.map((op) => op.bind), ["1.0", "2.0"]);
  assert.ok(children.operations.every((op) => op.tool === "create_issue"));
  assert.match(children.operations[0].args.title, /^\[r1\] 1\.0 Core/);
  assert.match(children.operations[0].args.body, /^Parte de ANY-10\.\n\nTarefa/);
  assert.match(children.operations[0].args.body, /```agent-kit-task/);
  await wf(root, "tracker-bind", "r1", "1.0", "--key", "ANY-11");
  await wf(root, "tracker-bind", "r1", "2.0", "--key", "ANY-12");

  const dispatched = await wf(root, "dispatch", "r1", "1.0");
  assert.equal(dispatched.json.tracker.via, "t3");
  assert.ok(dispatched.json.tracker.unsyncedEvents > 0);
  const sync = await wf(root, "sync", "r1");
  assert.deepEqual(sync.json.operations[0], { tool: "set_issue_state", args: { key: "ANY-11", state: "In Progress" } });
  assert.equal(sync.json.operations[1].tool, "comment_on_issue");
  assert.match(sync.json.operations[1].args.body, /ready → running/);
  const acked = await wf(root, "sync", "r1", "--ack", sync.json.ack.join(","));
  assert.equal(acked.json.unsyncedEvents, 0);
  assert.deepEqual((await wf(root, "sync", "r1")).json.operations, []);

  await wf(root, "cancel", "r1", "1.0", "--reason", "stop");
  await wf(root, "cancel", "r1", "2.0", "--reason", "stop");
  await wf(root, "verify", "r1", "--final");
  await wf(root, "complete", "r1");
  const closing = (await wf(root, "sync", "r1")).json.operations;
  assert.ok(closing.some((op) => op.tool === "set_issue_state" && op.args.key === "ANY-10" && op.args.state === "Done"));
  assert.ok(closing.some((op) => op.tool === "set_issue_state" && op.args.key === "ANY-11" && op.args.state === "Canceled"));
});

test("a Linear outage never loses state: events stay queued", async () => {
  const root = await project({ tracker: "linear", via: "api" });
  const created = await wf(root, "new", "r1", "--plan", "tasks/prd-x/plan.json");
  assert.match(created.json.published.error, /API key is missing/);
  assert.match(created.json.tracker.error, /API key is missing/);
  const status = await wf(root, "status", "r1");
  assert.ok(status.json.unsyncedEvents > 0);
});

test("validate and policy report through exit codes", async () => {
  const root = await project();
  const out = [];
  assert.equal(await runValidate(["--plan", "tasks/prd-x/plan.json"], { root, out: (text) => out.push(text) }), 0);
  assert.deepEqual(JSON.parse(out[0]).waves, [["1.0", "2.0"]]);
  await writeFile(join(root, "bad.json"), JSON.stringify({ tasks: [{ id: "a", title: "a", files: ["x"], acceptance: ["y"], dependsOn: ["a"] }] }));
  assert.equal(await runValidate(["--plan", "bad.json"], { root, out: () => {} }), 1);
  assert.equal(await runPolicy(["check", "--", "npm", "test"], { root, out: () => {} }), 0);
  assert.equal(await runPolicy(["check", "--", "npm", "publish"], { root, out: () => {} }), 3);
  assert.equal(await runPolicy(["check", "--path", ".env"], { root, out: () => {} }), 3);
});
