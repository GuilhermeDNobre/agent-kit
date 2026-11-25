// Linear through Orca's own Linear connection (`orca linear …`): no API key in agent-kit. The CLI
// runs the commands itself, so sync is automatic like the API mode. Every issue lives in the
// project's dedicated Linear project; Orca cannot create projects, so a missing project is
// created through the API when a key is available, or reported for the user to create once.
import { spawnSync } from "node:child_process";
import { taskDescription } from "./linear.js";

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

export function createOrcaRunner({ command = process.env.ORCA_CLI_COMMAND || "orca", spawn = spawnSync } = {}) {
  return function orcaJson(args, input) {
    const result = spawn(command, [...args, "--json"], { input, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    if (result.error) throw new Error(`Cannot run "${command}": ${result.error.message}`);
    let payload = null;
    try {
      payload = JSON.parse(result.stdout || "null");
    } catch {
      payload = null;
    }
    if (result.status !== 0 || !payload?.ok) {
      const detail = payload?.error?.message || payload?.error || result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status}`;
      throw new Error(`orca ${args.slice(0, 2).join(" ")} failed: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
    }
    return payload.result;
  };
}

export function pickIssue(result) {
  const issue = result?.issue || result;
  if (!issue?.identifier) throw new Error("orca linear did not return the created issue identifier");
  return { id: issue.id || null, identifier: issue.identifier, key: issue.identifier, url: issue.url || null };
}

export function linearOrcaTracker({ settings, orca, ensureProjectViaApi }) {
  const names = { ...DEFAULT_STATE_NAMES, ...(settings.stateNames || {}) };
  let project = null;

  async function ensureProject() {
    if (project) return project;
    const name = settings.project?.name;
    if (!name) throw new Error("tracker.linear.project.name is not set; run /configurar-worker");
    const found = (orca(["linear", "project", "list", "--query", name, "--limit", "50"]).projects || []).find((item) => item.name === name);
    if (found) return (project = { id: found.id, name: found.name, url: found.url || null });
    if (ensureProjectViaApi) return (project = await ensureProjectViaApi());
    throw new Error(`Linear project "${name}" does not exist. Create it in Linear (team ${settings.teamKey}) or export ${settings.apiKeyEnv || "LINEAR_API_KEY"} so agent-kit creates it, then run agent-kit wf sync`);
  }

  function create({ title, body, parent }) {
    const args = ["linear", "create", "--title", title, "--team", settings.teamKey, "--project", project.id || project.name, "--body-file", "-"];
    for (const label of settings.labels || []) args.push("--label", label);
    if (parent) args.push("--parent", parent);
    return pickIssue(orca(args, body));
  }

  return {
    kind: "linear",
    via: "orca",

    async publishPlan(run) {
      if (!settings.teamKey) throw new Error("tracker.linear.teamKey is required");
      await ensureProject();
      if (!run.tracker?.parent) {
        const parent = create({ title: `[${run.id}] ${run.objective || "agent-kit run"}`, body: parentBody(run) });
        run.tracker = { kind: "linear", via: "orca", teamKey: settings.teamKey, project, parent };
      }
      const created = [];
      for (const id of run.order) {
        const task = run.tasks[id];
        if (task.tracker?.identifier) continue;
        task.tracker = create({ title: `${task.id} ${task.title}`, body: taskDescription(run, task), parent: run.tracker.parent.identifier });
        created.push(task.id);
      }
      for (const id of created) {
        for (const dep of run.tasks[id].dependsOn) {
          const blocker = run.tasks[dep]?.tracker?.identifier;
          if (blocker) orca(["linear", "relation", "add", blocker, "--related", run.tasks[id].tracker.identifier, "--type", "blocks"]);
        }
      }
      return { created, parent: run.tracker.parent, project };
    },

    async sync(run) {
      if (!run.tracker?.parent) return { synced: 0, pending: run.events.filter((event) => !event.synced).length, skipped: "plan not published" };
      let synced = 0;
      for (const event of run.events.filter((item) => !item.synced)) {
        const key = event.scope === "workflow" ? run.tracker.parent.identifier : run.tasks[event.id]?.tracker?.identifier;
        if (key) {
          const state = event.scope === "task" || (event.scope === "workflow" && ["completed", "cancelled"].includes(event.to)) ? names[event.to] : null;
          if (state) orca(["linear", "status", "set", key, "--to", state]);
          orca(["linear", "comment", "add", key, "--body-file", "-"], comment(event));
        }
        event.synced = true;
        synced += 1;
      }
      return { synced, pending: 0 };
    },

    async importPlan() {
      throw new Error('Importing a plan needs tracker.linear.via "api" (an API key); with Orca, resume from .agent-kit/runs/<run>/');
    },

    ensureProject,
  };
}

function parentBody(run) {
  return [
    `Workflow \`${run.id}\` gerenciado pelo agent-kit.`,
    "",
    "As sub-issues são as tarefas; relações *blocks* são as dependências.",
    "",
    ...run.order.map((id) => `- ${id} ${run.tasks[id].title}`),
  ].join("\n");
}

function comment(event) {
  if (event.scope === "workflow") return `agent-kit · workflow: ${event.from || "—"} → ${event.to}${event.reason ? ` — ${event.reason}` : ""}`;
  if (event.scope === "attempt") return `agent-kit · ${event.reason}`;
  return `agent-kit · ${event.from || "—"} → ${event.to}${event.reason ? ` — ${event.reason}` : ""}`;
}
