import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { planFiles, installFiles } from "../src/install.js";
import { generatedFiles } from "../src/generate.js";

const TEMPLATES_DIR = fileURLToPath(new URL("../templates/", import.meta.url));

async function initProject() {
  const root = await mkdtemp(join(tmpdir(), "agent-kit-hooks-"));
  const detected = { stack: null, manifest: null, commands: {} };
  const files = [...(await planFiles(TEMPLATES_DIR)), ...(await generatedFiles({ detected, answers: { name: "x" }, choices: { runtime: "t3", tracker: "local" } }))];
  await installFiles({ files, targetDir: root, mode: "greenfield", vars: { RUNTIME: "t3" }, flags: ["runtime-t3"], resolveConflict: async () => "skip", dryRun: false });
  return root;
}

function runHook(root, script, input) {
  const result = spawnSync(process.execPath, [join(root, ".agent-kit", "hooks", script)], {
    input: input === undefined ? "" : JSON.stringify(input),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("the PreToolUse hook asks before a protected command and stays silent otherwise", async () => {
  const root = await initProject();
  assert.equal(runHook(root, "pretooluse.mjs", { tool_name: "Bash", tool_input: { command: "npm test" } }), "");
  const output = JSON.parse(runHook(root, "pretooluse.mjs", { tool_name: "Bash", tool_input: { command: "npm publish" } }));
  assert.equal(output.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(output.hookSpecificOutput.permissionDecision, "ask");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /package-publish/);
});

test("the hook protects paths, honours a deny decision from autonomy.json and ignores bad input", async () => {
  const root = await initProject();
  const write = JSON.parse(runHook(root, "pretooluse.mjs", { tool_name: "Write", tool_input: { file_path: join(root, ".env") } }));
  assert.equal(write.hookSpecificOutput.permissionDecision, "ask");
  await writeFile(join(root, ".agent-kit", "autonomy.json"), JSON.stringify({ protectedActions: { decision: "deny" } }));
  const denied = JSON.parse(runHook(root, "pretooluse.mjs", { tool_name: "Bash", tool_input: { command: "terraform destroy" } }));
  assert.equal(denied.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(runHook(root, "pretooluse.mjs"), "");
});

test("the session hook lists unfinished runs and is silent when there are none", async () => {
  const root = await initProject();
  assert.equal(runHook(root, "session-context.mjs"), "");
  await mkdir(join(root, ".agent-kit", "runs", "r1"), { recursive: true });
  await writeFile(join(root, ".agent-kit", "runs", "r1", "run.json"), JSON.stringify({ id: "r1", state: "blocked", objective: "auth", tasks: { a: { state: "failed" }, b: { state: "completed" } } }));
  await mkdir(join(root, ".agent-kit", "runs", "r0"), { recursive: true });
  await writeFile(join(root, ".agent-kit", "runs", "r0", "run.json"), JSON.stringify({ id: "r0", state: "completed", tasks: {} }));
  const output = runHook(root, "session-context.mjs");
  assert.match(output, /r1 \(blocked\): auth — 1 failed, 1 completed/);
  assert.doesNotMatch(output, /r0/);
  assert.match(output, /\/retomar-workflow/);
});
