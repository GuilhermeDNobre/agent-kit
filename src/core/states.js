export const TASK_STATES = Object.freeze([
  "pending",
  "ready",
  "running",
  "testing",
  "review",
  "blocked",
  "failed",
  "completed",
  "cancelled",
]);

export const WORKFLOW_STATES = Object.freeze([
  "planning",
  "running",
  "blocked",
  "failed",
  "completed",
  "cancelled",
]);

const TASK_TRANSITIONS = {
  pending: ["ready", "blocked", "cancelled"],
  ready: ["running", "pending", "blocked", "cancelled"],
  running: ["testing", "ready", "failed", "blocked", "cancelled"],
  testing: ["review", "ready", "failed", "blocked", "cancelled"],
  review: ["completed", "ready", "failed", "blocked", "cancelled"],
  blocked: ["pending", "ready", "failed", "cancelled"],
  failed: ["pending", "ready", "cancelled"],
  completed: [],
  cancelled: [],
};

const WORKFLOW_TRANSITIONS = {
  planning: ["running", "cancelled"],
  running: ["blocked", "failed", "completed", "cancelled", "planning"],
  blocked: ["running", "planning", "failed", "cancelled"],
  failed: ["planning", "cancelled"],
  completed: [],
  cancelled: [],
};

export const TERMINAL_TASK_STATES = Object.freeze(["completed", "cancelled"]);
export const ACTIVE_TASK_STATES = Object.freeze(["running", "testing", "review"]);

export function canTransitionTask(from, to) {
  return (TASK_TRANSITIONS[from] || []).includes(to);
}

export function canTransitionWorkflow(from, to) {
  return (WORKFLOW_TRANSITIONS[from] || []).includes(to);
}

export class TransitionError extends Error {
  constructor(scope, id, from, to) {
    super(`Invalid ${scope} transition for ${id}: ${from} -> ${to}`);
    this.name = "TransitionError";
  }
}
