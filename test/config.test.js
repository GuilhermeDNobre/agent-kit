import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultAutonomy,
  defaultConfig,
  defaultWorkflow,
  executorId,
  loadSettings,
  profileForTask,
  validateAutonomy,
  validateConfig,
  validatePlan,
  validateWorkflow,
} from "../src/core/config.js";
import { buildConfig, checksFromCommands, normalizeInitChoices } from "../src/generate.js";

test("the default configuration is valid and only warns about unset models", () => {
  const config = defaultConfig();
  const result = validateConfig(config);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.every((warning) => /model is not set/.test(warning)));
  assert.deepEqual(validateAutonomy(defaultAutonomy(), config).errors, []);
  assert.deepEqual(validateWorkflow(defaultWorkflow(), config).errors, []);
});

test("the coordinator owns pm, architect and release; secondary roles map to worker profiles", () => {
  const config = defaultConfig();
  assert.equal(config.roles.pm, "coordinator");
  assert.equal(config.roles.architect, "coordinator");
  assert.equal(config.roles.release, "coordinator");
  assert.equal(config.roles.implementation, "standard");
  assert.equal(config.roles.security, "validator");
  assert.equal(config.profiles.coordinator.provider, "coordinator");
});

test("validateConfig reports unknown runtime, tracker, roles and missing Linear team", () => {
  const config = defaultConfig();
  config.runtime = "nope";
  config.roles.qa = "ghost";
  config.tracker.kind = "linear";
  config.tracker.linear.via = "api";
  const { errors } = validateConfig(config);
  assert.ok(errors.some((error) => /runtime must be one of/.test(error)));
  assert.ok(errors.some((error) => /roles.qa points to unknown profile "ghost"/.test(error)));
  assert.ok(errors.some((error) => /teamKey is required/.test(error)));
});

test("Linear goes through each runtime's own connection, always into a dedicated project", () => {
  const t3 = defaultConfig({ runtime: "t3" });
  t3.tracker.kind = "linear";
  assert.equal(t3.tracker.linear.via, "t3");
  assert.ok(validateConfig(t3).errors.some((error) => /project.name is required/.test(error)));
  t3.tracker.linear.project.name = "shop";
  assert.deepEqual(validateConfig(t3).errors, []);

  const orca = defaultConfig({ runtime: "orca" });
  orca.tracker.kind = "linear";
  orca.tracker.linear.project.name = "shop";
  assert.equal(orca.tracker.linear.via, "orca");
  assert.ok(validateConfig(orca).errors.some((error) => /teamKey is required when tracker.linear.via is "orca"/.test(error)));
  orca.tracker.linear.teamKey = "ENG";
  assert.deepEqual(validateConfig(orca).errors, []);
  orca.tracker.linear.via = "t3";
  assert.ok(validateConfig(orca).errors.some((error) => /needs runtime "t3"/.test(error)));
  t3.tracker.linear.via = "orca";
  assert.ok(validateConfig(t3).errors.some((error) => /needs runtime "orca"/.test(error)));
});

test("validateAutonomy rejects bad limits, strategies and regexes", () => {
  const autonomy = defaultAutonomy();
  autonomy.maxWorkers = 0;
  autonomy.retry.strategy = "random";
  autonomy.protectedActions.categories = [{ id: "x", patterns: ["(unclosed"] }];
  const { errors } = validateAutonomy(autonomy, defaultConfig());
  assert.ok(errors.some((error) => /maxWorkers/.test(error)));
  assert.ok(errors.some((error) => /retry.strategy/.test(error)));
  assert.ok(errors.some((error) => /invalid pattern/.test(error)));
});

test("validateWorkflow checks roles, conditions and gate ordering", () => {
  const { errors } = validateWorkflow({ gates: [{ id: "a", role: "qa", when: "sometimes" }, { id: "b", role: "wizard", after: ["zzz"] }] }, defaultConfig());
  assert.ok(errors.some((error) => /invalid when/.test(error)));
  assert.ok(errors.some((error) => /unknown role "wizard"/.test(error)));
  assert.ok(errors.some((error) => /after unknown gate "zzz"/.test(error)));
});

