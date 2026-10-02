---
description: Ao fim de um PRD, transforma o que o ciclo ensinou em regras, ADRs, memória ou templates e gera o changelog. Rodado pelo Claude (orquestrador).
---

> **Executado por:** Claude (orquestrador), na worktree atual.
> **Não delegue este comando a um worker**: mexe em `CLAUDE.md`, `AGENTS.md` e `.claude/**`.
> Ver `CLAUDE.md` seção 1 (divisão de responsabilidades).
> Roda depois do QA **aprovado** de um PRD.

---

Você é o responsável pela memória institucional do projeto. O objetivo é que o próximo ciclo erre menos que
este, não por um modelo melhor, mas porque as lições viraram regra escrita.

<critical>Toda lição cita a evidência: o BUG-NN, o achado do review ou do QA, a correção do usuário</critical>
<critical>Não registre o que o código ou o git já registram (estrutura, histórico de fixes)</critical>
<critical>Nada é gravado sem o usuário aprovar a lista de lições</critical>

## Entrada

Slug: `tasks/prd-[slug]/`. Leia `bugs.md`, `qa-report.md`, `consistencia.md` (se houver), os relatórios de
review e as correções que o usuário fez durante o ciclo (na conversa e na memória).

## 1. Colher as lições

Para cada bug, achado de review ou correção do usuário, responda:

- **Por que não foi pego antes?** Em que etapa deveria ter sido (PRD, TechSpec, Tasks, consistência,
  brief, review, QA)?
- **Vai se repetir?** Se for um acidente isolado, descarte.

Agrupe as causas repetidas: três bugs com a mesma origem são uma lição só.

## 2. Escolher o destino de cada lição

| A lição é... | Vai para |
|---|---|
| Padrão de código que vale para todo o projeto | `.claude/rules/<arquivo>.md` |
| Decisão de arquitetura cara de reverter | nova ADR em `docs/adr/` (crie a pasta se não existir) |
| Termo de domínio novo ou corrigido | `CONTEXT.md` (crie se não existir) |
| Passo que faltou no processo | o comando em `.claude/commands/` ou o template em `.claude/templates/` |
| Algo que vale para todo agente (stack, comandos, convenções) | `AGENTS.md` |
| Algo que o worker precisa saber sempre | `docs/agents/worker.md` (e o `worker-brief-template.md`) |
| Fato do ambiente ou preferência do usuário | memória (um arquivo por fato, ponteiro no `MEMORY.md`) |
| Número ou comando desatualizado (contagem de testes, etc.) | `CLAUDE.md` |

Prefira **atualizar** um arquivo existente a criar outro. Respeite a precedência
`CLAUDE.md` > `AGENTS.md` > `.claude/rules/` e o idioma de cada arquivo (`AGENTS.md`, seção Idioma).

## 3. Propor e aplicar

Mostre ao usuário a tabela abaixo e espere a aprovação, item a item:

| # | Lição | Evidência | Destino | Mudança proposta (resumo) |
|---|---|---|---|---|

Aplique só os itens aprovados. Edições nesses arquivos são orquestração: o Claude faz direto, sem worker.

## 4. Changelog

Gere a entrada do ciclo a partir dos commits dele (`git log --oneline <primeiro-commit>^..HEAD`), em
português, agrupada em **Novidades**, **Correções** e **Melhorias**, escrita para quem usa a ferramenta, não
para quem a programa. Acrescente no topo de `CHANGELOG.md` (crie o arquivo se não existir).

## 5. Registro

Acrescente ao fim de `tasks/prd-[slug]/qa-report.md` uma seção `## Lições do ciclo` com a tabela aprovada e
os arquivos alterados.

## Checklist

- [ ] Bugs, review, QA e correções do usuário lidos
- [ ] Lições agrupadas por causa e com evidência
- [ ] Destinos escolhidos e aprovados pelo usuário
- [ ] Arquivos atualizados
- [ ] `CHANGELOG.md` atualizado
- [ ] Seção "Lições do ciclo" registrada

Commitar segue a regra do `CLAUDE.md` (só quando o usuário pedir).
