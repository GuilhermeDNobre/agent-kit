import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PROTECTED_ACTIONS } from "./policy.js";
import { TASK_STATES } from "./states.js";

export const CONFIG_DIR = ".agent-kit";
export const RUNTIMES = ["t3", "orca"];
export const TRACKERS = ["local", "linear"];
export const ROLES = [
  "pm",
  "architect",
  "implementation",
  "docs",
  "test",
  "debug",
  "research",
  "design",
  "qa",
  "system",
  "uiux",
  "security",
  "product-owner",
  "review",
  "release",
];
export const PROFILE_NAMES = ["coordinator", "fast", "standard", "advanced", "validator"];
const COORDINATOR = "coordinator";

export function defaultConfig({ runtime = "t3", checks = [] } = {}) {
  return {
    version: 1,
    runtime,
    tracker: {
      kind: "local",
      linear: {
        via: runtime === "t3" ? "t3" : "api",
        apiKeyEnv: "LINEAR_API_KEY",
        teamKey: null,
        projectId: null,
        labels: ["agent-kit"],
        stateMap: {
          pending: "unstarted",
          ready: "unstarted",
          running: "started",
          testing: "started",
          review: "started",
          blocked: "started",
          failed: "started",
          completed: "completed",
          cancelled: "canceled",
        },
      },
    },
    checks,
    profiles: {
      fast: workerProfile("Cheap, simple work: docs, boilerplate, mechanical edits"),
      standard: workerProfile("Everyday implementation and tests"),
      advanced: workerProfile("Complex implementation and debugging"),
      validator: workerProfile("Independent validation gates: QA, system, UI/UX, security, product owner"),
      coordinator: {
        provider: COORDINATOR,
        model: null,
        options: {},
        description: "The coordinator session itself (Claude Opus): runs the step, no delegation",
      },
    },
    roles: {
      pm: "coordinator",
      architect: "coordinator",
      implementation: "standard",
      docs: "fast",
      test: "standard",
      debug: "advanced",
      research: "fast",
      design: "standard",
      qa: "validator",
      system: "validator",
      uiux: "validator",
      security: "validator",
      "product-owner": "validator",
      review: "validator",
      release: "coordinator",
    },
    runtimes: {
      t3: { isolation: "shared" },
      orca: { launchCommand: null, readiness: null },
    },
  };
}

function workerProfile(description) {
  return { provider: "antigravity", model: null, options: {}, description };
}

export function defaultAutonomy() {
  return {
    version: 1,
    level: "autonomous",
    maxWorkers: 3,
    maxAttemptsPerTask: 3,
    maxFixCycles: 3,
    taskTimeoutMinutes: 60,
    retry: {
      strategy: "escalate-profile",
      ladder: ["fast", "standard", "advanced"],
    },
    escalation: {
      onBudgetExhausted: "coordinator-takeover",
      askUserFor: [
        "greenfield-stack",
        "product-scope-ambiguity",
        "business-rule-conflict",
        "protected-action",
        "budget-exhausted-after-takeover",
      ],
    },
    permissions: {
      installDevDependencies: true,
      localCommits: false,
      push: false,
      denyWrite: [".env", ".env.*", "**/*.pem", "**/*.key", "**/secrets/**", "**/credentials*.json"],
    },
    protectedActions: {
      decision: "ask",
      allow: [],
      categories: DEFAULT_PROTECTED_ACTIONS,
    },
    completion: {
      requireAllTasks: true,
      requireFinalChecks: true,
      requireIndependentReview: true,
      requireTaskChecks: false,
    },
    recovery: {
      reconcileBeforeRedispatch: true,
      preservePartialResults: true,
    },
  };
}

