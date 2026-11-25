import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { CONFIG_DIR, RUNTIMES, loadSettings, validateAutonomy, validateConfig, validateWorkflow } from "../core/config.js";
import { assertPlan } from "../core/engine.js";
import { classifyCommand, classifyWrite } from "../core/policy.js";
import { executionWaves } from "../core/dag.js";
import { listAdapters } from "../runtimes/index.js";
import { detectRuntime } from "../runtimes/detect.js";

export async function runValidate(argv, { root = process.cwd(), out = console.log } = {}) {
  const { values } = parseArgs({ args: argv, options: { plan: { type: "string" } }, allowPositionals: false });
  const { config, autonomy, workflow, found } = await loadSettings(root);
  const configResult = validateConfig(config);
  const autonomyResult = validateAutonomy(autonomy, config);
  const workflowResult = validateWorkflow(workflow, config);
  const errors = [...configResult.errors, ...autonomyResult.errors, ...workflowResult.errors];
  const warnings = [...configResult.warnings];
  if (!found.workflow) warnings.push(".agent-kit/workflow.json not found; using the default role pipeline");
  if (!found.config) warnings.push(".agent-kit/config.json not found; using defaults");
  if (!found.autonomy) warnings.push(".agent-kit/autonomy.json not found; using defaults");
  let waves;
  if (values.plan) {
    try {
      const plan = JSON.parse(await readFile(resolve(root, values.plan), "utf8"));
      assertPlan(plan);
      waves = executionWaves(plan.tasks);
    } catch (error) {
      errors.push(error.message);
    }
  }
  out(JSON.stringify({ valid: errors.length === 0, errors, warnings, waves }, null, 2));
  return errors.length === 0 ? 0 : 1;
}

export async function runPolicy(argv, { root = process.cwd(), out = console.log } = {}) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { path: { type: "string" } },
    allowPositionals: true,
  });
  if (positionals[0] !== "check") throw new Error("Usage: agent-kit policy check -- <command> | --path <path>");
  const { autonomy } = await loadSettings(root);
  const verdict = values.path ? classifyWrite(values.path, autonomy) : classifyCommand(positionals.slice(1).join(" "), autonomy);
  out(JSON.stringify(verdict, null, 2));
  return verdict.decision === "allow" ? 0 : 3;
}

export async function runRuntimes(_argv, { out = console.log } = {}) {
  out(JSON.stringify(listAdapters(), null, 2));
  return 0;
}

const RUNTIME_IMPORT = /^@\.agent-kit\/runtime\/[a-z0-9-]+\.md$/;

export async function runRuntime(argv, { root = process.cwd(), out = console.log, env = process.env } = {}) {
  const { values, positionals } = parseArgs({ args: argv, options: { "t3-tools": { type: "boolean", default: false } }, allowPositionals: true });
  const [action, name] = positionals;
  if (action === "detect") {
    const configPath = join(root, CONFIG_DIR, "config.json");
    const configured = existsSync(configPath) ? JSON.parse(await readFile(configPath, "utf8")).runtime || null : null;
    const detected = detectRuntime(env, { t3Tools: values["t3-tools"] });
    out(JSON.stringify({ ...detected, configured, matches: configured === detected.runtime }, null, 2));
    return 0;
  }
  if (action === "set") return setRuntime(root, name, out);
  throw new Error("Usage: agent-kit runtime detect [--t3-tools] | agent-kit runtime set <t3|orca>");
}

function withRuntimeImport(text, name) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const line = `@.agent-kit/runtime/${name}.md`;
  const index = lines.findIndex((item) => RUNTIME_IMPORT.test(item));
  if (index >= 0) lines[index] = line;
  else lines.splice(lines[0] === "@AGENTS.md" ? 1 : 0, 0, line);
  return lines.join(eol);
}

async function setRuntime(root, name, out) {
  if (!RUNTIMES.includes(name)) throw new Error(`Unknown runtime "${name}". Use ${RUNTIMES.join(" or ")}.`);
  const configPath = join(root, CONFIG_DIR, "config.json");
  if (!existsSync(configPath)) throw new Error(`${configPath} not found; run agent-kit init first`);
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const previous = config.runtime || null;
  config.runtime = name;
  const notes = [];
  const via = config.tracker?.linear?.via;
  if ((via === "t3" || via === "orca") && via !== name) {
    config.tracker.linear.via = name;
    notes.push(`tracker.linear.via changed from "${via}" to "${name}": Linear is reached through the runtime's own connection`);
    if (name === "orca" && !config.tracker.linear.teamKey) notes.push("set tracker.linear.teamKey (orca linear team list) — Linear through Orca needs it");
  }
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  const claudePath = join(root, "CLAUDE.md");
  let claudeMd = "missing";
  if (existsSync(claudePath)) {
    const text = await readFile(claudePath, "utf8");
    const next = withRuntimeImport(text, name);
    claudeMd = next === text ? "unchanged" : "updated";
    if (next !== text) await writeFile(claudePath, next, "utf8");
  }
  const guide = join(CONFIG_DIR, "runtime", `${name}.md`);
  if (!existsSync(join(root, guide))) notes.push(`${guide} is missing; run agent-kit init again (existing files are kept) to write it`);
  out(JSON.stringify({ runtime: name, previous, claudeMd, notes }, null, 2));
  return 0;
}
