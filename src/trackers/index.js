import { createLinearClient, linearTracker } from "./linear.js";
import { linearT3Tracker } from "./linear-t3.js";

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

export function createTracker(config, { env = process.env, fetchImpl } = {}) {
  const kind = config.tracker?.kind || "local";
  if (kind === "local") return localTracker;
  if (kind === "linear") {
    const settings = config.tracker.linear || {};
    if (settings.via === "t3") return linearT3Tracker({ settings });
    const gql = createLinearClient({ apiKey: env[settings.apiKeyEnv || "LINEAR_API_KEY"], fetchImpl });
    return linearTracker({ settings, gql });
  }
  throw new Error(`Unknown tracker "${kind}"`);
}
