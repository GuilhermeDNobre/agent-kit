import { t3 } from "./t3.js";
import { orca } from "./orca.js";

const REQUIRED = ["name", "completionNote", "validateProfile", "dispatch", "status", "cancel", "interpretStatus"];
const adapters = new Map();

export function registerAdapter(adapter) {
  const missing = REQUIRED.filter((key) => adapter?.[key] === undefined);
  if (missing.length) throw new Error(`Runtime adapter is missing: ${missing.join(", ")}`);
  adapters.set(adapter.name, adapter);
}

export function getAdapter(name) {
  const adapter = adapters.get(name);
  if (!adapter) throw new Error(`Unknown runtime "${name}". Known: ${[...adapters.keys()].join(", ")}`);
  return adapter;
}

export function listAdapters() {
  return [...adapters.values()].map((adapter) => ({ name: adapter.name, description: adapter.description }));
}

registerAdapter(t3);
registerAdapter(orca);
