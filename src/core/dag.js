const GLOB_CHAR = /[*?[{]/;

export function validateGraph(tasks) {
  const errors = [];
  const ids = new Set();
  for (const task of tasks) {
    if (ids.has(task.id)) errors.push(`duplicate task id "${task.id}"`);
    ids.add(task.id);
  }
  for (const task of tasks) {
    for (const dep of task.dependsOn || []) {
      if (!ids.has(dep)) errors.push(`task "${task.id}" depends on unknown task "${dep}"`);
      if (dep === task.id) errors.push(`task "${task.id}" depends on itself`);
    }
  }
  if (errors.length === 0) {
    const cycle = findCycle(tasks);
    if (cycle) errors.push(`dependency cycle: ${cycle.join(" -> ")}`);
  }
  return errors;
}

function findCycle(tasks) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const state = new Map();
  const stack = [];
  const visit = (id) => {
    state.set(id, "visiting");
    stack.push(id);
    for (const dep of byId.get(id).dependsOn || []) {
      if (state.get(dep) === "visiting") return [...stack.slice(stack.indexOf(dep)), dep];
      if (!state.has(dep)) {
        const found = visit(dep);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, "done");
    return null;
  };
  for (const task of tasks) {
    if (!state.has(task.id)) {
      const found = visit(task.id);
      if (found) return found;
    }
  }
  return null;
}

export function executionWaves(tasks) {
  const remaining = new Map(tasks.map((task) => [task.id, new Set(task.dependsOn || [])]));
  const waves = [];
  while (remaining.size > 0) {
    const wave = [...remaining].filter(([, deps]) => deps.size === 0).map(([id]) => id);
    if (wave.length === 0) throw new Error("dependency cycle: cannot order tasks");
    waves.push(wave);
    for (const id of wave) remaining.delete(id);
    for (const deps of remaining.values()) for (const id of wave) deps.delete(id);
  }
  return waves;
}

function staticPrefix(pattern) {
  const normalized = pattern.replace(/\\/g, "/").replace(/^\.\//, "");
  const segments = normalized.split("/");
  const fixed = [];
  for (const segment of segments) {
    if (GLOB_CHAR.test(segment)) return { segments: fixed, open: true };
    fixed.push(segment);
  }
  return { segments: fixed, open: false };
}

function isSegmentPrefix(shorter, longer) {
  return shorter.every((segment, index) => longer[index] === segment);
}

export function patternsOverlap(a, b) {
  const left = staticPrefix(a);
  const right = staticPrefix(b);
  if (!left.open && !right.open) return left.segments.join("/") === right.segments.join("/");
  if (left.open && isSegmentPrefix(left.segments, right.segments)) return true;
  if (right.open && isSegmentPrefix(right.segments, left.segments)) return true;
  return false;
}

export function filesConflict(filesA = [], filesB = []) {
  return filesA.some((a) => filesB.some((b) => patternsOverlap(a, b)));
}

export function selectDispatchable(candidates, holders, slots) {
  const selected = [];
  const owned = holders.map((task) => task.files || []);
  for (const task of candidates) {
    if (selected.length >= slots) break;
    const files = task.files || [];
    if (files.length === 0 && (holders.length > 0 || selected.length > 0)) continue;
    if (owned.some((other) => other.length === 0 || filesConflict(files, other))) continue;
    selected.push(task);
    owned.push(files);
  }
  return selected;
}
