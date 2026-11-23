---
description: Executa um objetivo de ponta a ponta de forma autônoma - spec, plano, implementação delegada, gates de validação, correções e aceite. Rodado pelo coordenador.
---

> **Executado por:** coordenador (Claude Opus).
> **Entrada:** o objetivo em linguagem natural, ex.: "Implemente autenticação com cadastro, login,
> recuperação de senha, testes e documentação".
> Ver `CLAUDE.md` seções 1 a 9 e o guia do runtime em `.agent-kit/runtime/`.

---

Você conduz o objetivo até um resultado verificado e aceito, **sem pedir aprovação em etapas
normais**. Autonomia é o padrão; pergunte ao usuário apenas nas categorias de
`escalation.askUserFor` em `.agent-kit/autonomy.json`.

<critical>Nunca declare uma tarefa concluída sem `agent-kit wf verify` e os gates aprovados</critical>
<critical>Ações protegidas (deploy, publicação, push, exclusão de dados, credenciais) exigem ordem explícita do usuário — a release não faz parte deste comando</critical>
<critical>Não pare depois de planejar: execute o plano até `agent-kit wf complete` passar ou um limite configurado ser atingido</critical>

## 0. Preparação

1. `agent-kit validate` — se falhar, corrija `.agent-kit/*.json` (são artefatos de orquestração).
2. Se o `CLAUDE.md` ainda tiver o aviso `WORKER-SETUP`, rode `/configurar-worker` antes de despachar.
   O planejamento pode avançar enquanto isso.
3. Escolha um slug curto para a funcionalidade e um id de run (ex.: `auth-2026-11-23`).
4. Se já existir um run ativo para esse objetivo (`agent-kit wf list`), use `/retomar-workflow`.

## 1. Entender

Leia `AGENTS.md`, `docs/adr/`, `CONTEXT.md`, `tasks/` existentes e o código que o objetivo toca.
Anote stack, convenções, comandos de validação reais e restrições.

## 2. Spec — papel `pm`

Rode `/criar-prd` em **modo autônomo**: sem rodada de perguntas; cada lacuna vira uma premissa
razoável e reversível registrada em `tasks/prd-<slug>/assumptions.md` (o que foi assumido, por quê,
como reverter). Pergunte somente se for decisão de produto/negócio que não dá para inferir com
segurança.

## 3. Plano — papel `architect`

1. `/criar-techspec` em modo autônomo (mesmas regras de premissas). Contratos entre partes que vão
   rodar em paralelo ficam escritos campo a campo.
2. `/criar-tasks` em modo autônomo: gera `tasks.md`, `itemized-tasks/` e **`plan.json`**.
3. `agent-kit validate --plan tasks/prd-<slug>/plan.json` — corrija até passar.
4. `/analisar-consistencia` em modo autônomo — corrija os documentos até não haver achado Blocker ou
   High.

## 4. Iniciar o run

```bash
agent-kit wf new <run> --plan tasks/prd-<slug>/plan.json --objective "<objetivo>"
```

Com tracker `linear`, isso cria a issue pai e as sub-issues. Para executar um backlog que já está
no Linear: `agent-kit wf new <run> --from-linear <ISSUE-ID>`.

## 5. Loop de execução

Repita até `wf next` não ter mais nada a fazer:

```bash
agent-kit wf next <run>
```

| Campo | Ação |
|---|---|
| `dispatch` | Para cada id: `agent-kit wf dispatch <run> <task>`, execute a `call` como o guia do runtime manda, depois `agent-kit wf started <run> <task> --ref <id>` |
| `awaitingChecks` | `agent-kit wf verify <run> <task>` |
| `awaitingReview[].ready` | Para cada gate: `agent-kit wf gate <run> <task> <gate>` e execute a `call` (ou rode o gate você mesmo se o perfil for `coordinator`), depois `agent-kit wf started <run> <task> --gate <gate> --ref <id>` |
| `overdue` / `unconfirmed` | Seção "Overdue" / "Resume" do guia do runtime |
| `blocked` | Resolva o bloqueio e `agent-kit wf unblock <run> <task> --resolution "..."` |
| `failed` | Siga `escalation.onBudgetExhausted` (`CLAUDE.md` seção 7) |

Despache tudo o que `wf next` oferecer antes de encerrar o turno; os resultados chegam pelo runtime.

Quando um agente terminar:

- **Implementação** → salve a resposta em `.agent-kit/runs/<run>/inbox/<task>.md` →
  `agent-kit wf report <run> <task> --file <arquivo>` → siga o `next` (normalmente `verify`).
- **Gate** → salve em `.agent-kit/runs/<run>/inbox/<task>.<gate>.md` →
  `agent-kit wf review <run> <task> --gate <gate> --reviewer <reviewer impresso pelo wf gate> --file <arquivo>`.
- `next: "redispatch"` → antes de redespachar, diagnostique a causa raiz e registre em
  `tasks/prd-<slug>/bugs.md`; o novo brief já leva os achados.

## 6. Integração

Quando nada estiver rodando:

1. `agent-kit wf verify <run> --final` — todos os checks do projeto.
2. Revise o diff completo do run (`git status --porcelain`, `git diff`) contra o PRD.
3. Se algo falhar, crie as tarefas de correção com `/replanejar-workflow` e volte ao passo 5.

## 7. Fechamento

1. `agent-kit wf complete <run>` — se recusar, ele lista o que falta; resolva e repita.
2. `/fechar-ciclo` em modo autônomo (lições registradas como proposta, sem aplicar mudanças em regras
   sem aprovação).
3. Relatório final ao usuário (`CLAUDE.md` seção 9), incluindo a release pendente da ordem dele.

<critical>Se você parar antes do fim, `agent-kit wf status <run>` precisa explicar o motivo, e o relatório ao usuário também</critical>
