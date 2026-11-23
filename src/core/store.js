import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { CONFIG_DIR } from "./config.js";

const RUN_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

export function runsDir(root) {
  return join(root, CONFIG_DIR, "runs");
}

export function runDir(root, runId) {
  assertRunId(runId);
  return join(runsDir(root), runId);
}

export function assertRunId(runId) {
  if (!RUN_ID.test(String(runId || ""))) {
    throw new Error(`Invalid run id "${runId}": use letters, digits, ".", "_" or "-" (max 64)`);
  }
}

export async function writeAtomic(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, content, "utf8");
  await rename(temp, path);
}

export async function saveRun(root, run) {
  await writeAtomic(join(runDir(root, run.id), "run.json"), `${JSON.stringify(run, null, 2)}\n`);
}

export async function loadRun(root, runId) {
  const path = join(runDir(root, runId), "run.json");
  if (!existsSync(path)) throw new Error(`Run "${runId}" not found at ${relative(root, path)}`);
  return JSON.parse(await readFile(path, "utf8"));
}

export function runExists(root, runId) {
  return existsSync(join(runDir(root, runId), "run.json"));
}

export async function listRuns(root) {
  if (!existsSync(runsDir(root))) return [];
  const entries = await readdir(runsDir(root), { withFileTypes: true });
  const runs = [];
  for (const entry of entries.filter((item) => item.isDirectory())) {
    if (!runExists(root, entry.name)) continue;
    const run = await loadRun(root, entry.name);
    runs.push({ id: run.id, state: run.state, objective: run.objective, updatedAt: run.updatedAt });
  }
  return runs.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function saveArtifact(root, runId, name, content) {
  const path = join(runDir(root, runId), name);
  await writeAtomic(path, content);
  return relative(root, path).replace(/\\/g, "/");
}
