import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { executorId, loadSettings, profileForTask, validateAutonomy, validateConfig, validateWorkflow } from "../core/config.js";
import * as engine from "../core/engine.js";
import { buildBrief, buildGateBrief, hashBrief, readContextFiles } from "../core/briefing.js";
import { parseReport, parseReview } from "../core/report.js";
import { runChecks, taskChecks } from "../core/verify.js";
import { listRuns, loadRun, runExists, saveArtifact, saveRun } from "../core/store.js";
import { getAdapter } from "../runtimes/index.js";
import { createTracker } from "../trackers/index.js";
import { acknowledge, bindIssue } from "../trackers/linear-t3.js";

const OPTIONS = {
  plan: { type: "string" },
  "from-linear": { type: "string" },
  objective: { type: "string" },
  profile: { type: "string" },
  ref: { type: "string" },
  note: { type: "string" },
  file: { type: "string" },
  text: { type: "string" },
  final: { type: "boolean", default: false },
  cwd: { type: "string" },
  verdict: { type: "string" },
  reviewer: { type: "string" },
  finding: { type: "string", multiple: true },
  gate: { type: "string" },
  key: { type: "string" },
  url: { type: "string" },
  ack: { type: "string" },
  reason: { type: "string" },
  resolution: { type: "string" },
  "no-sync": { type: "boolean", default: false },
};

export const WF_HELP = `
agent-kit wf — workflow state for the coordinator (JSON output).

  wf list
  wf new <run> --plan <plan.json> [--objective <text>]      create a run (publishes to the tracker)
  wf new <run> --from-linear <ISSUE-ID>                       create a run from a Linear parent issue
  wf next <run>                                               what to dispatch, verify, review, reconcile
  wf dispatch <run> <task> [--profile <name>]                 write the brief, start an attempt, print the runtime call
  wf started <run> <task> --ref <runtime-id> [--gate <gate>]  bind the runtime id (T3 taskId / Orca handle)
  wf touch <run> <task> --note <text>                         record progress (resets the stall timer)
  wf report <run> <task> --file <path> | --text <text>        record the worker's final message
  wf verify <run> <task> [--cwd <dir>]                        run the task's checks independently
  wf verify <run> --final [--cwd <dir>]                       run every project check (nothing may be running)
  wf gate <run> <task> <gate>                                 brief + runtime call for a validation gate (qa, system, ...)
  wf review <run> <task> --gate <gate> --reviewer <id> (--file <review.md> | --verdict approved|rejected [--finding <text>]...)
  wf lost <run> <task> --reason <text>                        the runtime confirmed the worker is gone
  wf takeover <run> <task>                                    the coordinator implements a failed/blocked task itself
  wf unblock <run> <task> --resolution <text>
  wf cancel <run> <task> --reason <text>
  wf replan <run> --plan <plan.json>
  wf status <run> | wf resume <run> | wf complete <run>
  wf sync <run> [--ack <ids>]                                 push tracker events (with Linear via T3: prints the tool calls; ack after running them)
  wf tracker-bind <run> <task|_parent> --key <KEY> [--url <url>]  record an issue created through T3
`;

const now = () => new Date().toISOString();

export async function runWorkflowCommand(argv, { root = process.cwd(), out = console.log, env = process.env, fetchImpl } = {}) {
  const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  const [command, runId, taskId, extra] = positionals;
  if (!command || command === "help") {
    out(WF_HELP.trim());
    return 0;
  }
  const settings = await loadSettings(root);
  const context = { root, values, settings, env, fetchImpl, runId, taskId, extra };
  const handler = HANDLERS[command];
  if (!handler) throw new Error(`Unknown wf command "${command}"\n${WF_HELP.trim()}`);
  if (command !== "list" && !runId) throw new Error(`wf ${command} needs a run id`);
  const result = await handler(context);
  out(JSON.stringify(result.output, null, 2));
  return result.exitCode || 0;
}

function need(value, flag) {
  if (!value) throw new Error(`Missing ${flag}`);
  return value;
}

function needTask(context) {
  return need(context.taskId, "<task> argument");
}

async function persist(context, run, output, exitCode = 0) {
  await saveRun(context.root, run);
  if (!context.values["no-sync"]) {
    try {
      const tracker = createTracker(context.settings.config, context);
      if (tracker.deferred) {
        const unsynced = run.events.filter((event) => !event.synced).length;
        output.tracker = { via: "t3", unsyncedEvents: unsynced, next: unsynced ? `agent-kit wf sync ${run.id}` : null };
        return { output, exitCode };
      }
      output.tracker = await tracker.sync(run);
      await saveRun(context.root, run);
    } catch (error) {
      output.tracker = { error: error.message, note: "state saved locally; run `agent-kit wf sync` later" };
    }
  }
  return { output, exitCode };
}

