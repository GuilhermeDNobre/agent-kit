import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReport, parseReview, reportExample, reviewExample } from "../src/core/report.js";

const fence = (name, body) => "```" + name + "\n" + JSON.stringify(body) + "\n```";

test("parses the last agent-kit-report block of a final message", () => {
  const text = [
    "Some prose.",
    fence("agent-kit-report", { outcome: "failed", summary: "first" }),
    "Retried.",
    fence("agent-kit-report", { outcome: "succeeded", summary: " done ", filesChanged: ["a.js"], checks: [{ command: "npm test", exitCode: 0 }] }),
  ].join("\n\n");
  const parsed = parseReport(text);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.report.outcome, "succeeded");
  assert.equal(parsed.report.summary, "done");
  assert.deepEqual(parsed.report.filesChanged, ["a.js"]);
});

test("rejects a missing block, bad JSON and invalid fields", () => {
  assert.match(parseReport("all good, trust me").errors[0], /no ```agent-kit-report block/);
  assert.match(parseReport("```agent-kit-report\n{oops}\n```").errors[0], /not valid JSON/);
  const parsed = parseReport(fence("agent-kit-report", { outcome: "great", summary: "" }));
  assert.equal(parsed.valid, false);
  assert.ok(parsed.errors.some((error) => /outcome must be one of/.test(error)));
  assert.ok(parsed.errors.some((error) => /summary is required/.test(error)));
});

test("a blocked report must list its blockers", () => {
  assert.equal(parseReport(fence("agent-kit-report", { outcome: "blocked", summary: "stuck" })).valid, false);
  assert.equal(parseReport(fence("agent-kit-report", { outcome: "blocked", summary: "stuck", blockers: ["need API key"] })).valid, true);
});

test("the examples shown to agents parse", () => {
  assert.equal(parseReport(reportExample()).valid, true);
  assert.equal(parseReview(reviewExample()).valid, true);
});

test("parses a review and flattens structured findings", () => {
  const parsed = parseReview(fence("agent-kit-review", { verdict: "rejected", findings: [{ severity: "high", title: "No auth", file: "api.ts:3", detail: "open route" }] }));
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.review.findings, ["HIGH: No auth (api.ts:3) — open route"]);
});

test("an approval cannot hide blocking findings and a rejection needs findings", () => {
  assert.match(parseReview(fence("agent-kit-review", { verdict: "approved", findings: [{ severity: "blocker", title: "x" }] })).errors[0], /cannot carry blocker or high/);
  assert.match(parseReview(fence("agent-kit-review", { verdict: "rejected", findings: [] })).errors[0], /must list findings/);
  assert.equal(parseReview(fence("agent-kit-review", { verdict: "approved", findings: [{ severity: "low", title: "nit" }] })).valid, true);
});
