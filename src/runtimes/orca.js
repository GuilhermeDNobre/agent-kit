// Orca orchestration adapter. The coordinator runs inside an Orca terminal; every worker is one
// supervised `orca orchestration worker-start`, and Orca wakes the coordinator with its mail.

const ORCA = "orca orchestration";

function quote(value) {
  return `"${String(value).replace(/(["\\$`])/g, "\\$1")}"`;
}

function slugOf(...parts) {
  return parts.join("-").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 48);
}

function dispatchIdOf(attempt) {
  return String(attempt?.runtimeRef || "<dispatch_id>");
}

function isLegacyRef(ref) {
  return String(ref || "").includes("|");
}

function workerFlags(profile) {
  const flags = [`--agent ${profile.provider}`];
  if (profile.model) flags.push(`--model ${quote(profile.model)}`);
  if (profile.model && profile.options?.effort) flags.push(`--effort ${profile.options.effort}`);
  return flags.join(" ");
}

function worktreeFlags(orcaConfig, run, task, gate) {
  if (gate || (orcaConfig.worktree || "current") !== "new-child") return "--worktree current";
  return `--worktree new-child --name ${slugOf(run.id, task.id)}`;
}

export const orca = {
  name: "orca",
  description: "Orca orchestration: supervised workers via worker-start; Orca wakes the coordinator with worker_done",

  completionNote:
    "Quando terminar, siga o preamble do Orca: envie `worker_done` uma única vez com o bloco `agent-kit-report` no corpo (`--body-file`) e encerre o turno.",

  validateProfile(profile) {
    const errors = [];
    if (profile.provider === "coordinator") return errors;
    if (!profile.provider) errors.push(`profile "${profile.name}" has no Orca agent id (provider); run /configurar-worker`);
    if (!profile.model && !profile.options?.agentDefaultModel) {
      errors.push(`profile "${profile.name}" has no model; run /configurar-worker (or set options.agentDefaultModel: true for agents that pick their own model)`);
    }
    return errors;
  },

  dispatch({ run, task, attempt, profile, config, gate }) {
    if (profile.provider === "coordinator") {
      return {
        runtime: "orca",
        kind: "coordinator",
        instruction: `Profile "${profile.name}" runs on the coordinator: do task ${task.id} yourself using the brief at ${attempt.briefPath}, then record the report with agent-kit wf report.`,
      };
    }
    const orcaConfig = config.runtimes?.orca || {};
    const keepOpen = orcaConfig.keepOpen ? " --keep-open" : "";
    const title = `${task.id} ${task.title}`.slice(0, 120);
    return {
      runtime: "orca",
      kind: "shell",
      commands: [
        `${ORCA} run-current --json   # once per agent-kit run; when no Run is bound: ${ORCA} run-create --environment local --objective ${quote(run.objective || run.id)} --json`,
        `${ORCA} worker-start --environment local --spec-file ${attempt.briefPath} --task-title ${quote(title)} ${workerFlags(profile)} ${worktreeFlags(orcaConfig, run, task, gate)}${keepOpen} --json`,
      ],
      then: `agent-kit wf started ${run.id} ${task.id} --ref <dispatch_id returned by worker-start>`,
      notes: [
        "Start every task listed in `dispatch` (up to ~4 per shell command), record each dispatch id, then end the turn: Orca wakes you with worker_done, question or escalation.",
        "Never poll `check` or run a watch script: a script's check consumes the mail and Orca has nothing left to wake you with.",
        "If worker-start fails, do not rerun it: read failedStage and do only what the CLI prints (it names a --retry-request id when a replay is safe).",
      ],
    };
  },

  status({ attempt }) {
    const ref = dispatchIdOf(attempt);
    if (isLegacyRef(ref)) {
      return { runtime: "orca", kind: "shell", commands: [`orca terminal read --terminal ${ref.split("|")[0]} --json`], notes: ["Attempt started with the pre-0.4 terminal recipe."] };
    }
    return {
      runtime: "orca",
      kind: "shell",
      commands: [`${ORCA} worker-show --dispatch ${ref} --json`, `${ORCA} worker-read --dispatch ${ref} --limit 50 --json`],
      notes: ["Silence or unverifiable liveness is not proof of exit. A worker parked on a human prompt (observation.agentWait) is healthy."],
    };
  },

  cancel({ attempt }) {
    const ref = dispatchIdOf(attempt);
    if (isLegacyRef(ref)) {
      return { runtime: "orca", kind: "shell", commands: [`orca terminal close --terminal ${ref.split("|")[0]} --tab --json`] };
    }
    return {
      runtime: "orca",
      kind: "shell",
      commands: [`${ORCA} worker-stop --dispatch ${ref} --json`],
      notes: ["processAction closed_agent_terminal means Orca closed it; stop_unknown means the exit was not proven — report it, do not retry blindly."],
    };
  },

  interpretStatus(message) {
    const type = message?.type;
    if (type === "worker_done") {
      return { finished: true, summary: message.body || "", failed: message.payload?.outcome === "failed" || message.outcome === "failed" };
    }
    if (type === "escalation") return { finished: true, summary: message.body || "", escalation: true, stopReason: message.payload?.stopReason || message.stopReason || null };
    if (type === "question") return { finished: false, question: true, messageId: message.id || null };
    return { finished: false };
  },
};
