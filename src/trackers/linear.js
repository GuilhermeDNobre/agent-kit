// Linear tracker over the public GraphQL API (verified against linear/linear packages/sdk schema.graphql).
// Personal API keys go in the Authorization header without "Bearer".

export const LINEAR_ENDPOINT = "https://api.linear.app/graphql";
export const TASK_FENCE = "agent-kit-task";
const TASK_BLOCK = new RegExp("```" + TASK_FENCE + "\\s*\\n([\\s\\S]*?)\\n```");
const SPEC_FIELDS = ["role", "profile", "tags", "dependsOn", "files", "doc", "context", "acceptance", "validation"];

export function createLinearClient({ apiKey, fetchImpl = globalThis.fetch, endpoint = LINEAR_ENDPOINT }) {
  if (!apiKey) throw new Error("Linear API key is missing (set the variable named in tracker.linear.apiKeyEnv)");
  return async function gql(query, variables = {}) {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: apiKey },
      body: JSON.stringify({ query, variables }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.errors?.length) {
      const message = payload.errors?.map((error) => error.message).join("; ") || `HTTP ${response.status}`;
      throw new Error(`Linear API error: ${message}`);
    }
    return payload.data;
  };
}

const Q_TEAM = `query Team($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id key name } } }`;
const Q_STATES = `query States($teamId: ID!) { workflowStates(first: 100, filter: { team: { id: { eq: $teamId } } }) { nodes { id name type } } }`;
const M_CREATE = `mutation Create($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }`;
const M_UPDATE = `mutation Update($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`;
const M_RELATION = `mutation Relate($input: IssueRelationCreateInput!) { issueRelationCreate(input: $input) { success } }`;
const M_COMMENT = `mutation Comment($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`;
const Q_LABELS = `query Labels($teamId: ID!) { issueLabels(first: 250, filter: { team: { id: { eq: $teamId } } }) { nodes { id name } } }`;
const Q_PARENT = `query Parent($id: String!) {
  issue(id: $id) {
    id identifier title url
    children(first: 250) { nodes {
      id identifier title description url state { name type }
      inverseRelations(first: 100) { nodes { type issue { identifier } } }
    } }
  }
}`;

