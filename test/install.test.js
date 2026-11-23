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
  CMD_TYPECHECK: "npm run typecheck",
  CMD_TEST_ONE: "npm test -- t.spec.ts",
  RUNTIME: "t3",
};

async function freshDir(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

async function installInto(dir, mode, resolveConflict = async () => "skip", runtime = "t3") {
  const files = await planFiles(TEMPLATES_DIR, { runtime });
  return installFiles({
    files,
    targetDir: dir,
    mode,
    vars: { ...VARS, RUNTIME: runtime },
    flags: [`runtime-${runtime}`],
    resolveConflict,
    dryRun: false,
  });
}

test("maps the claude and agent-kit template folders onto dotted directories", async () => {
  const files = await planFiles(TEMPLATES_DIR);
  const targets = files.map((file) => file.target);
  assert.ok(targets.includes("CLAUDE.md"));
  assert.ok(targets.includes("AGENTS.md"));
  assert.ok(targets.some((target) => target.startsWith(`.claude${sep}commands${sep}`)));
  assert.ok(targets.some((target) => target.startsWith(`.agent-kit${sep}runtime${sep}`)));
  assert.ok(!targets.some((target) => target.startsWith(`claude${sep}`)));
  assert.ok(!targets.some((target) => target.startsWith(`agent-kit${sep}`)));
});

test("writes the full skeleton into an empty directory", async () => {
  const dir = await freshDir("agent-kit-install-");
  const results = await installInto(dir, "greenfield");
  assert.ok(results.every((result) => result.action === "created"));
  assert.ok(existsSync(join(dir, "CLAUDE.md")));
  assert.ok(existsSync(join(dir, ".claude", "rules", "README.md")));
  assert.ok(existsSync(join(dir, ".claude", "templates", "bugs-template.md")));
  assert.ok(existsSync(join(dir, ".claude", "templates", "plan-template.json")));
});

test("leaves no unresolved placeholder in any generated file", async () => {
  const dir = await freshDir("agent-kit-vars-");
  await installInto(dir, "existing");
  const claudeMd = await readFile(join(dir, "CLAUDE.md"), "utf8");
  const agentsMd = await readFile(join(dir, "AGENTS.md"), "utf8");
  assert.deepEqual(findUnresolved(claudeMd), []);
  assert.deepEqual(findUnresolved(agentsMd), []);
  assert.match(agentsMd, /\*\*demo\*\* — a demo project/);
  assert.match(agentsMd, /\| Typecheck \| `npm run typecheck` \|/);
});

test("greenfield and existing modes produce different stack sections", async () => {
  const template = await readFile(join(TEMPLATES_DIR, "AGENTS.md"), "utf8");
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
  await writeFile(join(dir, "AGENTS.md"), "MINE", "utf8");
  await installInto(dir, "greenfield", async () => "overwrite");
  const written = await readFile(join(dir, "AGENTS.md"), "utf8");
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
  const files = await planFiles(TEMPLATES_DIR, { runtime: "t3" });
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
  assert.ok(!existsSync(join(dir, ".agent-kit")));
});

test("creates nested directories that do not exist yet", async () => {
  const dir = await freshDir("agent-kit-nested-");
  await mkdir(join(dir, "unrelated"));
  await installInto(dir, "greenfield");
  assert.ok(existsSync(join(dir, ".claude", "commands", "executar-task.md")));
});

test("CLAUDE.md imports AGENTS.md and the selected runtime guide, and starts with the setup notice", async () => {
  const dir = await freshDir("agent-kit-claude-");
  await installInto(dir, "greenfield");
  const claudeMd = await readFile(join(dir, "CLAUDE.md"), "utf8");
  assert.match(claudeMd, /^@AGENTS\.md\r?\n@\.agent-kit\/runtime\/t3\.md\r?\n/);
  assert.match(claudeMd, /<!--WORKER-SETUP-->[\s\S]*\/configurar-worker[\s\S]*<!--\/WORKER-SETUP-->/);
  assert.ok(existsSync(join(dir, ".agent-kit", "runtime", "t3.md")));
  assert.ok(!existsSync(join(dir, ".agent-kit", "runtime", "orca.md")));
});

test("the orca runtime installs only the orca guide, with the worker recipe placeholder", async () => {
  const dir = await freshDir("agent-kit-orca-");
  await installInto(dir, "greenfield", async () => "skip", "orca");
  const claudeMd = await readFile(join(dir, "CLAUDE.md"), "utf8");
  assert.match(claudeMd, /@\.agent-kit\/runtime\/orca\.md/);
  assert.ok(!existsSync(join(dir, ".agent-kit", "runtime", "t3.md")));
  const guide = await readFile(join(dir, ".agent-kit", "runtime", "orca.md"), "utf8");
  assert.match(guide, /<!--WORKER-RECIPE-->\r?\n\*\*Not configured\.\*\*/);
  const configure = await readFile(join(dir, ".claude", "commands", "configurar-worker.md"), "utf8");
  assert.match(configure, /Perguntar \(Orca\)/);
  assert.doesNotMatch(configure, /orchestrator_capabilities/);
});

test("configurar-worker keeps only the selected runtime's section", async () => {
  const dir = await freshDir("agent-kit-t3cfg-");
  await installInto(dir, "greenfield");
  const configure = await readFile(join(dir, ".claude", "commands", "configurar-worker.md"), "utf8");
  assert.match(configure, /orchestrator_capabilities/);
  assert.doesNotMatch(configure, /Perguntar \(Orca\)/);
  assert.doesNotMatch(configure, /<!--IF:/);
});

test("writes the worker protocol and the pipeline commands", async () => {
  const dir = await freshDir("agent-kit-pipeline-");
  await installInto(dir, "greenfield");
  assert.ok(existsSync(join(dir, "docs", "agents", "worker.md")));
  const commands = [
    "configurar-worker",
    "avaliar-ideia",
    "analisar-consistencia",
    "fechar-ciclo",
    "executar-workflow",
    "status-workflow",
    "retomar-workflow",
    "replanejar-workflow",
    "executar-release",
  ];
  for (const command of commands) {
    assert.ok(existsSync(join(dir, ".claude", "commands", `${command}.md`)), command);
  }
});

test("writes the approval and session hooks and their wiring", async () => {
  const dir = await freshDir("agent-kit-hooks-");
  await installInto(dir, "existing");
  const settings = JSON.parse(await readFile(join(dir, ".claude", "settings.json"), "utf8"));
  assert.match(settings.hooks.PreToolUse[0].hooks[0].command, /pretooluse\.mjs/);
  assert.match(settings.hooks.SessionStart[0].hooks[0].command, /session-context\.mjs/);
  assert.ok(existsSync(join(dir, ".agent-kit", "hooks", "pretooluse.mjs")));
  assert.ok(existsSync(join(dir, ".agent-kit", "hooks", "session-context.mjs")));
});

test("no template hard-codes a model id, and worker tools appear only in runtime-specific files", async () => {
  const files = await planFiles(TEMPLATES_DIR);
  const modelIds = /\b(gemini-[0-9][\w.-]*|claude-(opus|sonnet|haiku|fable)-[0-9][\w.-]*|gpt-[0-9][\w.-]*)\b/i;
  const toolNames = /\b(agy|opencode|antigravity|gemini|muse-spark)\b/i;
  const runtimeSpecific = (target) => target.endsWith("configurar-worker.md") || target.includes(`runtime${sep}`);
  for (const file of files) {
    const text = await readFile(file.source, "utf8");
    assert.doesNotMatch(text, modelIds, file.target);
    if (!runtimeSpecific(file.target)) assert.doesNotMatch(text, toolNames, file.target);
  }
});
