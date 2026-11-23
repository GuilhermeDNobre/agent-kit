import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { reportExample, reviewExample } from "./report.js";
import { protectedCategories } from "./policy.js";
import { ACTIVE_TASK_STATES } from "./states.js";

const PER_FILE_LIMIT = 24000;
const TOTAL_LIMIT = 60000;

export async function readContextFiles(root, paths) {
  const files = [];
  let budget = TOTAL_LIMIT;
  for (const path of paths) {
    const absolute = join(root, path);
    if (!existsSync(absolute)) {
      files.push({ path, missing: true });
      continue;
    }
    const text = await readFile(absolute, "utf8");
    if (text.length > PER_FILE_LIMIT || text.length > budget) {
      files.push({ path, tooLarge: true, size: text.length });
      continue;
    }
    budget -= text.length;
    files.push({ path, text });
  }
  return files;
}

export function hashBrief(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function buildBrief({ run, task, attemptNumber, config, autonomy, contextFiles = [], completionNote }) {
  const project = config.project || {};
  const otherOwners = Object.values(run.tasks)
    .filter((other) => other.id !== task.id && ACTIVE_TASK_STATES.includes(other.state))
    .flatMap((other) => other.files.map((file) => `${file} (tarefa ${other.id})`));
  const sections = [
    `# Brief — ${run.id} / ${task.id}: ${task.title} (tentativa ${attemptNumber})`,
    "Você é um **worker**. Este brief é todo o contexto que você recebe: não existe conversa anterior. Siga-o à risca.",
    heading("OBJETIVO", [`Entregar a tarefa **${task.id} — ${task.title}**.`, run.objective ? `Objetivo do workflow: ${run.objective}` : null]),
    heading("CONTEXTO DO PROJETO", [
      bullet(`Projeto: ${project.name || "(ver AGENTS.md)"}${project.description ? ` — ${project.description}` : ""}`),
      bullet(`Stack: ${project.stack || "ver AGENTS.md"}`),
      bullet("Leia antes de começar: `AGENTS.md`, `docs/agents/worker.md`, `.claude/rules/README.md` e as regras aplicáveis."),
      checksList(config.checks),
    ]),
    dependencySection(run, task),
    contextSection(contextFiles),
    heading("ESCOPO DE ARQUIVOS", [
      "Pode criar ou alterar **somente**:",
      ...task.files.map((file) => bullet(`\`${file}\``)),
      "",
      "Não pode alterar nenhum outro arquivo. Em especial:",
      ...otherOwners.map((file) => bullet(`\`${file}\` — em uso por outro worker`)),
      ...(autonomy.permissions?.denyWrite || []).map((file) => bullet(`\`${file}\` — protegido`)),
    ]),
    heading("CRITÉRIOS DE ACEITE", task.acceptance.map((item, index) => `${index + 1}. ${item}`)),
    heading("VALIDAÇÃO", validationLines(task)),
    fixSection(task.fix),
    heading("AÇÕES PROIBIDAS", [
      bullet("Commit, stage, push, troca de branch, merge."),
      bullet("Escolher ou trocar linguagem, framework, gerenciador de pacotes ou ferramenta de testes."),
      bullet("Ler, imprimir ou copiar segredos (`.env`, chaves, tokens)."),
      ...protectedCategories(autonomy).map((category) => bullet(`${category.description} (\`${category.id}\`).`)),
      bullet("Inventar saída de comando, caminho, API ou dependência."),
    ]),
    heading("PROTOCOLO DE CONCLUSÃO", [
      "Termine sua resposta final com **exatamente um** bloco `agent-kit-report` em JSON:",
      "",
      reportExample(),
      "",
      bullet("`outcome`: `succeeded` só se todos os critérios de aceite foram atendidos e a validação rodou com sucesso observado por você."),
      bullet("`failed`: tentou e não conseguiu. `blocked`: precisa de uma decisão ou recurso externo — liste em `blockers`. Não faça perguntas interativas."),
      bullet("`checks`: cada comando que você rodou, com o exit code real. Comando que não existe no projeto: diga isso em `notes`."),
      bullet("`filesChanged`: todos os arquivos que você alterou."),
      completionNote ? bullet(completionNote) : null,
      "O coordenador reexecuta a validação e revisa o diff de forma independente: declarar sucesso sem validação é tratado como falha.",
    ]),
  ];
  return `${sections.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

function heading(title, lines) {
  const body = lines.filter((line) => line !== null && line !== undefined).join("\n");
  return `## ${title}\n\n${body}`;
}

function bullet(text) {
  return `- ${text}`;
}

function checksList(checks = []) {
  if (!checks.length) return bullet("Comandos do projeto: nenhum configurado (ver tabela de comandos em `AGENTS.md`).");
  return [bullet("Comandos do projeto:"), ...checks.map((check) => `  - ${check.name}: \`${check.command}\``)].join("\n");
}

function dependencySection(run, task) {
  if (!task.dependsOn.length) return null;
  const lines = task.dependsOn.map((id) => {
    const dep = run.tasks[id];
    const report = dep.attempts[dep.attempts.length - 1]?.report;
    const files = report?.filesChanged?.length ? ` Arquivos: ${report.filesChanged.map((file) => `\`${file}\``).join(", ")}.` : "";
    return bullet(`**${dep.id} — ${dep.title}** (${dep.state}).${report?.summary ? ` ${report.summary}` : ""}${files}`);
  });
  return heading("DEPENDÊNCIAS JÁ CONCLUÍDAS", lines);
}

function contextSection(files) {
  if (!files.length) return null;
  const lines = files.map((file) => {
    if (file.missing) return `### \`${file.path}\`\n\n(não encontrado no checkout — avise em \`notes\`)`;
    if (file.tooLarge) return `### \`${file.path}\`\n\n(arquivo grande, ${file.size} caracteres — leia do disco)`;
    const fence = file.text.includes("```") ? "````" : "```";
    return `### \`${file.path}\`\n\n${fence}\n${file.text.trimEnd()}\n${fence}`;
  });
  return heading("DOCUMENTOS DA TAREFA", lines);
}

