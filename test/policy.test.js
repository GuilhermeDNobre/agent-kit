import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCommand, classifyWrite, matchesAny } from "../src/core/policy.js";
import { defaultAutonomy } from "../src/core/config.js";

const autonomy = defaultAutonomy();
const decision = (command, policy = autonomy) => classifyCommand(command, policy);

test("ordinary development commands run without approval", () => {
  for (const command of ["npm test", "npm run build", "npm install -D vitest", "git status", "git diff", "node --test", "rm -rf node_modules", "rm -rf dist/", "eslint ."]) {
    assert.equal(decision(command).decision, "allow", command);
  }
});

test("each protected category is caught", () => {
  const cases = {
    "vercel deploy --prod": "production-deploy",
    "flyctl deploy": "production-deploy",
    "terraform apply -auto-approve": "production-infra",
    "kubectl delete pod api": "production-infra",
    "psql -c 'DROP TABLE users'": "data-destruction",
    "npx prisma migrate reset --force": "data-destruction",
    "rm -rf /": "data-destruction",
    "rm -rf ~": "data-destruction",
    "git push --force origin main": "external-destructive",
    "gh repo delete me/x --yes": "external-destructive",
    "aws s3 rm s3://bucket --recursive": "external-destructive",
    "npm publish": "package-publish",
    "gh release create v1.0.0": "package-publish",
    "stripe refunds create --charge ch_1": "financial",
    "cat .env": "credential-exposure",
    "cat config/.env.production": "credential-exposure",
    "printenv": "credential-exposure",
    "echo $GITHUB_TOKEN": "credential-exposure",
  };
  for (const [command, category] of Object.entries(cases)) {
    const verdict = decision(command);
    assert.equal(verdict.decision, "ask", command);
    assert.equal(verdict.category, category, command);
  }
});

test("push and local commits follow the permissions", () => {
  assert.equal(decision("git push origin feat/x").category, "git-push");
  assert.equal(decision("git commit -m 'feat: x'").category, "git-commit");
  const open = { ...autonomy, permissions: { ...autonomy.permissions, push: true, localCommits: true } };
  assert.equal(decision("git push origin feat/x", open).decision, "allow");
  assert.equal(decision("git commit -m 'feat: x'", open).decision, "allow");
  assert.equal(decision("git push --force origin main", open).decision, "ask");
});

test("the configured decision and allow list are honoured", () => {
  const deny = { ...autonomy, protectedActions: { ...autonomy.protectedActions, decision: "deny" } };
  assert.equal(decision("npm publish", deny).decision, "deny");
  const allowPublish = { ...autonomy, protectedActions: { ...autonomy.protectedActions, allow: ["package-publish"] } };
  assert.equal(decision("npm publish", allowPublish).decision, "allow");
});

test("without an autonomy file the defaults still protect", () => {
  assert.equal(classifyCommand("npm publish", {}).decision, "ask");
  assert.equal(classifyCommand("git push", {}).category, "git-push");
});

test("writes to protected paths need approval", () => {
  assert.equal(classifyWrite(".env", autonomy).decision, "ask");
  assert.equal(classifyWrite(".env.local", autonomy).decision, "ask");
  assert.equal(classifyWrite("certs/server.pem", autonomy).decision, "ask");
  assert.equal(classifyWrite("config\\secrets\\db.json", autonomy).decision, "ask");
  assert.equal(classifyWrite("src/env.ts", autonomy).decision, "allow");
});

test("matchesAny supports ** and * globs", () => {
  assert.equal(matchesAny("a/b/c.key", ["**/*.key"]), true);
  assert.equal(matchesAny("c.key", ["**/*.key"]), true);
  assert.equal(matchesAny("a/b/c.txt", ["**/*.key"]), false);
  assert.equal(matchesAny("src/x.ts", ["src/*.ts"]), true);
  assert.equal(matchesAny("src/a/x.ts", ["src/*.ts"]), false);
});
