import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { render } from "./render.js";

const DOTTED = { claude: ".claude", "agent-kit": ".agent-kit" };
// Every runtime guide is installed: the session that runs /configurar-worker decides the runtime,
// and switching (agent-kit runtime set) only changes which guide CLAUDE.md imports.
export async function planFiles(templatesDir) {
  const sources = await listFiles(templatesDir);
  return sources.map((source) => ({ source, target: toTargetPath(relative(templatesDir, source)) }));
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = join(dir, entry.name);
      return entry.isDirectory() ? listFiles(full) : Promise.resolve([full]);
    })
  );
  return nested.flat().sort();
}

function toTargetPath(relativePath) {
  const segments = relativePath.split(sep);
  if (DOTTED[segments[0]]) return [DOTTED[segments[0]], ...segments.slice(1)].join(sep);
  return relativePath;
}

export async function installFiles(options) {
  const { files, targetDir, mode, vars, flags, resolveConflict, dryRun } = options;
  const results = [];
  for (const file of files) {
    results.push(await installOne(file, { targetDir, mode, vars, flags, resolveConflict, dryRun }));
  }
  return results;
}

async function contentOf(file, mode, vars, flags) {
  if (file.content !== undefined) return file.content;
  return render(await readFile(file.source, "utf8"), mode, vars, flags);
}

async function installOne(file, { targetDir, mode, vars, flags, resolveConflict, dryRun }) {
  const absoluteTarget = join(targetDir, file.target);
  const content = await contentOf(file, mode, vars, flags);
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
