// Which runtime hosts the current session. The shell environment can prove Orca (its terminals
// export ORCA_* variables); T3 is proven by the coordinator seeing T3's orchestrator tools, which a
// process cannot observe, so `/configurar-worker` passes that fact in with --t3-tools.

const ORCA_MARKERS = ["ORCA_TERMINAL_HANDLE", "ORCA_WORKSPACE_ID", "ORCA_WORKTREE_ID"];
const T3_MARKERS = ["T3_THREAD_ID", "T3CODE_THREAD_ID", "T3_SESSION_ID"];

export function detectRuntime(env = process.env, { t3Tools = false } = {}) {
  if (t3Tools) return { runtime: "t3", evidence: "the coordinator session exposes T3's orchestrator tools" };
  const t3 = T3_MARKERS.find((name) => env[name]);
  if (t3) return { runtime: "t3", evidence: `${t3} is set (T3 Code session)` };
  if (env.TERM_PROGRAM === "Orca") return { runtime: "orca", evidence: "TERM_PROGRAM=Orca (Orca terminal)" };
  const orca = ORCA_MARKERS.find((name) => env[name]);
  if (orca) return { runtime: "orca", evidence: `${orca} is set (Orca terminal)` };
  return { runtime: "orca", evidence: "no T3 or Orca session detected; Orca is the default outside T3" };
}