test("validatePlan requires owned files and acceptance criteria", () => {
  const errors = validatePlan({ tasks: [{ id: "1", title: "x", role: "chef", tags: "ui" }] });
  assert.ok(errors.some((error) => /must list the files/.test(error)));
  assert.ok(errors.some((error) => /acceptance criterion/.test(error)));
  assert.ok(errors.some((error) => /unknown role "chef"/.test(error)));
  assert.ok(errors.some((error) => /tags must be an array/.test(error)));
  assert.deepEqual(validatePlan({ tasks: [] }), ["plan.tasks must be a non-empty array"]);
});

test("profileForTask picks plan override, role mapping, then standard", () => {
  const config = defaultConfig();
  assert.equal(profileForTask({ id: "a", role: "docs" }, config).name, "fast");
  assert.equal(profileForTask({ id: "a", role: "docs", profile: "advanced" }, config).name, "advanced");
  assert.equal(profileForTask({ id: "a", role: "docs" }, config, "standard").name, "standard");
  assert.throws(() => profileForTask({ id: "a" }, config, "ghost"), /Unknown profile/);
  assert.equal(executorId({ provider: "antigravity", model: "m" }), "antigravity:m");
  assert.equal(executorId({ provider: "coordinator" }), "coordinator");
});

test("loadSettings merges project files over defaults and reports what it found", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-kit-settings-"));
  await mkdir(join(root, ".agent-kit"));
  await writeFile(join(root, ".agent-kit", "autonomy.json"), JSON.stringify({ maxWorkers: 1 }));
  const { config, autonomy, found } = await loadSettings(root);
  assert.equal(autonomy.maxWorkers, 1);
  assert.equal(autonomy.maxAttemptsPerTask, 3);
  assert.equal(config.runtime, "t3");
  assert.deepEqual(found, { config: false, autonomy: true, workflow: false });
  await writeFile(join(root, ".agent-kit", "config.json"), "{ nope");
  await assert.rejects(loadSettings(root), /not valid JSON/);
});

test("init choices detect the runtime, default to the local tracker and validate their values", () => {
  assert.deepEqual(normalizeInitChoices({}, {}), { runtime: "orca", tracker: "local", linearTeam: null, linearProject: null });
  assert.equal(normalizeInitChoices({}, { T3_THREAD_ID: "t" }).runtime, "t3");
  assert.equal(normalizeInitChoices({}, { TERM_PROGRAM: "Orca" }).runtime, "orca");
  assert.equal(normalizeInitChoices({ runtime: "t3" }, { TERM_PROGRAM: "Orca" }).runtime, "t3");
  assert.deepEqual(normalizeInitChoices({ runtime: "orca", tracker: "linear", "linear-team": "ENG", "linear-project": "Shop" }, {}), { runtime: "orca", tracker: "linear", linearTeam: "ENG", linearProject: "Shop" });
  assert.throws(() => normalizeInitChoices({ "linear-project": "x" }, {}), /requires --tracker linear/);
  assert.throws(() => normalizeInitChoices({ runtime: "x" }), /Invalid --runtime/);
  assert.throws(() => normalizeInitChoices({ "linear-team": "ENG" }), /requires --tracker linear/);
});

test("generated checks come only from commands that exist", () => {
  assert.deepEqual(checksFromCommands({ lint: "npm run lint", typecheck: "TBD", test: "npm test", build: "TBD" }).map((check) => check.name), ["lint", "test"]);
  const config = buildConfig({
    detected: { stack: "Node.js", manifest: "package.json", commands: { test: "npm test" } },
    answers: { name: "demo", description: "d" },
    choices: { runtime: "orca", tracker: "linear", linearTeam: "ENG" },
  });
  assert.equal(config.runtime, "orca");
  assert.equal(config.tracker.kind, "linear");
  assert.equal(config.tracker.linear.teamKey, "ENG");
  assert.equal(config.tracker.linear.project.name, "demo", "the Linear project defaults to the repository's name");
  assert.equal(config.project.stack, "Node.js");
  assert.deepEqual(validateConfig(config).errors, []);
});
