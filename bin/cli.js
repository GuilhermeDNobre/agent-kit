#!/usr/bin/env node
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { detectProject } from "../src/detect.js";
import { planFiles, installFiles } from "../src/install.js";
import { generatedFiles, normalizeInitChoices } from "../src/generate.js";
import { runWorkflowCommand } from "../src/cli/wf.js";
import { runValidate, runPolicy, runRuntimes } from "../src/cli/tools.js";

const TEMPLATES_DIR = fileURLToPath(new URL("../templates/", import.meta.url));
const PACKAGE_JSON = fileURLToPath(new URL("../package.json", import.meta.url));

const OPTIONS = {
  name: { type: "string" },
  description: { type: "string" },
  mode: { type: "string" },
  runtime: { type: "string" },
  tracker: { type: "string" },
  "linear-team": { type: "string" },
  force: { type: "boolean", default: false },
  yes: { type: "boolean", short: "y", default: false },
  "dry-run": { type: "boolean", default: false },
  help: { type: "boolean", short: "h", default: false },
  version: { type: "boolean", short: "v", default: false },
};

const HELP = `
agent-kit — scaffolds and runs an autonomous coordinator / worker workflow.

Usage:
  npx @guilhermednobre/agent-kit init [directory] [options]
  agent-kit wf <command> ...           workflow state for the coordinator (agent-kit wf help)
  agent-kit validate [--plan <file>]   validate .agent-kit configuration (and a plan)
  agent-kit policy check -- <command>  is this command allowed autonomously? (exit 3 = needs approval)
  agent-kit policy check --path <p>    is writing this path allowed?
  agent-kit runtimes                   list runtime adapters

Init options:
  --name <name>           Project name written into AGENTS.md
  --description <text>    One-line project description
  --mode <mode>           greenfield | existing   (default: auto-detected)
  --runtime <runtime>     t3 (default, recommended) | orca (legacy)
  --tracker <tracker>     local (default) | linear
  --linear-team <KEY>     Linear team key (needed only for Linear through the API, e.g. with Orca)
  --force                 Overwrite existing files without asking
  -y, --yes               Non-interactive; skip files that already exist
  --dry-run               Show what would be written, write nothing
  -h, --help              Show this help
  -v, --version           Show version

Writes AGENTS.md, CLAUDE.md, docs/agents/worker.md, .claude/{commands,rules,templates,settings.json}
and .agent-kit/ (config, autonomy policy, runtime guide, approval hook). Worker models are chosen
in the first Claude session (/configurar-worker). Existing files are never overwritten without
--force or a confirmation.
`;

const SUBCOMMANDS = {
  wf: runWorkflowCommand,
  validate: runValidate,
  policy: runPolicy,
  runtimes: runRuntimes,
};

async function main() {
  const argv = process.argv.slice(2);
  const sub = SUBCOMMANDS[argv[0]];
  if (sub) return sub(argv.slice(1));

  const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  if (values.help) return void console.log(HELP.trim());
  if (values.version) return void console.log(await readVersion());

  if (positionals[0] && positionals[0] !== "init") {
    console.error(`Unknown command: ${positionals[0]}\n${HELP.trim()}`);
    return 1;
  }
  const targetDir = resolve(positionals[1] || process.cwd());
  await runInit(targetDir, values);
  return 0;
}

async function readVersion() {
  const pkg = JSON.parse(await readFile(PACKAGE_JSON, "utf8"));
  return pkg.version;
}

async function runInit(targetDir, flags) {
  const detected = await detectProject(targetDir);
  const mode = resolveMode(flags.mode, detected.mode);
  const choices = normalizeInitChoices(flags);
  const interactive = !flags.yes && process.stdin.isTTY;

  console.log(`Target:  ${targetDir}`);
  console.log(`Mode:    ${mode}${flags.mode ? " (forced)" : " (detected)"}`);
  if (detected.manifest) console.log(`Stack:   ${detected.stack} (${detected.manifest})`);
  console.log(`Runtime: ${choices.runtime}${choices.runtime === "orca" ? " (legacy)" : ""}`);
  console.log(`Tracker: ${choices.tracker}${choices.linearTeam ? ` (team ${choices.linearTeam})` : ""}`);
  console.log("");

  const answers = await collectAnswers({ detected, flags, interactive });
  const vars = buildVars(detected, answers, choices);
  const files = [
    ...(await planFiles(TEMPLATES_DIR, { runtime: choices.runtime })),
    ...(await generatedFiles({ detected, answers, choices })),
  ];
  const resolveConflict = makeConflictResolver(flags, interactive);
  const results = await installFiles({
    files,
    targetDir,
    mode,
    vars,
    flags: [`runtime-${choices.runtime}`, `tracker-${choices.tracker}`],
    resolveConflict,
    dryRun: flags["dry-run"],
  });

  report(results, flags["dry-run"], mode, choices);
}

