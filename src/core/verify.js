import { spawn } from "node:child_process";

const OUTPUT_TAIL = 4000;

export function runCommand(command, { cwd, timeoutSeconds = 900, env } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, { cwd, shell: true, env: env || process.env, windowsHide: true });
    let output = "";
    let timedOut = false;
    const keep = (chunk) => {
      output = (output + chunk.toString()).slice(-OUTPUT_TAIL * 2);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutSeconds * 1000);
    const finish = (exitCode, error) => {
      clearTimeout(timer);
      resolve({
        command,
        exitCode: timedOut ? null : exitCode,
        passed: !timedOut && exitCode === 0,
        timedOut,
        durationMs: Date.now() - started,
        output: (error ? `${error.message}\n` : "") + output.slice(-OUTPUT_TAIL),
      });
    };
    child.on("error", (error) => finish(null, error));
    child.on("close", (code) => finish(code));
  });
}

export async function runChecks(checks, options = {}) {
  const results = [];
  for (const check of checks) {
    const result = await runCommand(check.command, {
      ...options,
      timeoutSeconds: check.timeoutSeconds || options.timeoutSeconds,
    });
    results.push({ name: check.name || check.command, required: check.required !== false, ...result });
  }
  const passed = results.every((result) => result.passed || !result.required);
  return { passed, skipped: results.length === 0, results };
}

export function taskChecks(task, config) {
  if (task.validation?.length) {
    return task.validation.map((command) => ({ name: command, command, required: true }));
  }
  return (config.checks || []).filter((check) => check.perTask);
}
