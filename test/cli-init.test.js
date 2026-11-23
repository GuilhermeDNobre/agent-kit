import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../bin/cli.js", import.meta.url));

function cli(cwd, ...args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("init in an empty directory writes a valid greenfield T3 setup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-kit-cli-empty-"));
  const result = cli(dir, "init", "-y", "--name", "empty", "--description", "nothing yet");
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Mode:\s+greenfield \(detected\)/);
  assert.match(result.stdout, /Runtime: t3/);
  const config = JSON.parse(await readFile(join(dir, ".agent-kit", "config.json"), "utf8"));
  assert.equal(config.runtime, "t3");
  assert.deepEqual(config.checks, []);
  assert.equal(config.project.name, "empty");
  const validate = cli(dir, "validate");
  assert.equal(validate.code, 0, validate.stdout);
});

test("init in an existing Node project derives checks and keeps the user's files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-kit-cli-existing-"));
  await writeFile(join(dir, "package.json"), JSON.stringify({ name: "shop", scripts: { test: "vitest", lint: "eslint .", typecheck: "tsc --noEmit" } }));
  await writeFile(join(dir, "AGENTS.md"), "MY RULES");
  const result = cli(dir, "init", "-y");
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /skipped\s+AGENTS\.md/);
  assert.equal(await readFile(join(dir, "AGENTS.md"), "utf8"), "MY RULES");
  const config = JSON.parse(await readFile(join(dir, ".agent-kit", "config.json"), "utf8"));
  assert.deepEqual(config.checks.map((check) => check.command), ["npm run lint", "npm run typecheck", "npm test"]);

  const again = cli(dir, "init", "-y");
  assert.doesNotMatch(again.stdout, /\bcreated\b/);
});

test("init --runtime orca --tracker linear writes the legacy guide and the Linear settings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-kit-cli-orca-"));
  const result = cli(dir, "init", "-y", "--runtime", "orca", "--tracker", "linear", "--linear-team", "ENG");
  assert.equal(result.code, 0, result.stderr);
  assert.ok(existsSync(join(dir, ".agent-kit", "runtime", "orca.md")));
  assert.ok(!existsSync(join(dir, ".agent-kit", "runtime", "t3.md")));
  const config = JSON.parse(await readFile(join(dir, ".agent-kit", "config.json"), "utf8"));
  assert.equal(config.tracker.kind, "linear");
  assert.equal(config.tracker.linear.teamKey, "ENG");
  assert.match(result.stdout, /LINEAR_API_KEY/);
});

test("init --dry-run writes nothing and bad flags fail clearly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-kit-cli-dry-"));
  const result = cli(dir, "init", "--dry-run", "-y");
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Dry run/);
  assert.ok(!existsSync(join(dir, ".agent-kit")));
  const bad = cli(dir, "init", "-y", "--runtime", "kubernetes");
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /Invalid --runtime/);
});

test("the wf, policy and runtimes subcommands are reachable from the binary", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-kit-cli-sub-"));
  assert.match(cli(dir, "wf", "help").stdout, /wf dispatch <run> <task>/);
  assert.equal(cli(dir, "policy", "check", "--", "git", "push", "--force").code, 3);
  assert.match(cli(dir, "runtimes").stdout, /"t3"/);
  assert.match(cli(dir, "--version").stdout, /^\d+\.\d+\.\d+/);
});
