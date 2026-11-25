// Linear through T3 Code's issue tools (create_issue, set_issue_state, comment_on_issue).
// No API key: like the runtime adapters, it prints the calls; the coordinator makes them, then
// binds the returned issue keys (`wf tracker-bind`) and acknowledges events (`wf sync --ack`).
import { taskDescription } from "./linear.js";

export const PARENT = "_parent";

const DEFAULT_STATE_NAMES = {
  pending: "Todo",
  ready: "Todo",
  running: "In Progress",
  testing: "In Progress",
  review: "In Progress",
  blocked: "In Progress",
  failed: "In Progress",
  completed: "Done",
  cancelled: "Canceled",
};

export function linearT3Tracker({ settings }) {
  const names = { ...DEFAULT_STATE_NAMES, ...(settings.stateNames || {}) };
  const labels = settings.labels?.length ? { labels: settings.labels } : {};
  const project = settings.project?.name ? { project: settings.project.name } : {};

  function createOperations(run) {
    const operations = [];
    if (!run.tracker?.parent) {
      operations.push({
        bind: PARENT,
        tool: "create_issue",
        args: { title: `[${run.id}] ${run.objective || "agent-kit run"}`, body: parentBody(run), ...project, ...labels },
        then: `agent-kit wf tracker-bind ${run.id} ${PARENT} --key <key> --url <url>`,
      });
      return operations;
    }
    for (const id of run.order) {
      const task = run.tasks[id];
      if (task.tracker?.key) continue;
      operations.push({
        bind: id,
        tool: "create_issue",
        args: { title: `[${run.id}] ${task.id} ${task.title}`, body: taskBody(run, task), ...project, ...labels },
        then: `agent-kit wf tracker-bind ${run.id} ${task.id} --key <key> --url <url>`,
      });
    }
    return operations;
  }

  return {
    kind: "linear",
    via: "t3",
    deferred: true,

    async publishPlan(run) {
      return { deferred: true, operations: createOperations(run) };
    },

    async sync(run) {
      const create = createOperations(run);
      if (create.length) {
        return { deferred: true, operations: create, note: "Create and bind the issues first, then run wf sync again" };
      }
      const pending = run.events.map((event, index) => ({ event, index })).filter(({ event }) => !event.synced);
      const byIssue = new Map();
      for (const { event, index } of pending) {
        const key = event.scope === "workflow" ? run.tracker.parent.key : run.tasks[event.id]?.tracker?.key;
        if (!key) continue;
        const entry = byIssue.get(key) || { key, lines: [], state: null, ids: [] };
        entry.lines.push(line(event));
        if (event.scope === "task") entry.state = names[event.to] || null;
        if (event.scope === "workflow" && ["completed", "cancelled"].includes(event.to)) entry.state = names[event.to];
        entry.ids.push(index);
        byIssue.set(key, entry);
      }
      const operations = [];
      const ack = pending.map(({ index }) => index);
      for (const entry of byIssue.values()) {
        if (entry.state) operations.push({ tool: "set_issue_state", args: { key: entry.key, state: entry.state } });
        operations.push({ tool: "comment_on_issue", args: { key: entry.key, body: entry.lines.join("\n") } });
      }
      return {
        deferred: true,
        operations,
        ack,
        then: ack.length ? `agent-kit wf sync ${run.id} --ack ${ack.join(",")}` : null,
      };
    },

    async importPlan() {
      throw new Error('Importing a plan needs tracker.linear.via "api" (an API key); with T3, resume from .agent-kit/runs/<run>/');
    },
  };
}

export function bindIssue(run, target, { key, url }) {
  if (target === PARENT) {
    run.tracker = { kind: "linear", via: "t3", ...(run.tracker || {}), parent: { key, identifier: key, url } };
    return run.tracker.parent;
  }
  const task = run.tasks[target];
  if (!task) throw new Error(`Unknown task "${target}"`);
  task.tracker = { key, identifier: key, url };
  return task.tracker;
}

export function acknowledge(run, ids) {
  let count = 0;
  for (const id of ids) {
    const event = run.events[id];
    if (event && !event.synced) {
      event.synced = true;
      count += 1;
    }
  }
  return count;
}

function parentBody(run) {
  return [
    `Workflow \`${run.id}\` gerenciado pelo agent-kit.`,
    "",
    "Tarefas:",
    ...run.order.map((id) => `- ${id} ${run.tasks[id].title}`),
  ].join("\n");
}

function taskBody(run, task) {
  const deps = task.dependsOn.map((id) => run.tasks[id]?.tracker?.key || id);
  const header = [
    run.tracker?.parent?.key ? `Parte de ${run.tracker.parent.key}.` : null,
    deps.length ? `Depende de: ${deps.join(", ")}.` : null,
  ].filter(Boolean);
  return [...header, ...(header.length ? [""] : []), taskDescription(run, task)].join("\n");
}

function line(event) {
  const head = event.scope === "workflow" ? "workflow" : event.scope === "attempt" ? "" : `${event.from || "—"} → ${event.to}`;
  return `agent-kit · ${head}${head && event.reason ? " — " : ""}${event.reason || ""}`;
}
