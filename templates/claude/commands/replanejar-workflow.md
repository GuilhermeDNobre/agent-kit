---
description: Replaneja um run bloqueado ou com falhas - ajusta tarefas, dependências e escopo preservando o que já foi concluído. Rodado pelo coordenador.
---

> **Executado por:** coordenador (papel `architect`).
> **Quando:** o run está `blocked`, uma tarefa esgotou o orçamento de tentativas, a verificação final
> falhou, ou o plano se mostrou errado.

---

<critical>Tarefas concluídas não são refeitas. Tarefas em andamento não podem ser removidas: cancele-as primeiro</critical>
<critical>Diagnostique a causa raiz antes de mudar o plano; replanejar sem diagnóstico repete a falha</critical>

1. `agent-kit wf status <run>` — leia os motivos de `failed` e `blocked` e os relatórios em
   `.agent-kit/runs/<run>/reports/`, `checks/` e `reviews/`.
2. Diagnostique cada problema e escolha uma ação:
   - **Tarefa grande demais** → divida em tarefas menores com arquivos disjuntos.
   - **Brief sem contexto** → acrescente `context` ou detalhe o `itemized-tasks/<n>_task.md`.
   - **Contrato ambíguo** → corrija a techspec e acrescente o contrato ao `context` das tarefas.
   - **Problema de modelo** → fixe `profile` na tarefa (ex.: `advanced`).
   - **Orçamento esgotado e a política é `coordinator-takeover`** → não replaneje: rode
     `agent-kit wf takeover <run> <task>`, implemente você mesmo seguindo o brief gerado, registre com
     `wf report` e siga para `wf verify` e os gates (validados por outro perfil). Se ainda assim
     falhar, o run pede decisão do usuário.
   - **Falha nos checks finais** → crie tarefas de correção com `dependsOn` adequado.
3. Edite `tasks/prd-<slug>/plan.json` (e `tasks.md` / `itemized-tasks/` para manter tudo coerente).
4. `agent-kit validate --plan tasks/prd-<slug>/plan.json`.
5. `agent-kit wf replan <run> --plan tasks/prd-<slug>/plan.json`. Tarefas `failed`/`blocked` que
   continuam no plano voltam com orçamento novo; tarefas removidas são canceladas; novas tarefas
   entram como `pending` (e viram sub-issues, com tracker `linear`).
6. Registre a mudança e o motivo em `tasks/prd-<slug>/assumptions.md`.
7. Volte ao passo 5 de `/executar-workflow`.
