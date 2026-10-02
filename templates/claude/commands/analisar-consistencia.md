---
description: Cruza PRD, TechSpec e Tasks antes do despacho e aponta lacunas e contratos soltos. Rodado pelo Claude (orquestrador).
---

> **Executado por:** Claude (orquestrador), na worktree atual.
> **Não delegue este comando a um worker**: decide se o plano está pronto para despachar.
> Ver `CLAUDE.md` seção 1 (divisão de responsabilidades).
> Roda **depois** de `/criar-tasks` e **antes** do primeiro `/executar-task`.

---

Você é um revisor de planejamento. Sua tarefa é provar, artefato contra artefato, que o PRD, a TechSpec
e as Tasks contam a mesma história, e que nenhum worker vai precisar adivinhar um contrato.

<critical>NÃO IMPLEMENTE NADA e NÃO REESCREVA os artefatos sem aprovação do usuário</critical>
<critical>Cada achado cita o trecho exato dos dois lados (arquivo e seção), nunca uma paráfrase</critical>
<critical>Requisito sem task é lacuna, não "fica para depois" (`AGENTS.md`, "The spec is the request")</critical>

## Entrada

Slug da funcionalidade: `tasks/prd-[slug]/`. Arquivos lidos:

- `prd.md`, `techspec.md`, `tasks.md` e todos os `itemized-tasks/*_task.md`
- `.claude/rules/` e, quando existirem, o glossário de domínio (`CONTEXT.md`) e as ADRs (`docs/adr/`) citadas pela TechSpec

## Verificações

### 1. Rastreabilidade (PRD → Tasks)

Monte a matriz requisito × task. Cada requisito funcional numerado do PRD precisa de pelo menos uma task
que o entregue **e** de um teste nessa task que o prove.

| Requisito | Task(s) | Teste que prova | Status |
|---|---|---|---|
| F1 | 3.0, 7.0 | `revisao.page.spec.tsx` | OK / LACUNA |

### 2. Cobertura técnica (TechSpec → Tasks)

Todo endpoint, migration, fila, componente e porta da TechSpec tem uma task dona. Nenhuma task cria algo que
a TechSpec não prevê.

### 3. Contratos entre tasks paralelas

Para cada par de tasks marcadas como paralelizáveis:

- [ ] Não tocam os mesmos arquivos (inclua `api-client.ts`, schemas compartilhados e migrations)
- [ ] Todo contrato que uma consome e a outra produz está **fixado por escrito** na TechSpec: rota,
      método, status (200/202/404/422), corpo da resposta com nomes de campo e tipos
- [ ] A ordem de migrations não colide (dois `00NN` iguais)

Um contrato solto entre duas tasks paralelas é o bug mais comum que só aparece no QA: cada worker adivinha um formato diferente.

### 4. Conformidade com as invariantes

- [ ] Nenhuma decisão contradiz uma ADR vigente (ignore as supersedidas, que trazem banner)
- [ ] Termos de domínio usados como no glossário (`CONTEXT.md`), se existir
- [ ] Nada no plano exige o que o `AGENTS.md` ou o `CLAUDE.md` proíbem

### 5. Executabilidade das tasks

Cada `_task.md` tem: arquivos relevantes explícitos, critérios de sucesso verificáveis, comandos de validação
exatos, menção ao lock de banco quando toca integração ou E2E, e a seção de reporte.

### 6. Ambiguidades

Liste toda frase do PRD ou da TechSpec que admite duas leituras e que mudaria o código. Cada uma vira uma
pergunta ao usuário, nunca uma escolha silenciosa.

## Relatório

Salve em `tasks/prd-[slug]/consistencia.md`:

```
# Análise de Consistência - [Funcionalidade]

## Resumo
- Data: [AAAA-MM-DD]
- Veredito: PRONTO PARA DESPACHAR / AJUSTAR ANTES / VOLTAR AO PRD
- Lacunas: [N] · Contratos soltos: [N] · Conflitos com ADR: [N] · Ambiguidades: [N]

## Matriz de rastreabilidade
[tabela da verificação 1]

## Achados
| ID | Severidade | Tipo | Onde (arquivo § seção) | Achado | Ajuste proposto |
|----|------------|------|------------------------|--------|-----------------|
| C-01 | Blocker/High/Medium/Low | lacuna/contrato/adr/executabilidade/ambiguidade | ... | ... | ... |

## Perguntas ao usuário
1. [...]
```

Severidade segue a mesma escala do `/executar-review`. Blocker ou High impede o despacho.

## Ação após a análise

1. Mostre o veredito, os achados Blocker/High e as perguntas ao usuário.
2. Com a aprovação dele, aplique os ajustes nos artefatos de `tasks/**` (são documentos de orquestração,
   o Claude pode editá-los) e rode a análise de novo até o veredito ser PRONTO PARA DESPACHAR.
3. Só então despache os workers.

<critical>NÃO DESPACHE NENHUM WORKER COM ACHADO BLOCKER OU HIGH ABERTO</critical>