function resolveMode(requested, detected) {
  if (!requested) return detected;
  if (requested === "greenfield" || requested === "existing") return requested;
  throw new Error(`Invalid --mode: ${requested}. Use "greenfield" or "existing".`);
}

async function collectAnswers({ detected, flags, interactive }) {
  const fallbackName = flags.name || detected.name;
  const fallbackDescription = flags.description || detected.description;
  if (!interactive || (flags.name && flags.description)) {
    return { name: fallbackName, description: fallbackDescription };
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const name = flags.name || (await ask(rl, "Project name", fallbackName));
    const description =
      flags.description ||
      (await ask(rl, "One-line description", fallbackDescription || "TBD"));
    console.log("");
    return { name, description };
  } finally {
    rl.close();
  }
}

async function ask(rl, label, fallback) {
  const answer = await rl.question(`${label} [${fallback}]: `);
  return answer.trim() || fallback;
}

function buildVars(detected, answers, choices) {
  const commands = detected.commands;
  return {
    PROJECT_NAME: answers.name,
    PROJECT_DESCRIPTION: answers.description || "TBD",
    STACK_MANIFEST: detected.manifest || "none",
    CMD_INSTALL: commands.install,
    CMD_BUILD: commands.build,
    CMD_TEST: commands.test,
    CMD_LINT: commands.lint,
    CMD_TYPECHECK: commands.typecheck,
    CMD_TEST_ONE: commands.testOne,
    RUNTIME: choices.runtime,
  };
}

function makeConflictResolver(flags, interactive) {
  if (flags.force) return async () => "overwrite";
  if (!interactive) return async () => "skip";
  return async (target) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await rl.question(
        `${target} already exists. [s]kip, [o]verwrite, [b]oth? [s]: `
      );
      return decodeChoice(answer.trim().toLowerCase());
    } finally {
      rl.close();
    }
  };
}

function decodeChoice(answer) {
  if (answer === "o") return "overwrite";
  if (answer === "b") return "keep-both";
  return "skip";
}

function report(results, dryRun, mode, choices) {
  const counts = results.reduce((acc, result) => {
    acc[result.action] = (acc[result.action] || 0) + 1;
    return acc;
  }, {});
  for (const result of results) {
    console.log(`  ${result.action.padEnd(18)} ${result.target}`);
  }
  console.log("");
  console.log(dryRun ? "Dry run — nothing was written." : summarize(counts));
  if (!dryRun) printNextSteps(mode, choices);
}

function summarize(counts) {
  const parts = Object.entries(counts).map(([action, count]) => `${count} ${action}`);
  return parts.join(", ");
}

function printNextSteps(mode, choices) {
  const steps = [
    "Open Claude Code here and run /configurar-worker to choose the worker models per profile.",
    "Read AGENTS.md and fill in anything marked TBD.",
    mode === "existing"
      ? "Verify the commands table in AGENTS.md and the checks in .agent-kit/config.json actually run."
      : "Decide the stack, then update AGENTS.md, the checks in .agent-kit/config.json and .claude/rules/README.md.",
    "Review .agent-kit/autonomy.json (limits, permissions, protected actions).",
  ];
  if (choices.tracker === "linear" && choices.runtime === "t3") {
    steps.push("Connect this project to Linear in T3 Code (Linear is reached through T3's issue tools; no API key needed).");
  } else if (choices.tracker === "linear") {
    steps.push("Export LINEAR_API_KEY (a Linear personal API key) before running workflows.");
  }
  steps.push("Start a full run with /executar-workflow <objective>.");
  console.log("");
  console.log("Next steps:");
  steps.forEach((step, index) => console.log(`  ${index + 1}. ${step}`));
}

main()
  .then((code) => {
    if (typeof code === "number") process.exitCode = code;
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
