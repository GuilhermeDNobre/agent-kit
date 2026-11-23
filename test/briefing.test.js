import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBrief, buildGateBrief, hashBrief, readContextFiles } from "../src/core/briefing.js";
import * as engine from "../src/core/engine.js";
import { defaultAutonomy, defaultConfig } from "../src/core/config.js";

const T0 = "2026-11-23T10:00:00.000Z";

function setup() {
  const config = { ...defaultConfig(), project: { name: "shop", description: "online shop", stack: "Node.js" }, checks: [{ name: "test", command: "npm test" }] };
  const run = engine.createRun({
    id: "r1",
    runtime: "t3",
    now: T0,
    plan: {
      objective: "Authentication",
      tasks: [
        { id: "1.0", title: "Users", files: ["src/users/**"], acceptance: ["hash passwords"], validation: ["npm test -- users"] },
        { id: "2.0", title: "Login", dependsOn: ["1.0"], files: ["src/login/**"], acceptance: ["login works", "lockout after 5 tries"], context: ["docs/contract.md"] },
        { id: "3.0", title: "Docs", files: ["docs/auth.md"], acceptance: ["documented"] },
      ],
    },
  });
  return { run, config, autonomy: defaultAutonomy() };
}

test("the brief is self-contained: objective, project, scope, criteria, validation, prohibitions and protocol", () => {
  const { run, config, autonomy } = setup();
  const brief = buildBrief({ run, task: run.tasks["1.0"], attemptNumber: 1, config, autonomy, completionNote: "RUNTIME NOTE" });
  for (const expected of [
    "# Brief — r1 / 1.0: Users (tentativa 1)",
    "não existe conversa anterior",
    "Objetivo do workflow: Authentication",
    "Projeto: shop — online shop",
    "Stack: Node.js",
    "test: `npm test`",
    "`src/users/**`",
    "1. hash passwords",
    "1. `npm test -- users`",
    "Commit, stage, push",
    "(`package-publish`)",
    "```agent-kit-report",
    "RUNTIME NOTE",
  ]) {
    assert.ok(brief.includes(expected), `missing: ${expected}`);
  }
});

test("files owned by active tasks and protected paths are listed as forbidden", () => {
  const { run, config, autonomy } = setup();
  engine.startAttempt(run, "3.0", { profile: "fast", executor: "w", runtime: "t3", briefPath: "b", briefHash: "h", now: T0 });
  const brief = buildBrief({ run, task: run.tasks["1.0"], attemptNumber: 1, config, autonomy });
  assert.ok(brief.includes("`docs/auth.md (tarefa 3.0)` — em uso por outro worker"));
  assert.ok(brief.includes("`.env` — protegido"));
});

test("dependency results and context files are inlined; missing ones are flagged", () => {
  const { run, config, autonomy } = setup();
  run.tasks["1.0"].state = "completed";
  run.tasks["1.0"].attempts.push({ report: { summary: "users table and repo", filesChanged: ["src/users/repo.ts"] } });
  const brief = buildBrief({
    run,
    task: run.tasks["2.0"],
    attemptNumber: 1,
    config,
    autonomy,
    contextFiles: [{ path: "docs/contract.md", text: "POST /login -> 200 { token }" }, { path: "docs/gone.md", missing: true }],
  });
  assert.ok(brief.includes("**1.0 — Users** (completed). users table and repo Arquivos: `src/users/repo.ts`."));
  assert.ok(brief.includes("POST /login -> 200 { token }"));
  assert.ok(brief.includes("não encontrado no checkout"));
  assert.ok(brief.includes("2. lockout after 5 tries"));
});

test("a fix attempt carries the failure and the findings", () => {
  const { run, config, autonomy } = setup();
  run.tasks["1.0"].fix = { kind: "review", details: "gate qa rejected the work", findings: ["[qa] crash on empty"], fromAttempt: 1 };
  const brief = buildBrief({ run, task: run.tasks["1.0"], attemptNumber: 2, config, autonomy });
  assert.ok(brief.includes("## CORREÇÃO"));
  assert.ok(brief.includes("o review reprovou (tentativa 1)"));
  assert.ok(brief.includes("- [qa] crash on empty"));
});

test("briefs are reproducible: same input, same text and hash", () => {
  const { run, config, autonomy } = setup();
  const a = buildBrief({ run, task: run.tasks["1.0"], attemptNumber: 1, config, autonomy });
  const b = buildBrief({ run, task: run.tasks["1.0"], attemptNumber: 1, config, autonomy });
  assert.equal(a, b);
  assert.equal(hashBrief(a), hashBrief(b));
  assert.match(hashBrief(a), /^[0-9a-f]{64}$/);
});

test("readContextFiles inlines small files and refuses large or missing ones", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-kit-ctx-"));
  await mkdir(join(root, "docs"));
  await writeFile(join(root, "docs", "small.md"), "hello");
  await writeFile(join(root, "docs", "big.md"), "x".repeat(30000));
  const files = await readContextFiles(root, ["docs/small.md", "docs/big.md", "docs/none.md"]);
  assert.deepEqual(files[0], { path: "docs/small.md", text: "hello" });
  assert.equal(files[1].tooLarge, true);
  assert.equal(files[2].missing, true);
});

test("a gate brief is read-only, focused and asks for the review block", () => {
  const { run, config } = setup();
  const task = run.tasks["1.0"];
  const attempt = { number: 1, report: { summary: "done", filesChanged: ["src/users/a.ts"] }, checks: { results: [{ name: "npm test", passed: true }] } };
  const brief = buildGateBrief({ run, task, attempt, gate: { role: "security" }, gateConfig: { id: "security", focus: "Auth and PII" }, config, completionNote: "Final message carries the agent-kit-report block." });
  assert.ok(brief.includes("**Não altere nenhum arquivo**"));
  assert.ok(brief.includes("Auth and PII"));
  assert.ok(brief.includes("LGPD"));
  assert.ok(brief.includes("git diff -- src/users/a.ts"));
  assert.ok(brief.includes("se não houver git"));
  assert.ok(brief.includes("```agent-kit-review"));
  assert.ok(brief.includes("Final message carries the agent-kit-review block."));
});
