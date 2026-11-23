const CONDITIONAL_BLOCK = /<!--IF:([a-z0-9=-]+)-->\r?\n?([\s\S]*?)<!--END-->\r?\n?/g;
const PLACEHOLDER = /\{\{([A-Z_]+)\}\}/g;

export function render(text, mode, vars, flags = []) {
  const selected = selectBlocks(text, new Set([mode, ...flags]));
  return fillPlaceholders(selected, vars);
}

function selectBlocks(text, active) {
  return text.replace(CONDITIONAL_BLOCK, (_, condition, body) => (active.has(condition) ? body : ""));
}

function fillPlaceholders(text, vars) {
  return text.replace(PLACEHOLDER, (whole, key) =>
    Object.hasOwn(vars, key) ? vars[key] : whole
  );
}

export function findUnresolved(text) {
  return [...new Set(Array.from(text.matchAll(PLACEHOLDER), (m) => m[1]))];
}

export function findModes(text) {
  return [...new Set(Array.from(text.matchAll(CONDITIONAL_BLOCK), (m) => m[1]))];
}
