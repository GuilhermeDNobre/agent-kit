---
description: Retoma um run interrompido reconciliando cada tentativa em andamento com o runtime antes de redespachar. Rodado pelo coordenador.
---

> **Executado por:** coordenador.
> **Quando:** depois de uma sessão encerrada, reinício da máquina, queda do runtime, ou ao trocar de
> runtime (ex.: começou no Orca, continua no T3).

---

<critical>Um timeout não prova que o worker morreu. Consulte o runtime antes de redespachar</critical>
<critical>Nunca despache de novo uma tarefa cujo worker ainda pode estar rodando</critical>

1. `agent-kit wf list` → escolha o run (ou use o id informado).
2. `agent-kit wf resume <run>` e trate cada grupo da saída:

| Grupo | Ação |
|---|---|
| `reconcile` | Execute a `call` de status impressa (uma vez por tarefa). Terminado → registre com `wf report`. Ainda rodando → `wf touch <run> <task> --note "..."`. Morto ou desconhecido → cancele no runtime e `wf lost <run> <task> --reason "<evidência>"` |
| `redispatchSameKey` | `agent-kit wf dispatch <run> <task>` devolve a mesma chamada com a mesma `clientRequestId`; o runtime deduplica |
| `foreign` | Tentativa iniciada em outro runtime: verifique lá (ou os arquivos no disco). Se não houver como recuperar, `wf lost` com a evidência |
| `gates` | Gates em andamento: consulte o status pela `call`; terminado → `wf review --gate ... --file ...` |

3. Com tracker `linear` (`via: "api"`) e sem `.agent-kit/runs/<run>/` nesta máquina, recrie o run a
   partir do Linear: `agent-kit wf new <run> --from-linear <ISSUE-ID>` (tarefas concluídas no Linear
   entram como concluídas). Com `via: "t3"` a importação não está disponível: retome a partir do run
   file (commite `.agent-kit/runs/` se precisar trocar de máquina).
4. `agent-kit wf sync <run>` se houver eventos pendentes para o tracker (com `via: "t3"`, execute as
   chamadas impressas e confirme com `--ack`).
5. Continue pelo passo 5 de `/executar-workflow`.
