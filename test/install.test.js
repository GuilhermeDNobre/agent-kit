import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { planFiles, installFiles } from "../src/install.js";
import { render, findUnresolved } from "../src/render.js";

const TEMPLATES_DIR = fileURLToPath(new URL("../templates/", import.meta.url));

const VARS = {
  PROJECT_NAME: "demo",
  PROJECT_DESCRIPTION: "a demo project",
  STACK_MANIFEST: "package.json",
  CMD_INSTALL: "npm ci",
  CMD_BUILD: "npm run build",
  CMD_TEST: "npm test",
  CMD_LINT: "npm run lint",
  CMD_TEST_ONE: "npm test -- t.spec.ts",
};

async function freshDir(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

async function installInto(dir, mode, resolveConflict = async () => "skip") {
  const files = await planFiles(TEMPLATES_DIR);
  return installFiles({ files, targetDir: dir, mode, vars: VARS, resolveConflict, dryRun: false });
}

test("maps the claude template folder onto a dotted .claude directory", async () => {
  const files = await planFiles(TEMPLATES_DIR);
  const targets = files.map((file) => file.target);
  assert.ok(targets.includes("CLAUDE.md"));
  assert.ok(targets.includes("AGENTS.md"));
  assert.ok(targets.some((target) => target.startsWith(`.claude${sep}commands${sep}`)));
  assert.ok(!targets.some((target) => target.startsWith(`claude${sep}`)));
});

test("writes the full skeleton into an empty directory", async () => {
  const dir = await freshDir("agent-kit-install-");
  const results = await installInto(dir, "greenfield");
  assert.ok(results.every((result) => result.action === "created"));
  assert.ok(existsSync(join(dir, "CLAUDE.md")));
  assert.ok(existsSync(join(dir, ".claude", "rules", "README.md")));
  assert.ok(existsSync(join(dir, ".claude", "templates", "bugs-template.md")));
});

test("leaves no unresolved placeholder in any generated file", async () => {
  const dir = await freshDir("agent-kit-vars-");
  await installInto(dir, "existing");
  const claudeMd = await readFile(join(dir, "CLAUDE.md"), "utf8");
  const agentsMd = await readFile(join(dir, "AGENTS.md"), "utf8");
  assert.deepEqual(findUnresolved(claudeMd), []);
  assert.deepEqual(findUnresolved(agentsMd), []);
  assert.match(claudeMd, /\*\*demo\*\* — a demo project/);
});

test("greenfield and existing modes produce different stack sections", async () => {
  const template = await readFile(join(TEMPLATES_DIR, "CLAUDE.md"), "utf8");
  const greenfield = render(template, "greenfield", VARS);
  const existing = render(template, "existing", VARS);
  assert.match(greenfield, /Stack: not chosen yet/);
  assert.doesNotMatch(greenfield, /npm ci/);
  assert.match(existing, /npm ci/);
  assert.doesNotMatch(existing, /Stack: not chosen yet/);
});

test("skips a file that already exists when the resolver says skip", async () => {
  const dir = await freshDir("agent-kit-skip-");
  await writeFile(join(dir, "CLAUDE.md"), "MINE", "utf8");
  const results = await installInto(dir, "greenfield", async () => "skip");
  const claudeResult = results.find((result) => result.target === "CLAUDE.md");
  assert.equal(claudeResult.action, "skipped");
  assert.equal(await readFile(join(dir, "CLAUDE.md"), "utf8"), "MINE");
});

test("overwrites only when the resolver says overwrite", async () => {
  const dir = await freshDir("agent-kit-force-");
  await writeFile(join(dir, "CLAUDE.md"), "MINE", "utf8");
  await installInto(dir, "greenfield", async () => "overwrite");
  const written = await readFile(join(dir, "CLAUDE.md"), "utf8");
  assert.notEqual(written, "MINE");
  assert.match(written, /\*\*demo\*\*/);
});

test("keep-both preserves the original and writes a .new sibling", async () => {
  const dir = await freshDir("agent-kit-both-");
  await writeFile(join(dir, "AGENTS.md"), "MINE", "utf8");
  await installInto(dir, "greenfield", async () => "keep-both");
  assert.equal(await readFile(join(dir, "AGENTS.md"), "utf8"), "MINE");
  assert.ok(existsSync(join(dir, "AGENTS.md.new")));
});

test("dry run writes nothing to disk", async () => {
  const dir = await freshDir("agent-kit-dry-");
  const files = await planFiles(TEMPLATES_DIR);
  await installFiles({
    files,
    targetDir: dir,
    mode: "greenfield",
    vars: VARS,
    resolveConflict: async () => "skip",
    dryRun: true,
  });
  assert.ok(!existsSync(join(dir, "CLAUDE.md")));
  assert.ok(!existsSync(join(dir, ".claude")));
});

test("creates nested directories that do not exist yet", async () => {
  const dir = await freshDir("agent-kit-nested-");
  await mkdir(join(dir, "unrelated"));
  await installInto(dir, "greenfield");
  assert.ok(existsSync(join(dir, ".claude", "commands", "executar-task.md")));
});
