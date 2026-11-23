export const REPORT_FENCE = "agent-kit-report";
export const OUTCOMES = ["succeeded", "failed", "blocked"];

const BLOCK = new RegExp("```" + REPORT_FENCE + "\\s*\\n([\\s\\S]*?)\\n```", "g");

export function reportExample() {
  return [
    "```" + REPORT_FENCE,
    JSON.stringify(
      {
        outcome: "succeeded",
        summary: "What was done, in two or three sentences",
        filesChanged: ["path/a", "path/b"],
        checks: [{ command: "the exact command", exitCode: 0, observed: "last relevant output lines" }],
        blockers: [],
        notes: "Anything partial or skipped, and why",
      },
      null,
      2
    ),
    "```",
  ].join("\n");
}

export function parseReport(text) {
  const blocks = [...String(text || "").matchAll(BLOCK)];
  if (blocks.length === 0) {
    return { valid: false, errors: [`no \`\`\`${REPORT_FENCE} block found`], report: null };
  }
  let data;
  try {
    data = JSON.parse(blocks[blocks.length - 1][1]);
  } catch (error) {
    return { valid: false, errors: [`report block is not valid JSON: ${error.message}`], report: null };
  }
  const errors = validateReport(data);
  return { valid: errors.length === 0, errors, report: errors.length === 0 ? normalize(data) : null };
}

function validateReport(data) {
  const errors = [];
  if (!data || typeof data !== "object") return ["report must be a JSON object"];
  if (!OUTCOMES.includes(data.outcome)) errors.push(`outcome must be one of ${OUTCOMES.join(", ")}`);
  if (typeof data.summary !== "string" || !data.summary.trim()) errors.push("summary is required");
  if (data.filesChanged !== undefined && !Array.isArray(data.filesChanged)) errors.push("filesChanged must be an array");
  if (data.checks !== undefined && !Array.isArray(data.checks)) errors.push("checks must be an array");
  if (data.blockers !== undefined && !Array.isArray(data.blockers)) errors.push("blockers must be an array");
  if (data.outcome === "blocked" && !(data.blockers || []).length) errors.push("a blocked report must list blockers");
  return errors;
}

function normalize(data) {
  return {
    outcome: data.outcome,
    summary: data.summary.trim(),
    filesChanged: (data.filesChanged || []).map(String),
    checks: data.checks || [],
    blockers: (data.blockers || []).map(String),
    notes: data.notes ? String(data.notes) : "",
  };
}

export const REVIEW_FENCE = "agent-kit-review";
const REVIEW_BLOCK = new RegExp("```" + REVIEW_FENCE + "\\s*\\n([\\s\\S]*?)\\n```", "g");
const SEVERITIES = ["blocker", "high", "medium", "low"];

export function reviewExample() {
  return [
    "```" + REVIEW_FENCE,
    JSON.stringify(
      {
        verdict: "rejected",
        findings: [{ severity: "high", title: "Short title", detail: "What is wrong, where, and why it matters", file: "path/a:42" }],
        criteria: [{ criterion: "Acceptance criterion text", met: false, evidence: "What you ran or read" }],
        summary: "One or two sentences",
      },
      null,
      2
    ),
    "```",
  ].join("\n");
}

export function parseReview(text) {
  const blocks = [...String(text || "").matchAll(REVIEW_BLOCK)];
  if (blocks.length === 0) return { valid: false, errors: [`no \`\`\`${REVIEW_FENCE} block found`], review: null };
  let data;
  try {
    data = JSON.parse(blocks[blocks.length - 1][1]);
  } catch (error) {
    return { valid: false, errors: [`review block is not valid JSON: ${error.message}`], review: null };
  }
  const errors = [];
  if (!["approved", "rejected"].includes(data?.verdict)) errors.push('verdict must be "approved" or "rejected"');
  if (data?.findings !== undefined && !Array.isArray(data.findings)) errors.push("findings must be an array");
  const findings = (data?.findings || []).map((finding) =>
    typeof finding === "string" ? finding : `${SEVERITIES.includes(finding.severity) ? finding.severity.toUpperCase() : "NOTE"}: ${finding.title || ""}${finding.file ? ` (${finding.file})` : ""}${finding.detail ? ` — ${finding.detail}` : ""}`
  );
  const blocking = (data?.findings || []).filter((finding) => ["blocker", "high"].includes(finding?.severity));
  if (data?.verdict === "approved" && blocking.length) errors.push("an approved review cannot carry blocker or high findings");
  if (data?.verdict === "rejected" && findings.length === 0) errors.push("a rejected review must list findings");
  if (errors.length) return { valid: false, errors, review: null };
  return { valid: true, errors: [], review: { verdict: data.verdict, findings, criteria: data.criteria || [], summary: data.summary || "" } };
}