async function readJson(path) {
  if (!existsSync(path)) return null;
  const text = await readFile(path, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error.message}`);
  }
}

function merge(base, override) {
  if (!isObject(base) || !isObject(override)) return override === undefined ? base : override;
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) result[key] = merge(base[key], value);
  return result;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function defaultWorkflow() {
  return {
    version: 1,
    phases: [
      { id: "spec", role: "pm", commands: ["/criar-prd"], output: "tasks/prd-<slug>/prd.md" },
      { id: "plan", role: "architect", commands: ["/criar-techspec", "/criar-tasks", "/analisar-consistencia"], output: "tasks/prd-<slug>/plan.json" },
      { id: "implement", role: "implementation", commands: ["/executar-task", "/executar-bugfix"] },
      { id: "validate", gates: ["qa", "system", "uiux", "security"] },
      { id: "accept", gates: ["acceptance"] },
      { id: "release", role: "release", commands: ["/executar-release"], requiresApproval: true },
    ],
    gates: [
      { id: "qa", role: "qa", when: "always", focus: "Tests and behaviour: run the task's tests, exercise edge cases and, when there is a UI, the browser flows" },
      { id: "system", role: "system", when: "always", focus: "Consistency with the techspec, architecture, contracts and repository conventions" },
      { id: "uiux", role: "uiux", when: "tag:ui", focus: "UI states, responsiveness, accessibility (WCAG 2.2), consistency with the design system" },
      { id: "security", role: "security", when: "tag:security", focus: "Authentication, authorization, input validation, secrets, PII and LGPD" },
      { id: "acceptance", role: "product-owner", when: "always", after: ["qa", "system", "uiux", "security"], focus: "Every acceptance criterion, one by one, with evidence" },
    ],
  };
}

export async function loadSettings(root) {
  const dir = join(root, CONFIG_DIR);
  const rawConfig = await readJson(join(dir, "config.json"));
  const rawAutonomy = await readJson(join(dir, "autonomy.json"));
  const rawWorkflow = await readJson(join(dir, "workflow.json"));
  const config = merge(defaultConfig({ runtime: rawConfig?.runtime }), rawConfig || {});
  const autonomy = merge(defaultAutonomy(), rawAutonomy || {});
  const workflow = rawWorkflow || defaultWorkflow();
  return {
    config,
    autonomy,
    workflow,
    found: { config: Boolean(rawConfig), autonomy: Boolean(rawAutonomy), workflow: Boolean(rawWorkflow) },
  };
}

export function validateWorkflow(workflow, config) {
  const errors = [];
  const gates = workflow?.gates;
  if (!Array.isArray(gates) || gates.length === 0) return { errors: ["gates must be a non-empty array"], warnings: [] };
  const ids = new Set(gates.map((gate) => gate.id));
  if (ids.size !== gates.length) errors.push("gate ids must be unique");
  for (const gate of gates) {
    if (!gate.id || !gate.role) errors.push("every gate needs an id and a role");
    if (gate.role && !ROLES.includes(gate.role)) errors.push(`gate "${gate.id}" has unknown role "${gate.role}"`);
    if (config && gate.role && !config.roles?.[gate.role]) errors.push(`gate "${gate.id}": role "${gate.role}" has no profile in config.roles`);
    if (!/^(always|tag:[a-z0-9-]+)$/.test(gate.when || "always")) errors.push(`gate "${gate.id}" has invalid when "${gate.when}"`);
    for (const dep of gate.after || []) if (!ids.has(dep)) errors.push(`gate "${gate.id}" runs after unknown gate "${dep}"`);
  }
  return { errors, warnings: [] };
}

export function validateConfig(config) {
  const errors = [];
  const warnings = [];
  if (!RUNTIMES.includes(config.runtime)) errors.push(`runtime must be one of ${RUNTIMES.join(", ")}`);
  if (!TRACKERS.includes(config.tracker?.kind)) errors.push(`tracker.kind must be one of ${TRACKERS.join(", ")}`);
  if (config.tracker?.kind === "linear") validateLinear(config.tracker.linear || {}, errors, config.runtime);
  if (!Array.isArray(config.checks)) errors.push("checks must be an array");
  for (const [index, check] of (config.checks || []).entries()) {
    if (!check?.name || !check?.command) errors.push(`checks[${index}] needs name and command`);
  }
  for (const [name, profile] of Object.entries(config.profiles || {})) {
    if (!profile?.provider) errors.push(`profiles.${name}.provider is required`);
    else if (profile.provider !== COORDINATOR && !profile.model) {
      warnings.push(`profiles.${name}.model is not set — run /configurar-worker before dispatching`);
    }
  }
  for (const [role, profile] of Object.entries(config.roles || {})) {
    if (!config.profiles?.[profile]) errors.push(`roles.${role} points to unknown profile "${profile}"`);
  }
  if (config.runtime === "orca" && !config.runtimes?.orca?.launchCommand) {
    warnings.push("runtimes.orca.launchCommand is not set — run /configurar-worker");
  }
  return { errors, warnings };
}

function validateLinear(linear, errors, runtime) {
  const via = linear.via || "api";
  if (!["api", "t3"].includes(via)) errors.push('tracker.linear.via must be "api" or "t3"');
  if (via === "t3" && runtime !== "t3") errors.push('tracker.linear.via "t3" needs runtime "t3"; use "api" with Orca');
  if (via === "api" && !linear.teamKey) errors.push('tracker.linear.teamKey is required when tracker.linear.via is "api"');
  if (via === "api" && !linear.apiKeyEnv) errors.push("tracker.linear.apiKeyEnv is required");
  for (const state of Object.keys(linear.stateMap || {})) {
    if (!TASK_STATES.includes(state)) errors.push(`tracker.linear.stateMap has unknown task state "${state}"`);
  }
}

export function validateAutonomy(autonomy, config) {
  const errors = [];
  for (const key of ["maxWorkers", "maxAttemptsPerTask", "maxFixCycles", "taskTimeoutMinutes"]) {
    if (!Number.isInteger(autonomy[key]) || autonomy[key] < 1) errors.push(`${key} must be a positive integer`);
  }
  if (!["autonomous", "supervised"].includes(autonomy.level)) {
    errors.push('level must be "autonomous" or "supervised"');
  }
  if (!["escalate-profile", "same-profile"].includes(autonomy.retry?.strategy)) {
    errors.push('retry.strategy must be "escalate-profile" or "same-profile"');
  }
  for (const name of autonomy.retry?.ladder || []) {
    if (config && !config.profiles?.[name]) errors.push(`retry.ladder references unknown profile "${name}"`);
  }
  if (!["coordinator-takeover", "ask-user", "fail"].includes(autonomy.escalation?.onBudgetExhausted)) {
    errors.push('escalation.onBudgetExhausted must be "coordinator-takeover", "ask-user" or "fail"');
  }
  if (!["ask", "deny"].includes(autonomy.protectedActions?.decision)) {
    errors.push('protectedActions.decision must be "ask" or "deny"');
  }
  for (const category of autonomy.protectedActions?.categories || []) {
    for (const pattern of category.patterns || []) {
      try {
        new RegExp(pattern, "i");
      } catch {
        errors.push(`protectedActions category "${category.id}" has an invalid pattern: ${pattern}`);
      }
    }
  }
  return { errors, warnings: [] };
}

export function validatePlan(plan) {
  const errors = [];
  if (!plan || !Array.isArray(plan.tasks) || plan.tasks.length === 0) {
    return ["plan.tasks must be a non-empty array"];
  }
  for (const [index, task] of plan.tasks.entries()) {
    const label = task?.id ? `task "${task.id}"` : `tasks[${index}]`;
    if (!task?.id || typeof task.id !== "string") errors.push(`${label} needs a string id`);
    if (!task?.title) errors.push(`${label} needs a title`);
    if (task?.role && !ROLES.includes(task.role)) errors.push(`${label} has unknown role "${task.role}"`);
    if (!Array.isArray(task?.files) || task.files.length === 0) {
      errors.push(`${label} must list the files it owns (files)`);
    }
    if (!Array.isArray(task?.acceptance) || task.acceptance.length === 0) {
      errors.push(`${label} needs at least one acceptance criterion`);
    }
    for (const field of ["dependsOn", "validation", "context", "tags"]) {
      if (task?.[field] !== undefined && !Array.isArray(task[field])) errors.push(`${label}.${field} must be an array`);
    }
  }
  return errors;
}

export function profileForTask(task, config, override) {
  const name = override || task.profile || config.roles?.[task.role || "implementation"] || "standard";
  const profile = config.profiles?.[name];
  if (!profile) throw new Error(`Unknown profile "${name}" for task ${task.id}`);
  return { name, ...profile };
}

export function executorId(profile) {
  if (profile.provider === COORDINATOR) return COORDINATOR;
  return `${profile.provider}:${profile.model || "unset"}`;
}

export function isCoordinatorProfile(profile) {
  return profile.provider === COORDINATOR;
}
