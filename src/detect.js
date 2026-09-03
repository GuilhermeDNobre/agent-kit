import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";

const UNKNOWN = "TBD";

const MANIFESTS = [
  { file: "package.json", stack: "Node.js" },
  { file: "deno.json", stack: "Deno" },
  { file: "pyproject.toml", stack: "Python" },
  { file: "requirements.txt", stack: "Python" },
  { file: "go.mod", stack: "Go" },
  { file: "Cargo.toml", stack: "Rust" },
  { file: "pom.xml", stack: "Java (Maven)" },
  { file: "build.gradle", stack: "Java (Gradle)" },
  { file: "build.gradle.kts", stack: "Kotlin (Gradle)" },
  { file: "Gemfile", stack: "Ruby" },
  { file: "composer.json", stack: "PHP" },
  { file: "mix.exs", stack: "Elixir" },
  { file: "pubspec.yaml", stack: "Dart / Flutter" },
];

const PACKAGE_MANAGERS = [
  { lockfile: "pnpm-lock.yaml", name: "pnpm", install: "pnpm install" },
  { lockfile: "yarn.lock", name: "yarn", install: "yarn install" },
  { lockfile: "bun.lockb", name: "bun", install: "bun install" },
  { lockfile: "package-lock.json", name: "npm", install: "npm ci" },
];

export async function detectProject(dir) {
  const manifest = MANIFESTS.find((entry) => existsSync(join(dir, entry.file)));
  if (!manifest) {
    return { mode: "greenfield", ...emptyProfile(dir) };
  }
  const profile = await readProfile(dir, manifest);
  return { mode: "existing", manifest: manifest.file, stack: manifest.stack, ...profile };
}

function emptyProfile(dir) {
  return {
    manifest: null,
    stack: null,
    name: basename(dir),
    description: "",
    commands: blankCommands(),
  };
}

function blankCommands() {
  return {
    install: UNKNOWN,
    build: UNKNOWN,
    test: UNKNOWN,
    lint: UNKNOWN,
    testOne: UNKNOWN,
  };
}

async function readProfile(dir, manifest) {
  if (manifest.file !== "package.json") {
    return { name: basename(dir), description: "", commands: blankCommands() };
  }
  const pkg = await readJson(join(dir, "package.json"));
  return {
    name: pkg.name || basename(dir),
    description: pkg.description || "",
    commands: nodeCommands(dir, pkg.scripts || {}),
  };
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return {};
  }
}

function nodeCommands(dir, scripts) {
  const manager = detectPackageManager(dir);
  const runner = manager.name === "npm" ? "npm run" : `${manager.name} run`;
  return {
    install: manager.install,
    build: scripts.build ? `${runner} build` : UNKNOWN,
    test: scripts.test ? `${manager.name} test` : UNKNOWN,
    lint: scripts.lint ? `${runner} lint` : UNKNOWN,
    testOne: UNKNOWN,
  };
}

function detectPackageManager(dir) {
  const found = PACKAGE_MANAGERS.find((entry) => existsSync(join(dir, entry.lockfile)));
  return found || { name: "npm", install: "npm install" };
}
