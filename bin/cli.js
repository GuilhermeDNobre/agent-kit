#!/usr/bin/env node
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { detectProject } from "../src/detect.js";
import { planFiles, installFiles } from "../src/install.js";

const TEMPLATES_DIR = fileURLToPath(new URL("../templates/", import.meta.url));
const PACKAGE_JSON = fileURLToPath(new URL("../package.json", import.meta.url));

const OPTIONS = {
  name: { type: "string" },
  description: { type: "string" },
  mode: { type: "string" },
  force: { type: "boolean", default: false },
  yes: { type: "boolean", short: "y", default: false },
  "dry-run": { type: "boolean", default: false },
  help: { type: "boolean", short: "h", default: false },
  version: { type: "boolean", short: "v", default: false },
};

const HELP = `
agent-kit — scaffolds a Claude-as-orchestrator / agy-worker agent workflow.

Usage:
  npx @guilhermednobre/agent-kit init [directory]

Options:
  --name <name>           Project name written into CLAUDE.md and AGENTS.md
  --description <text>    One-line project description
  --mode <mode>           greenfield | existing   (default: auto-detected)
  --force                 Overwrite existing files without asking
  -y, --yes               Non-interactive; skip files that already exist
  --dry-run               Show what would be written, write nothing
  -h, --help              Show this help
  -v, --version           Show version

Writes CLAUDE.md, AGENTS.md and .claude/{commands,rules,templates} into the
target directory. Existing files are never overwritten without --force or a
confirmation.
`;

async function main() {
  const { values, positionals } = parseArgs({
    options: OPTIONS,
    allowPositionals: true,
  });

  if (values.help) return console.log(HELP.trim());
  if (values.version) return console.log(await readVersion());

  const command = positionals[0];
  if (command && command !== "init") {
    console.error(`Unknown command: ${command}\n${HELP.trim()}`);
    process.exitCode = 1;
    return;
  }

  const targetDir = resolve(positionals[1] || process.cwd());
  await runInit(targetDir, values);
}

async function readVersion() {
  const pkg = JSON.parse(await readFile(PACKAGE_JSON, "utf8"));
  return pkg.version;
}

async function runInit(targetDir, flags) {
  const detected = await detectProject(targetDir);
  const mode = resolveMode(flags.mode, detected.mode);
  const interactive = !flags.yes && process.stdin.isTTY;

  console.log(`Target:  ${targetDir}`);
  console.log(`Mode:    ${mode}${flags.mode ? " (forced)" : " (detected)"}`);
  if (detected.manifest) console.log(`Stack:   ${detected.stack} (${detected.manifest})`);
  console.log("");

  const answers = await collectAnswers({ detected, flags, interactive });
  const vars = buildVars(detected, answers);
  const files = await planFiles(TEMPLATES_DIR);
  const resolveConflict = makeConflictResolver(flags, interactive);
  const results = await installFiles({
    files,
    targetDir,
    mode,
    vars,
    resolveConflict,
    dryRun: flags["dry-run"],
  });

  report(results, flags["dry-run"], mode);
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

function buildVars(detected, answers) {
  const commands = detected.commands;
  return {
    PROJECT_NAME: answers.name,
    PROJECT_DESCRIPTION: answers.description || "TBD",
    STACK_MANIFEST: detected.manifest || "none",
    CMD_INSTALL: commands.install,
    CMD_BUILD: commands.build,
    CMD_TEST: commands.test,
    CMD_LINT: commands.lint,
    CMD_TEST_ONE: commands.testOne,
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

function report(results, dryRun, mode) {
  const counts = results.reduce((acc, result) => {
    acc[result.action] = (acc[result.action] || 0) + 1;
    return acc;
  }, {});
  for (const result of results) {
    console.log(`  ${result.action.padEnd(18)} ${result.target}`);
  }
  console.log("");
  console.log(dryRun ? "Dry run — nothing was written." : summarize(counts));
  if (!dryRun) printNextSteps(mode);
}

function summarize(counts) {
  const parts = Object.entries(counts).map(([action, count]) => `${count} ${action}`);
  return parts.join(", ");
}

function printNextSteps(mode) {
  console.log("");
  console.log("Next steps:");
  console.log("  1. Read CLAUDE.md and fill in anything marked TBD.");
  if (mode === "existing") {
    console.log("  2. Verify the commands table in CLAUDE.md actually runs.");
  } else {
    console.log("  2. Decide the stack with your team, then update CLAUDE.md and rules/README.md.");
  }
  console.log("  3. Drop the rule files under .claude/rules that do not match your project.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
