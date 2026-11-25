import { test } from "node:test";
import assert from "node:assert/strict";
import { LINEAR_ENDPOINT, createLinearClient, linearTracker, parseTaskBlock, taskDescription } from "../src/trackers/linear.js";
import { createTracker } from "../src/trackers/index.js";
import * as engine from "../src/core/engine.js";
import { defaultConfig } from "../src/core/config.js";

const T0 = "2026-11-23T10:00:00.000Z";
const STATES = [
  { id: "s-backlog", name: "Backlog", type: "backlog" },
  { id: "s-todo", name: "Todo", type: "unstarted" },
  { id: "s-progress", name: "In Progress", type: "started" },
  { id: "s-review", name: "In Review", type: "started" },
  { id: "s-done", name: "Done", type: "completed" },
  { id: "s-canceled", name: "Canceled", type: "canceled" },
];

function fakeLinear({ parent, projects = [] } = {}) {
  const calls = [];
  let counter = 0;
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    const op = /(?:query|mutation)\s+(\w+)/.exec(body.query)[1];
    calls.push({ url, headers: init.headers, op, variables: body.variables });
    const data = {
      Team: { teams: { nodes: [{ id: "team-1", key: "ENG", name: "Engineering" }] } },
      States: { workflowStates: { nodes: STATES } },
      Labels: { issueLabels: { nodes: [{ id: "label-ak", name: "agent-kit" }, { id: "label-x", name: "other" }] } },
      Create: () => {
        counter += 1;
        return { issueCreate: { success: true, issue: { id: `uuid-${counter}`, identifier: `ENG-${counter}`, url: `https://linear.app/x/ENG-${counter}` } } };
      },
      Update: { issueUpdate: { success: true } },
      Relate: { issueRelationCreate: { success: true } },
      Comment: { commentCreate: { success: true } },
      Parent: { issue: parent },
      Project: { projects: { nodes: projects } },
      CreateProject: { projectCreate: { success: true, project: { id: "proj-new", name: "demo", url: "https://linear.app/x/project/demo" } } },
    }[op];
    return { ok: true, status: 200, json: async () => ({ data: typeof data === "function" ? data() : data }) };
  };
  return { calls, fetchImpl };
}

function settings(overrides = {}) {
  const base = defaultConfig().tracker.linear;
  return { ...base, via: "api", teamKey: "ENG", project: { ...base.project, name: "demo" }, ...overrides };
}

function makeRun() {
  return engine.createRun({
    id: "r1",
    runtime: "t3",
    now: T0,
    plan: {
      objective: "Auth",
      tasks: [
        { id: "1.0", title: "Users", files: ["src/users/**"], acceptance: ["a"] },
        { id: "2.0", title: "Login", dependsOn: ["1.0"], files: ["src/login/**"], acceptance: ["b"], tags: ["ui"] },
      ],
    },
  });
}

test("the client posts to the official endpoint with the raw API key (no Bearer)", async () => {
  const { calls, fetchImpl } = fakeLinear();
  const gql = createLinearClient({ apiKey: "lin_api_123", fetchImpl });
  await gql("query Team($key: String!) { teams { nodes { id } } }", { key: "ENG" });
  assert.equal(calls[0].url, LINEAR_ENDPOINT);
  assert.equal(calls[0].headers.Authorization, "lin_api_123");
  assert.throws(() => createLinearClient({ apiKey: "" }), /API key is missing/);
});

test("GraphQL errors surface as exceptions", async () => {
  const gql = createLinearClient({ apiKey: "k", fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ errors: [{ message: "Entity not found" }] }) }) });
  await assert.rejects(gql("query X { a }"), /Linear API error: Entity not found/);
});

