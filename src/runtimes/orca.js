// Legacy Orca adapter: the recipe that used to live in CLAUDE.md section 2, generated per task.

function quote(value) {
  return `"${String(value).replace(/(["\\$`])/g, "\\$1")}"`;
}

export const orca = {
  name: "orca",
  description: "Orca orchestration: worker TUI in an Orca terminal, worker_done messages",

  completionNote:
    "Envie também `orca orchestration send --type worker_done ... --outcome <succeeded|failed>` uma única vez, com o bloco `agent-kit-report` no `--body`.",

  validateProfile(profile, config) {
    const errors = [];
    if (profile.provider !== "coordinator" && !config.runtimes?.orca?.launchCommand) {
      errors.push("runtimes.orca.launchCommand is not set; run /configurar-worker");
    }
    return errors;
  },

  dispatch({ run, task, attempt, profile, config }) {
    if (profile.provider === "coordinator") {
      return { runtime: "orca", kind: "coordinator", instruction: `Do task ${task.id} yourself using ${attempt.briefPath}.` };
    }
    const orcaConfig = config.runtimes.orca;
    const launch = orcaConfig.launchCommand.replace("{model}", profile.model || "");
    const slug = `${run.id}-${task.id}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    const linear = task.tracker?.identifier ? ` --linear-issue ${task.tracker.identifier}` : "";
    return {
      runtime: "orca",
      kind: "shell",
      commands: [
        `orca orchestration run-create --objective ${quote(run.objective || run.id)} --json   # once per run`,
        `orca worktree create --name ${slug} --no-parent${linear} --json   # only when running in parallel; else use the current worktree`,
        `orca terminal create --worktree <selector> --title ${slug} --command ${quote(launch)} --json`,
        `orca terminal read --terminal <handle> --json   # repeat until: ${orcaConfig.readiness || "the TUI is ready"}`,
        `orca orchestration task-create --spec "$(cat ${attempt.briefPath})" --json`,
        "orca orchestration dispatch --task <task_id> --to <handle> --return-preamble --json",
        `orca terminal send --terminal <handle> --text "Read the file <abs-path-to-preamble> in full, then follow it exactly." --enter --json`,
      ],
      then: `agent-kit wf started ${run.id} ${task.id} --ref <handle>|<task_id>`,
      notes: ["Never pass --inject. Arm the Monitor described in .agent-kit/runtime/orca.md after dispatch."],
    };
  },

  status() {
    return { runtime: "orca", kind: "shell", commands: ["orca orchestration check --run <run> --json"] };
  },

  cancel({ attempt }) {
    const handle = String(attempt.runtimeRef || "<handle>").split("|")[0];
    return { runtime: "orca", kind: "shell", commands: [`orca terminal close --terminal ${handle} --tab --json`] };
  },

  interpretStatus(message) {
    if (message?.type === "worker_done") return { finished: true, summary: message.body || "" };
    if (message?.type === "escalation") return { finished: true, summary: message.body || "", escalation: true };
    return { finished: false };
  },
};
