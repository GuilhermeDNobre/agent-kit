import { test } from "node:test";
import assert from "node:assert/strict";
import { executionWaves, filesConflict, patternsOverlap, selectDispatchable, validateGraph } from "../src/core/dag.js";

const task = (id, dependsOn = [], files = [`src/${id}/**`]) => ({ id, dependsOn, files });

test("validateGraph accepts a DAG and reports unknown and self dependencies", () => {
  assert.deepEqual(validateGraph([task("a"), task("b", ["a"])]), []);
  assert.match(validateGraph([task("a", ["ghost"])])[0], /unknown task "ghost"/);
  assert.ok(validateGraph([task("a", ["a"])]).some((error) => /depends on itself/.test(error)));
  assert.match(validateGraph([task("a"), task("a")])[0], /duplicate task id/);
});

test("validateGraph reports a dependency cycle with its path", () => {
  const errors = validateGraph([task("a", ["c"]), task("b", ["a"]), task("c", ["b"])]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /dependency cycle: a -> c -> b -> a/);
});

test("executionWaves orders tasks so every dependency runs in an earlier wave", () => {
  const waves = executionWaves([task("api"), task("ui", ["api"]), task("docs"), task("e2e", ["ui", "api"])]);
  assert.deepEqual(waves, [["api", "docs"], ["ui"], ["e2e"]]);
});

test("patternsOverlap is conservative for globs and exact for plain files", () => {
  assert.equal(patternsOverlap("src/auth/**", "src/auth/login.ts"), true);
  assert.equal(patternsOverlap("src/auth/login.ts", "src/auth/**"), true);
  assert.equal(patternsOverlap("src/**/*.ts", "src/users/model.ts"), true);
  assert.equal(patternsOverlap("src/auth/**", "src/users/**"), false);
  assert.equal(patternsOverlap("src/a.ts", "src/b.ts"), false);
  assert.equal(patternsOverlap("./src/a.ts", "src\\a.ts"), true);
  assert.equal(patternsOverlap("src/auth", "src/authz/x.ts"), false);
});

test("filesConflict compares every pair of patterns", () => {
  assert.equal(filesConflict(["docs/a.md", "src/x/**"], ["src/x/y.ts"]), true);
  assert.equal(filesConflict(["docs/a.md"], ["docs/b.md"]), false);
});

test("selectDispatchable respects the free slots", () => {
  const ready = [task("a"), task("b"), task("c")];
  assert.deepEqual(selectDispatchable(ready, [], 2).map((item) => item.id), ["a", "b"]);
  assert.deepEqual(selectDispatchable(ready, [], 0), []);
});

test("selectDispatchable never pairs tasks that share files, with holders or with each other", () => {
  const ready = [task("a", [], ["src/shared/**"]), task("b", [], ["src/shared/x.ts"]), task("c", [], ["docs/c.md"])];
  assert.deepEqual(selectDispatchable(ready, [], 3).map((item) => item.id), ["a", "c"]);
  const holder = task("h", [], ["docs/**"]);
  assert.deepEqual(selectDispatchable(ready, [holder], 3).map((item) => item.id), ["a"]);
});

test("a task without declared files runs alone", () => {
  const ready = [task("a", [], []), task("b")];
  assert.deepEqual(selectDispatchable(ready, [], 3).map((item) => item.id), ["a"]);
  assert.deepEqual(selectDispatchable([task("b")], [task("x", [], [])], 3), []);
});
