// T3 Code orchestrator adapter. The Node side cannot call T3 tools (they are MCP tools of the
// coordinator session); it produces the exact call the coordinator makes and interprets results.

const T3_ROLES = {
  implementation: "implementation",
  debug: "implementation",
  docs: "general",
  test: "test",
  review: "review",
  research: "research",
  design: "design",
  qa: "test",
  system: "review",
  uiux: "review",
  security: "review",
  "product-owner": "review",
  pm: "design",
  architect: "design",
  release: "general",
};

export const t3 = {
  name: "t3",
  description: "T3 Code orchestrator: delegate_task child threads, completion delivered to the parent",

  completionNote: "Sua resposta final é o resultado que o coordenador lê; o bloco `agent-kit-report` precisa estar nela.",

  validateProfile(profile) {
    const errors = [];
    if (profile.provider !== "coordinator" && !profile.model) {
      errors.push(`profile "${profile.name}" has no model; run /configurar-worker (uses orchestrator_capabilities)`);
    }
    return errors;
  },

  dispatch({ run, task, attempt, brief, profile, config }) {
    if (profile.provider === "coordinator") {
      return {
        runtime: "t3",
        kind: "coordinator",
        instruction: `Profile "${profile.name}" runs on the coordinator: do task ${task.id} yourself using the brief at ${attempt.briefPath}, then record the report with agent-kit wf report.`,
      };
    }
    const target = { providerInstanceId: profile.provider, model: profile.model };
    if (profile.options && Object.keys(profile.options).length) target.options = profile.options;
    return {
      runtime: "t3",
      kind: "tool-call",
      tool: "delegate_task",
      args: {
        task: brief,
        title: `${task.id} ${task.title}`.slice(0, 120),
        role: T3_ROLES[task.role] || "general",
        mode: "async",
        isolation: config.runtimes?.t3?.isolation || "shared",
        clientRequestId: attempt.clientRequestId,
        target,
      },
      then: `agent-kit wf started ${run.id} ${task.id} --ref <taskId returned by delegate_task>`,
      notes: [
        "Do not poll task_status; the child's completion wakes the coordinator.",
        "If the dispatch call fails or times out, call it again with the same clientRequestId — it is the retry key.",
      ],
    };
  },

  status({ attempt }) {
    return {
      runtime: "t3",
      kind: "tool-call",
      tool: "task_status",
      args: { taskId: attempt.runtimeRef },
      notes: ["Only on resume or for an overdue task; reading the summary marks it delivered."],
    };
  },

  cancel({ attempt, reason }) {
    return { runtime: "t3", kind: "tool-call", tool: "task_cancel", args: { taskId: attempt.runtimeRef, reason } };
  },

  interpretStatus(status) {
    const state = status?.workState;
    if (state === "result_available") return { finished: true, summary: status.summary || "" };
    if (state === "working" || state === "waiting_for_children") return { finished: false };
    return { finished: false, unknown: true };
  },
};
