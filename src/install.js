import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { render } from "./render.js";

export async function planFiles(templatesDir) {
  const sources = await listFiles(templatesDir);
  return sources.map((source) => ({
    source,
    target: toTargetPath(relative(templatesDir, source)),
  }));
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = join(dir, entry.name);
      return entry.isDirectory() ? listFiles(full) : Promise.resolve([full]);
    })
  );
  return nested.flat();
}

function toTargetPath(relativePath) {
  const segments = relativePath.split(sep);
  if (segments[0] === "claude") {
    return [".claude", ...segments.slice(1)].join(sep);
  }
  return relativePath;
}

export async function installFiles(options) {
  const { files, targetDir, mode, vars, resolveConflict, dryRun } = options;
  const results = [];
  for (const file of files) {
    results.push(await installOne(file, { targetDir, mode, vars, resolveConflict, dryRun }));
  }
  return results;
}

async function installOne(file, { targetDir, mode, vars, resolveConflict, dryRun }) {
  const absoluteTarget = join(targetDir, file.target);
  const template = await readFile(file.source, "utf8");
  const content = render(template, mode, vars);
  if (!existsSync(absoluteTarget)) {
    await writeIfWanted(absoluteTarget, content, dryRun);
    return { target: file.target, action: "created" };
  }
  const decision = await resolveConflict(file.target);
  if (decision === "skip") {
    return { target: file.target, action: "skipped" };
  }
  if (decision === "keep-both") {
    const alternate = `${absoluteTarget}.new`;
    await writeIfWanted(alternate, content, dryRun);
    return { target: `${file.target}.new`, action: "written-alongside" };
  }
  await writeIfWanted(absoluteTarget, content, dryRun);
  return { target: file.target, action: "overwritten" };
}

async function writeIfWanted(path, content, dryRun) {
  if (dryRun) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}