async function readPlan(root, path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

const HANDLERS = {
  async list({ root }) {
    return { output: await listRuns(root) };
  },

  async new(context) {
    const { root, values, settings, runId } = context;
    if (runExists(root, runId)) throw new Error(`Run "${runId}" already exists; use wf resume or wf replan`);
    assertSettings(settings);
    let plan;
    let completed = [];
    if (values["from-linear"]) {
      const imported = await createTracker(settings.config, context).importPlan(values["from-linear"]);
      plan = imported.plan;
      completed = imported.completed;
    } else {
      plan = await readPlan(root, need(values.plan, "--plan <file>"));
    }
    const run = engine.createRun({ id: runId, objective: values.objective, plan, runtime: settings.config.runtime, now: now(), completed });
    const output = { run: run.id, state: run.state, waves: run.waves };
    if (!values["from-linear"] && !values["no-sync"]) {
      try {
        output.published = await createTracker(settings.config, context).publishPlan(run);
      } catch (error) {
        output.published = { error: error.message };
      }
    }
    output.next = engine.nextActions(run, settings.autonomy, now());
    if (!output.published?.error) for (const event of run.events) event.synced = true;
    return persist(context, run, output);
  },

  async next(context) {
    const run = await loadRun(context.root, context.runId);
    const output = engine.nextActions(run, context.settings.autonomy, now());
    output.completion = engine.completionStatus(run, context.settings.autonomy, context.settings.config);
    return persist(context, run, output);
  },

  async dispatch(context) {
    const { root, values, settings, runId } = context;
    const taskId = needTask(context);
    const run = await loadRun(root, runId);
    const task = engine.getTask(run, taskId);
    const adapter = getAdapter(settings.config.runtime);
    const current = engine.currentAttempt(task);
    if (task.state === "running" && current && !current.runtimeRef) {
      const brief = await readFile(join(root, current.briefPath), "utf8");
      const profile = profileForTask(task, settings.config, current.profile);
      return { output: { redispatch: true, attempt: current.number, call: adapter.dispatch({ run, task, attempt: current, brief, profile, config: settings.config }) } };
    }
    return persist(context, run, await startTask(context, run, task, values.profile || task.fix?.profile));
  },

  async takeover(context) {
    const run = await loadRun(context.root, context.runId);
    const task = engine.reopenForTakeover(run, needTask(context), now());
    return persist(context, run, await startTask(context, run, task, "coordinator"));
  },

  async started(context) {
    const run = await loadRun(context.root, context.runId);
    const bound = engine.bindRuntimeRef(run, needTask(context), need(context.values.ref, "--ref"), now(), context.values.gate);
    return persist(context, run, { task: context.taskId, gate: context.values.gate || null, runtimeRef: bound.runtimeRef });
  },

  async touch(context) {
    const run = await loadRun(context.root, context.runId);
    engine.touch(run, needTask(context), need(context.values.note, "--note"), now());
    return persist(context, run, { task: context.taskId, touched: true });
  },

  async report(context) {
    const { root, values, settings, runId } = context;
    const taskId = needTask(context);
    const run = await loadRun(root, runId);
    const text = values.file ? await readFile(resolve(root, values.file), "utf8") : need(values.text, "--file or --text");
    const attemptNumber = engine.currentAttempt(engine.getTask(run, taskId))?.number || 0;
    const reportPath = await saveArtifact(root, runId, `reports/${safe(taskId)}.${attemptNumber}.md`, text);
    const parsed = parseReport(text);
    const result = engine.recordReport(run, taskId, parsed, settings.autonomy, now());
    return persist(context, run, { task: taskId, reportPath, valid: parsed.valid, errors: parsed.errors, state: run.tasks[taskId].state, ...result });
  },

  async verify(context) {
    const { root, values, settings, runId } = context;
    const run = await loadRun(root, runId);
    const cwd = values.cwd ? resolve(root, values.cwd) : root;
    if (values.final) {
      const checks = await runChecks(settings.config.checks || [], { cwd });
      engine.recordFinalChecks(run, checks, now());
      await saveArtifact(root, runId, "checks/final.json", JSON.stringify(checks, null, 2));
      return persist(context, run, { final: true, passed: checks.passed, results: summarize(checks.results) }, checks.passed ? 0 : 3);
    }
    const taskId = needTask(context);
    const task = engine.getTask(run, taskId);
    const checks = await runChecks(taskChecks(task, settings.config), { cwd });
    const attemptNumber = engine.currentAttempt(task)?.number || 0;
    await saveArtifact(root, runId, `checks/${safe(taskId)}.${attemptNumber}.json`, JSON.stringify(checks, null, 2));
    const result = engine.recordChecks(run, taskId, checks, settings.autonomy, now(), settings.workflow);
    return persist(context, run, { task: taskId, passed: checks.passed, skipped: checks.skipped, results: summarize(checks.results), state: task.state, ...result }, checks.passed ? 0 : 3);
  },

  async gate(context) {
    const { root, settings, runId } = context;
    const taskId = needTask(context);
    const gateId = need(context.extra, "<gate> argument");
    const run = await loadRun(root, runId);
    const task = engine.getTask(run, taskId);
    const attempt = engine.currentAttempt(task);
    const gateConfig = (settings.workflow.gates || []).find((gate) => gate.id === gateId) || { id: gateId, role: "review" };
    const profile = profileForTask({ id: taskId, role: gateConfig.role }, settings.config);
    const adapter = getAdapter(settings.config.runtime);
    const problems = adapter.validateProfile(profile, settings.config);
    if (problems.length) throw new Error(problems.join("\n"));
    const gate = engine.startGate(run, taskId, gateId, { profile: profile.name, executor: executorId(profile), now: now() });
    const brief = buildGateBrief({ run, task, attempt, gate, gateConfig, config: settings.config, completionNote: adapter.completionNote });
    const briefPath = await saveArtifact(root, runId, `briefs/${safe(taskId)}.${attempt.number}.gate-${safe(gateId)}.md`, brief);
    const pseudoTask = { ...task, id: `${task.id}`, title: `gate ${gateId}: ${task.title}`, role: gateConfig.role };
    const pseudoAttempt = { ...attempt, briefPath, clientRequestId: `agent-kit:${run.id}:${task.id}:${attempt.number}:gate-${gateId}` };
    const call = adapter.dispatch({ run, task: pseudoTask, attempt: pseudoAttempt, brief, profile, config: settings.config });
    if (call.then) call.then = `agent-kit wf started ${run.id} ${task.id} --gate ${gateId} --ref <taskId>`;
    return persist(context, run, { task: taskId, gate: gateId, profile: profile.name, reviewer: executorId(profile), briefPath, call });
  },

  async review(context) {
    const { root, values, settings, runId } = context;
    const run = await loadRun(root, runId);
    const taskId = needTask(context);
    let review;
    if (values.file) {
      const text = await readFile(resolve(root, values.file), "utf8");
      const attemptNumber = engine.currentAttempt(engine.getTask(run, taskId))?.number || 0;
      await saveArtifact(root, runId, `reviews/${safe(taskId)}.${attemptNumber}.${safe(values.gate || "review")}.md`, text);
      const parsed = parseReview(text);
      if (!parsed.valid) throw new Error(`Invalid review: ${parsed.errors.join("; ")}. Ask the validator to resend its agent-kit-review block, or record the verdict with --verdict.`);
      review = parsed.review;
    } else {
      review = { verdict: need(values.verdict, "--verdict or --file"), findings: values.finding || [], criteria: [] };
    }
    const result = engine.recordReview(
      run,
      taskId,
      { gate: values.gate, verdict: review.verdict, reviewer: need(values.reviewer, "--reviewer"), findings: review.findings, criteria: review.criteria },
      settings.autonomy,
      now()
    );
    return persist(context, run, { task: taskId, gate: values.gate || null, verdict: review.verdict, state: run.tasks[taskId].state, ...result });
  },

  async lost(context) {
    const run = await loadRun(context.root, context.runId);
    const result = engine.markLost(run, needTask(context), need(context.values.reason, "--reason"), context.settings.autonomy, now());
    return persist(context, run, { task: context.taskId, state: run.tasks[context.taskId].state, ...result });
  },

  async unblock(context) {
    const run = await loadRun(context.root, context.runId);
    engine.unblock(run, needTask(context), need(context.values.resolution, "--resolution"), now());
    return persist(context, run, { task: context.taskId, state: run.tasks[context.taskId].state });
  },

  async cancel(context) {
    const run = await loadRun(context.root, context.runId);
    const task = engine.getTask(run, needTask(context));
    const attempt = engine.currentAttempt(task);
    const runtimeCall = task.state === "running" && attempt?.runtimeRef ? getAdapter(attempt.runtime).cancel({ attempt, reason: context.values.reason }) : null;
    engine.cancelTask(run, task.id, need(context.values.reason, "--reason"), now());
    return persist(context, run, { task: task.id, state: task.state, runtimeCall });
  },

  async replan(context) {
    const run = await loadRun(context.root, context.runId);
    engine.replan(run, await readPlan(context.root, need(context.values.plan, "--plan <file>")), now());
    const output = { run: run.id, state: run.state, waves: run.waves };
    if (!context.values["no-sync"]) {
      try {
        output.published = await createTracker(context.settings.config, context).publishPlan(run);
      } catch (error) {
        output.published = { error: error.message };
      }
    }
    output.next = engine.nextActions(run, context.settings.autonomy, now());
    return persist(context, run, output);
  },

  async status(context) {
    const run = await loadRun(context.root, context.runId);
    const tasks = run.order.map((id) => {
      const task = run.tasks[id];
      const attempt = engine.currentAttempt(task);
      return { id, title: task.title, state: task.state, attempts: task.attempts.length, profile: attempt?.profile || null, runtimeRef: attempt?.runtimeRef || null, tracker: task.tracker?.identifier || null };
    });
    return {
      output: {
        run: run.id,
        objective: run.objective,
        state: run.state,
        runtime: run.runtime,
        tracker: run.tracker?.parent?.identifier || run.tracker?.kind || "local",
        tasks,
        unsyncedEvents: run.events.filter((event) => !event.synced).length,
        completion: engine.completionStatus(run, context.settings.autonomy, context.settings.config),
      },
    };
  },

  async resume(context) {
    const run = await loadRun(context.root, context.runId);
    const runtime = context.settings.config.runtime;
    const plan = engine.resumePlan(run, context.settings.autonomy, now(), runtime);
    plan.gates = run.order
      .map((id) => run.tasks[id])
      .filter((task) => task.state === "review")
      .flatMap((task) => Object.entries(engine.currentAttempt(task).gates || {})
        .filter(([, gate]) => gate.status === "pending" && gate.dispatchedAt)
        .map(([gate, info]) => ({ id: task.id, gate, runtimeRef: info.runtimeRef, call: info.runtimeRef ? getAdapter(runtime).status({ attempt: { runtimeRef: info.runtimeRef } }) : null })));
    plan.reconcile = plan.reconcile.map((item) => {
      const attempt = engine.currentAttempt(run.tasks[item.id]);
      return { ...item, call: getAdapter(attempt.runtime || runtime).status({ attempt }) };
    });
    return persist(context, run, plan);
  },

  async complete(context) {
    const run = await loadRun(context.root, context.runId);
    const status = engine.completeRun(run, context.settings.autonomy, context.settings.config, now());
    return persist(context, run, { run: run.id, state: run.state, ...status }, status.complete ? 0 : 3);
  },

  async sync(context) {
    const run = await loadRun(context.root, context.runId);
    const tracker = createTracker(context.settings.config, context);
    if (context.values.ack) {
      const ids = context.values.ack.split(",").map((id) => Number.parseInt(id, 10)).filter(Number.isInteger);
      const acknowledged = acknowledge(run, ids);
      await saveRun(context.root, run);
      return { output: { acknowledged, unsyncedEvents: run.events.filter((event) => !event.synced).length } };
    }
    if (tracker.deferred) return { output: await tracker.sync(run) };
    const published = await tracker.publishPlan(run);
    const synced = await tracker.sync(run);
    await saveRun(context.root, run);
    return { output: { published, synced } };
  },

  async "tracker-bind"(context) {
    const run = await loadRun(context.root, context.runId);
    const bound = bindIssue(run, needTask(context), { key: need(context.values.key, "--key"), url: context.values.url || null });
    await saveRun(context.root, run);
    return { output: { target: context.taskId, ...bound } };
  },
};

async function startTask(context, run, task, profileName) {
  const { root, settings } = context;
  const adapter = getAdapter(settings.config.runtime);
  const profile = profileForTask(task, settings.config, profileName);
  const problems = adapter.validateProfile(profile, settings.config);
  if (problems.length) throw new Error(problems.join("\n"));
  const attemptNumber = task.attempts.length + 1;
  const contextFiles = await readContextFiles(root, [task.doc, ...task.context].filter(Boolean));
  const brief = buildBrief({ run, task, attemptNumber, config: settings.config, autonomy: settings.autonomy, contextFiles, completionNote: adapter.completionNote });
  const briefPath = await saveArtifact(root, run.id, `briefs/${safe(task.id)}.${attemptNumber}.md`, brief);
  const attempt = engine.startAttempt(run, task.id, {
    profile: profile.name,
    executor: executorId(profile),
    runtime: adapter.name,
    briefPath,
    briefHash: hashBrief(brief),
    now: now(),
  });
  const call = adapter.dispatch({ run, task, attempt, brief, profile, config: settings.config });
  return { task: task.id, attempt: attempt.number, profile: profile.name, briefPath, call };
}

function assertSettings({ config, autonomy, workflow }) {
  const errors = [...validateConfig(config).errors, ...validateAutonomy(autonomy, config).errors, ...validateWorkflow(workflow, config).errors];
  if (errors.length) throw new Error(`Invalid .agent-kit configuration:\n- ${errors.join("\n- ")}`);
}

function safe(id) {
  return String(id).replace(/[^a-z0-9._-]/gi, "_");
}

function summarize(results) {
  return results.map((result) => ({ name: result.name, passed: result.passed, exitCode: result.exitCode, timedOut: result.timedOut, tail: result.output.slice(-600) }));
}
