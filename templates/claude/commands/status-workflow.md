---
description: Mostra o estado de um run do agent-kit - tarefas, gates, bloqueios e o que falta para concluir. Rodado pelo coordenador.
---

> **Executado por:** coordenador. Somente leitura — não despacha nem altera nada.

---

1. Sem id informado: `agent-kit wf list` e use o run mais recente que não esteja `completed`.
2. `agent-kit wf status <run>` e `agent-kit wf next <run>`.
3. Responda ao usuário, em poucas linhas:
   - estado do run e objetivo;
   - tabela de tarefas: id, título, estado, tentativas, perfil, issue do tracker;
   - gates pendentes, aprovados e em andamento;
   - bloqueios e falhas com o motivo registrado;
   - o que `completion.missing` diz que falta para concluir;
   - eventos não sincronizados com o tracker, se houver (`agent-kit wf sync <run>` resolve).

<critical>Não invente estado: tudo vem da saída dos comandos acima</critical>
