const CONDITIONAL_BLOCK = /<!--IF:([a-z-]+)-->\r?\n?([\s\S]*?)<!--END-->\r?\n?/g;
const PLACEHOLDER = /\{\{([A-Z_]+)\}\}/g;

export function render(text, mode, vars) {
  const selected = selectBlocks(text, mode);
  return fillPlaceholders(selected, vars);
}

function selectBlocks(text, mode) {
  return text.replace(CONDITIONAL_BLOCK, (_, blockMode, body) =>
    blockMode === mode ? body : ""
  );
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
