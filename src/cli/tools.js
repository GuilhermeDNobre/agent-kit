import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadSettings, validateAutonomy, validateConfig, validateWorkflow } from "../core/config.js";
import { assertPlan } from "../core/engine.js";
import { classifyCommand, classifyWrite } from "../core/policy.js";
import { executionWaves } from "../core/dag.js";
import { listAdapters } from "../runtimes/index.js";

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
