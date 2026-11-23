import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { RUNTIMES, TRACKERS, defaultAutonomy, defaultConfig, defaultWorkflow } from "./core/config.js";

const POLICY_SOURCE = fileURLToPath(new URL("./core/policy.js", import.meta.url));
const UNKNOWN = "TBD";

export function normalizeInitChoices(flags = {}) {
  const runtime = flags.runtime || "t3";
  const tracker = flags.tracker || "local";
  if (!RUNTIMES.includes(runtime)) throw new Error(`Invalid --runtime: ${runtime}. Use ${RUNTIMES.join(" or ")}.`);
  if (!TRACKERS.includes(tracker)) throw new Error(`Invalid --tracker: ${tracker}. Use ${TRACKERS.join(" or ")}.`);
  if (flags["linear-team"] && tracker !== "linear") throw new Error("--linear-team requires --tracker linear");
  return { runtime, tracker, linearTeam: flags["linear-team"] || null };
}

export function checksFromCommands(commands = {}) {
  const order = [
    ["lint", commands.lint],
    ["typecheck", commands.typecheck],
    ["test", commands.test],
    ["build", commands.build],
  ];
  return order
    .filter(([, command]) => command && command !== UNKNOWN)
    .map(([name, command]) => ({ name, command, required: true }));
}

export function buildConfig({ detected, answers, choices }) {
  const config = defaultConfig({ runtime: choices.runtime, checks: checksFromCommands(detected.commands) });
  config.project = {
    name: answers.name,
    description: answers.description || "",
    stack: detected.stack || null,
    manifest: detected.manifest || null,
  };
  config.tracker.kind = choices.tracker;
  if (choices.linearTeam) config.tracker.linear.teamKey = choices.linearTeam;
  return config;
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function generatedFiles({ detected, answers, choices }) {
  const policy = await readFile(POLICY_SOURCE, "utf8");
  return [
    { target: join(".agent-kit", "config.json"), content: json(buildConfig({ detected, answers, choices })) },
    { target: join(".agent-kit", "autonomy.json"), content: json(defaultAutonomy()) },
    { target: join(".agent-kit", "workflow.json"), content: json(defaultWorkflow()) },
    { target: join(".agent-kit", "hooks", "policy.mjs"), content: policy },
  ];
}