test("publishing a plan creates a parent, one sub-issue per task and blocks relations", async () => {
  const { calls, fetchImpl } = fakeLinear();
  const tracker = linearTracker({ settings: settings(), gql: createLinearClient({ apiKey: "k", fetchImpl }) });
  const run = makeRun();
  const result = await tracker.publishPlan(run);
  assert.deepEqual(result.created, ["1.0", "2.0"]);
  const creates = calls.filter((call) => call.op === "Create").map((call) => call.variables.input);
  assert.equal(creates[0].title, "Auth");
  assert.equal(creates[1].parentId, "uuid-1");
  assert.equal(creates[1].stateId, "s-todo");
  assert.deepEqual(creates[1].labelIds, ["label-ak"]);
  assert.match(creates[2].description, /```agent-kit-task/);
  const relation = calls.find((call) => call.op === "Relate").variables.input;
  assert.deepEqual(relation, { issueId: "uuid-2", relatedIssueId: "uuid-3", type: "blocks" });
  assert.equal(run.tasks["2.0"].tracker.identifier, "ENG-3");
  assert.ok(creates.every((input) => input.projectId === "proj-new"), "every issue lands in the repository's project");
  assert.deepEqual(calls.find((call) => call.op === "CreateProject").variables.input.teamIds, ["team-1"]);
  assert.equal(run.tracker.project.id, "proj-new");

  const again = await tracker.publishPlan(run);
  assert.deepEqual(again.created, []);
});

test("an existing project of the same team is reused, another team's namesake is not", async () => {
  const projects = [
    { id: "proj-other", name: "demo", url: "u", teams: { nodes: [{ key: "OPS" }] } },
    { id: "proj-eng", name: "demo", url: "u", teams: { nodes: [{ key: "ENG" }] } },
  ];
  const { calls, fetchImpl } = fakeLinear({ projects });
  const tracker = linearTracker({ settings: settings(), gql: createLinearClient({ apiKey: "k", fetchImpl }) });
  await tracker.publishPlan(makeRun());
  assert.ok(!calls.some((call) => call.op === "CreateProject"));
  assert.ok(calls.filter((call) => call.op === "Create").every((call) => call.variables.input.projectId === "proj-eng"));
});

test("a configured project id is used without a lookup, and a missing project name is refused", async () => {
  const { calls, fetchImpl } = fakeLinear();
  const gql = createLinearClient({ apiKey: "k", fetchImpl });
  await linearTracker({ settings: settings({ project: { name: "demo", id: "proj-fixed" } }), gql }).publishPlan(makeRun());
  assert.ok(!calls.some((call) => call.op === "Project"));
  assert.ok(calls.filter((call) => call.op === "Create").every((call) => call.variables.input.projectId === "proj-fixed"));
  await assert.rejects(linearTracker({ settings: settings({ project: { name: null, id: null } }), gql }).publishPlan(makeRun()), /project.name is not set/);
});

test("sync moves issues through mapped states and comments every transition", async () => {
  const { calls, fetchImpl } = fakeLinear();
  const tracker = linearTracker({ settings: settings({ stateMap: { ...settings().stateMap, review: "In Review" } }), gql: createLinearClient({ apiKey: "k", fetchImpl }) });
  const run = makeRun();
  await tracker.publishPlan(run);
  for (const event of run.events) event.synced = true;
  engine.startAttempt(run, "1.0", { profile: "standard", executor: "w", runtime: "t3", briefPath: "b", briefHash: "h", now: T0 });
  engine.setTaskState(run, "1.0", "testing", "reported", T0);
  engine.setTaskState(run, "1.0", "review", "checks passed", T0);
  calls.length = 0;
  const result = await tracker.sync(run);
  assert.equal(result.synced, 3);
  const updates = calls.filter((call) => call.op === "Update").map((call) => call.variables.input.stateId);
  assert.deepEqual(updates, ["s-progress", "s-progress", "s-review"]);
  const comments = calls.filter((call) => call.op === "Comment").map((call) => call.variables.input.body);
  assert.match(comments[2], /testing → review — checks passed/);
  assert.ok(run.events.every((event) => event.synced));
});

test("a failed sync keeps the remaining events queued", async () => {
  const { fetchImpl } = fakeLinear();
  let fail = false;
  const flaky = async (url, init) => (fail && JSON.parse(init.body).query.includes("commentCreate") ? { ok: false, status: 503, json: async () => ({}) } : fetchImpl(url, init));
  const tracker = linearTracker({ settings: settings(), gql: createLinearClient({ apiKey: "k", fetchImpl: flaky }) });
  const run = makeRun();
  await tracker.publishPlan(run);
  for (const event of run.events) event.synced = true;
  engine.startAttempt(run, "1.0", { profile: "standard", executor: "w", runtime: "t3", briefPath: "b", briefHash: "h", now: T0 });
  fail = true;
  await assert.rejects(tracker.sync(run), /HTTP 503/);
  assert.equal(run.events.filter((event) => !event.synced).length, 1);
});

test("importing a parent issue rebuilds the plan, dependencies and completed tasks", async () => {
  const run = makeRun();
  const child = (identifier, taskId, state, blockers = []) => ({
    id: `uuid-${identifier}`,
    identifier,
    title: `${taskId} ${run.tasks[taskId].title}`,
    url: `https://linear.app/x/${identifier}`,
    description: taskDescription(run, { ...run.tasks[taskId], dependsOn: [] }),
    state: { name: state, type: state === "Done" ? "completed" : "unstarted" },
    inverseRelations: { nodes: blockers.map((source) => ({ type: "blocks", issue: { identifier: source } })) },
  });
  const parent = {
    id: "uuid-P",
    identifier: "ENG-1",
    title: "Auth",
    url: "https://linear.app/x/ENG-1",
    children: { nodes: [child("ENG-2", "1.0", "Done"), child("ENG-3", "2.0", "Todo", ["ENG-2"]), { identifier: "ENG-9", title: "manual", description: "no block", inverseRelations: { nodes: [] } }] },
  };
  const { fetchImpl } = fakeLinear({ parent });
  const tracker = linearTracker({ settings: settings(), gql: createLinearClient({ apiKey: "k", fetchImpl }) });
  const { plan, completed, skipped } = await tracker.importPlan("ENG-1");
  assert.deepEqual(completed, ["1.0"]);
  assert.deepEqual(skipped, ["ENG-9"]);
  assert.deepEqual(plan.tasks[1].dependsOn, ["1.0"]);
  assert.deepEqual(plan.tasks[1].tags, ["ui"]);
  assert.equal(plan.tasks[1].tracker.identifier, "ENG-3");
  const rebuilt = engine.createRun({ id: "r2", plan, runtime: "orca", now: T0, completed });
  assert.equal(rebuilt.tasks["2.0"].state, "ready");
});

test("parseTaskBlock ignores descriptions without a valid block", () => {
  assert.equal(parseTaskBlock("plain text"), null);
  assert.equal(parseTaskBlock("```agent-kit-task\n{bad\n```"), null);
  assert.deepEqual(parseTaskBlock("```agent-kit-task\n{\"id\":\"1\"}\n```"), { id: "1" });
});

test("createTracker uses the configured API key variable, and the local tracker only marks events", async () => {
  const config = defaultConfig();
  config.tracker = { kind: "linear", linear: settings({ apiKeyEnv: "MY_LINEAR" }) };
  assert.throws(() => createTracker(config, { env: {} }), /API key is missing/);
  assert.equal(createTracker(config, { env: { MY_LINEAR: "k" }, fetchImpl: fakeLinear().fetchImpl }).kind, "linear");
  const local = createTracker(defaultConfig());
  const run = makeRun();
  assert.equal((await local.sync(run)).synced, run.events.length);
  await assert.rejects(local.importPlan("ENG-1"), /cannot import/);
});
