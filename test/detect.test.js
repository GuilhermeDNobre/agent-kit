import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectProject } from "../src/detect.js";

async function makeProject(files) {
  const dir = await mkdtemp(join(tmpdir(), "agent-kit-detect-"));
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content, "utf8");
  }
  return dir;
}

test("reports greenfield when no manifest exists", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-kit-empty-"));
  const result = await detectProject(dir);
  assert.equal(result.mode, "greenfield");
  assert.equal(result.manifest, null);
  assert.equal(result.commands.test, "TBD");
});

test("reports existing and reads name and description from package.json", async () => {
  const dir = await makeProject({
    "package.json": JSON.stringify({ name: "my-app", description: "does things" }),
  });
  const result = await detectProject(dir);
  assert.equal(result.mode, "existing");
  assert.equal(result.manifest, "package.json");
  assert.equal(result.name, "my-app");
  assert.equal(result.description, "does things");
});

test("derives commands only from scripts that actually exist", async () => {
  const dir = await makeProject({
    "package.json": JSON.stringify({ name: "x", scripts: { test: "vitest" } }),
  });
  const result = await detectProject(dir);
  assert.equal(result.commands.test, "npm test");
  assert.equal(result.commands.build, "TBD");
  assert.equal(result.commands.lint, "TBD");
});

test("picks the package manager from the lockfile", async () => {
  const dir = await makeProject({
    "package.json": JSON.stringify({ name: "x", scripts: { build: "tsc" } }),
    "pnpm-lock.yaml": "",
  });
  const result = await detectProject(dir);
  assert.equal(result.commands.install, "pnpm install");
  assert.equal(result.commands.build, "pnpm run build");
});

test("falls back to npm install when no lockfile is present", async () => {
  const dir = await makeProject({ "package.json": JSON.stringify({ name: "x" }) });
  const result = await detectProject(dir);
  assert.equal(result.commands.install, "npm install");
});

test("detects a non-Node manifest without inventing commands", async () => {
  const dir = await makeProject({ "go.mod": "module example.com/x" });
  const result = await detectProject(dir);
  assert.equal(result.mode, "existing");
  assert.equal(result.stack, "Go");
  assert.equal(result.commands.build, "TBD");
});

test("survives a malformed package.json instead of throwing", async () => {
  const dir = await makeProject({ "package.json": "{ not json" });
  const result = await detectProject(dir);
  assert.equal(result.mode, "existing");
  assert.ok(result.name.length > 0);
});

test("ignores a manifest nested in a subdirectory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-kit-nested-"));
  await mkdir(join(dir, "sub"));
  await writeFile(join(dir, "sub", "package.json"), "{}", "utf8");
  const result = await detectProject(dir);
  assert.equal(result.mode, "greenfield");
});
