import { createLinearClient, ensureLinearProject, linearTracker } from "./linear.js";
import { linearT3Tracker } from "./linear-t3.js";
import { createOrcaRunner, linearOrcaTracker } from "./linear-orca.js";

const localTracker = {
  kind: "local",
  async publishPlan() {
    return { created: [], parent: null };
  },
  async sync(run) {
    let synced = 0;
    for (const event of run.events) {
      if (!event.synced) {
        event.synced = true;
        synced += 1;
      }
    }
    return { synced, pending: 0 };
  },
  async importPlan() {
    throw new Error("The local tracker cannot import plans; use --plan <file>");
  },
};

async function apiProject(settings, gql) {
  const data = await gql("query Team($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id key } } }", { key: settings.teamKey });
  const team = data.teams.nodes[0];
  if (!team) throw new Error(`Linear team with key "${settings.teamKey}" not found`);
  return ensureLinearProject({ settings, gql, teamId: team.id, teamKey: team.key });
}

export function createTracker(config, { env = process.env, fetchImpl, orcaRunner } = {}) {
  const kind = config.tracker?.kind || "local";
  if (kind === "local") return localTracker;
  if (kind === "linear") {
    const settings = config.tracker.linear || {};
    if (settings.via === "t3") return linearT3Tracker({ settings });
    if (settings.via === "orca") {
      const apiKey = env[settings.apiKeyEnv || "LINEAR_API_KEY"];
      const ensureProjectViaApi = apiKey ? () => apiProject(settings, createLinearClient({ apiKey, fetchImpl })) : null;
      return linearOrcaTracker({ settings, orca: orcaRunner || createOrcaRunner(), ensureProjectViaApi });
    }
    const gql = createLinearClient({ apiKey: env[settings.apiKeyEnv || "LINEAR_API_KEY"], fetchImpl });
    return linearTracker({ settings, gql });
  }
  throw new Error(`Unknown tracker "${kind}"`);
}