export function linearTracker({ settings, gql }) {
  let cache = null;

  async function team() {
    if (cache) return cache;
    const data = await gql(Q_TEAM, { key: settings.teamKey });
    const found = data.teams.nodes[0];
    if (!found) throw new Error(`Linear team with key "${settings.teamKey}" not found`);
    const states = (await gql(Q_STATES, { teamId: found.id })).workflowStates.nodes;
    let labelIds = [];
    if (settings.labels?.length) {
      const labels = (await gql(Q_LABELS, { teamId: found.id })).issueLabels.nodes;
      labelIds = labels.filter((label) => settings.labels.includes(label.name)).map((label) => label.id);
    }
    cache = { ...found, states, labelIds };
    return cache;
  }

  function stateId(states, taskState) {
    const wanted = settings.stateMap?.[taskState];
    if (!wanted) return null;
    const lower = String(wanted).toLowerCase();
    const byName = states.find((state) => state.name.toLowerCase() === lower);
    return (byName || states.find((state) => state.type === lower))?.id || null;
  }

  async function create(input) {
    const result = await gql(M_CREATE, { input });
    if (!result.issueCreate.success) throw new Error(`Linear refused to create "${input.title}"`);
    return result.issueCreate.issue;
  }

  return {
    kind: "linear",

    async publishPlan(run) {
      const info = await team();
      const base = { teamId: info.id, ...(settings.projectId ? { projectId: settings.projectId } : {}), ...(info.labelIds.length ? { labelIds: info.labelIds } : {}) };
      if (!run.tracker?.parent) {
        const parent = await create({ ...base, title: run.objective || `agent-kit run ${run.id}`, description: parentDescription(run) });
        run.tracker = { kind: "linear", teamKey: info.key, parent };
      }
      const created = [];
      for (const id of run.order) {
        const task = run.tasks[id];
        if (task.tracker?.id) continue;
        task.tracker = await create({
          ...base,
          title: `${task.id} ${task.title}`,
          parentId: run.tracker.parent.id,
          description: taskDescription(run, task),
          stateId: stateId(info.states, task.state) || undefined,
        });
        created.push(task.id);
      }
      for (const id of created) {
        for (const dep of run.tasks[id].dependsOn) {
          await gql(M_RELATION, { input: { issueId: run.tasks[dep].tracker.id, relatedIssueId: run.tasks[id].tracker.id, type: "blocks" } });
        }
      }
      return { created, parent: run.tracker.parent };
    },

    async sync(run) {
      if (!run.tracker?.parent) return { synced: 0, pending: run.events.filter((event) => !event.synced).length, skipped: "plan not published" };
      const info = await team();
      let synced = 0;
      for (const event of run.events.filter((item) => !item.synced)) {
        const issueId = event.scope === "workflow" ? run.tracker.parent.id : run.tasks[event.id]?.tracker?.id;
        if (issueId) {
          if (event.scope === "task") {
            const target = stateId(info.states, event.to);
            if (target) await gql(M_UPDATE, { id: issueId, input: { stateId: target } });
          }
          await gql(M_COMMENT, { input: { issueId, body: eventComment(event) } });
        }
        event.synced = true;
        synced += 1;
      }
      return { synced, pending: 0 };
    },

    async importPlan(identifier) {
      const issue = (await gql(Q_PARENT, { id: identifier })).issue;
      const tasks = [];
      const completed = [];
      const skipped = [];
      const byIdentifier = new Map();
      for (const child of issue.children.nodes) {
        const spec = parseTaskBlock(child.description);
        if (!spec) {
          skipped.push(child.identifier);
          continue;
        }
        byIdentifier.set(child.identifier, spec.id);
        tasks.push({ child, spec });
      }
      const plan = {
        objective: issue.title,
        tracker: { kind: "linear", parent: { id: issue.id, identifier: issue.identifier, url: issue.url } },
        tasks: tasks.map(({ child, spec }) => {
          const blockers = child.inverseRelations.nodes
            .filter((relation) => relation.type === "blocks" && byIdentifier.has(relation.issue.identifier))
            .map((relation) => byIdentifier.get(relation.issue.identifier));
          if (child.state?.type === "completed") completed.push(spec.id);
          return {
            ...spec,
            title: spec.title || child.title.replace(new RegExp(`^${escape(spec.id)}\\s+`), ""),
            dependsOn: [...new Set([...(spec.dependsOn || []), ...blockers])],
            tracker: { id: child.id, identifier: child.identifier, url: child.url },
          };
        }),
      };
      return { plan, completed, skipped };
    },
  };
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseTaskBlock(description) {
  const match = TASK_BLOCK.exec(String(description || ""));
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    return data && typeof data.id === "string" ? data : null;
  } catch {
    return null;
  }
}

function parentDescription(run) {
  return [
    `Workflow \`${run.id}\` gerenciado pelo agent-kit.`,
    "",
    "As sub-issues são as tarefas; relações *blocks* são as dependências.",
    "O estado de cada sub-issue é atualizado pelo coordenador a cada transição.",
  ].join("\n");
}

export function taskDescription(run, task) {
  const spec = { id: task.id, title: task.title };
  for (const field of SPEC_FIELDS) if (task[field] !== undefined) spec[field] = task[field];
  return [
    `Tarefa \`${task.id}\` do workflow \`${run.id}\`.`,
    "",
    "**Critérios de aceite**",
    ...task.acceptance.map((item) => `- ${item}`),
    "",
    "**Arquivos**",
    ...task.files.map((file) => `- \`${file}\``),
    "",
    "Bloco lido pelo agent-kit (edite com cuidado — é a especificação da tarefa):",
    "",
    "```" + TASK_FENCE,
    JSON.stringify(spec, null, 2),
    "```",
  ].join("\n");
}

function eventComment(event) {
  if (event.scope === "workflow") return `agent-kit · workflow: ${event.from || "—"} → ${event.to}${event.reason ? ` — ${event.reason}` : ""}`;
  if (event.scope === "attempt") return `agent-kit · ${event.reason}`;
  return `agent-kit · ${event.from || "—"} → ${event.to}${event.reason ? ` — ${event.reason}` : ""}`;
}