function validationLines(task) {
  if (!task.validation.length) {
    return ["Nenhum comando específico. Rode os testes relacionados ao que você mudou, se existirem, e cite a saída real."];
  }
  return task.validation.map((command, index) => `${index + 1}. \`${command}\``);
}

function fixSection(fix) {
  if (!fix) return null;
  const titles = { checks: "a validação independente falhou", review: "o review reprovou", worker: "a tentativa anterior falhou", lost: "a tentativa anterior se perdeu", blocker: "um bloqueio foi resolvido" };
  const lines = [
    `Esta é uma tentativa de correção: ${titles[fix.kind] || fix.kind} (tentativa ${fix.fromAttempt}).`,
    "",
    fix.details ? `${fix.details}` : null,
    ...(fix.findings || []).map((finding) => bullet(finding)),
    "",
    "Corrija a causa, não o sintoma. O trabalho anterior está no checkout: parta dele.",
  ];
  return heading("CORREÇÃO", lines);
}

const GATE_INSTRUCTIONS = {
  qa: [
    "Rode os testes da tarefa e os comandos de validação; tente casos de borda e entradas inválidas.",
    "Se houver UI e você tiver ferramenta de browser, exercite os fluxos; se não tiver, diga isso em `summary` — não invente.",
  ],
  system: [
    "Confira aderência à techspec, à arquitetura, aos contratos entre módulos e às convenções do repositório.",
    "Procure duplicação, acoplamento indevido e mudanças fora do escopo da tarefa.",
  ],
  uiux: ["Confira estados (vazio, carregando, erro), responsividade, acessibilidade WCAG 2.2 e consistência visual."],
  security: ["Confira autenticação, autorização, validação de entrada, segredos, dados pessoais (PII) e LGPD."],
  "product-owner": ["Avalie **cada** critério de aceite, um por um, com evidência concreta; preencha `criteria` para todos."],
};

export function buildGateBrief({ run, task, attempt, gate, gateConfig, config, completionNote }) {
  const report = attempt.report || {};
  const files = report.filesChanged?.length ? report.filesChanged : task.files;
  const checks = attempt.checks?.results || [];
  const instructions = GATE_INSTRUCTIONS[gate.role] || [];
  const sections = [
    `# Gate ${gateConfig.id} — ${run.id} / ${task.id}: ${task.title} (tentativa ${attempt.number})`,
    `Você é o validador **${gate.role}**, independente de quem implementou. Este brief é todo o seu contexto. **Não altere nenhum arquivo**: só leia, rode comandos de verificação e reporte.`,
    heading("FOCO", [gateConfig.focus || "", ...instructions.map(bullet)]),
    heading("O QUE FOI ENTREGUE", [
      bullet(`Resumo do worker: ${report.summary || "(sem relatório válido)"}`),
      bullet(`Arquivos: ${files.map((file) => `\`${file}\``).join(", ")}`),
      bullet(`Leia os arquivos inteiros. Num repositório git, veja também \`git diff -- ${files.join(" ")}\` e \`git status --porcelain\`; se não houver git, diga isso em \`summary\`.`),
      bullet(`Projeto: ${config.project?.name || "ver AGENTS.md"}. Leia \`AGENTS.md\` e as regras em \`.claude/rules/\`.`),
      task.doc ? bullet(`Documento da tarefa: \`${task.doc}\`.`) : null,
    ]),
    heading("CRITÉRIOS DE ACEITE", task.acceptance.map((item, index) => `${index + 1}. ${item}`)),
    heading("CHECAGENS JÁ EXECUTADAS PELO COORDENADOR", checks.length ? checks.map((check) => bullet(`\`${check.name}\`: ${check.passed ? "passou" : "falhou"}`)) : ["Nenhuma."]),
    heading("PROTOCOLO DE CONCLUSÃO", [
      "Termine sua resposta final com **exatamente um** bloco `agent-kit-review` em JSON:",
      "",
      reviewExample(),
      "",
      bullet("`approved` só sem achados `blocker` ou `high`. Achados `medium`/`low` podem acompanhar uma aprovação."),
      bullet("`rejected` precisa de achados concretos: arquivo, linha, o que está errado e por quê."),
      bullet("Não declare nada que você não verificou."),
      completionNote ? bullet(completionNote.replace("agent-kit-report", "agent-kit-review")) : null,
    ]),
  ];
  return `${sections.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n")}\n`;
}
