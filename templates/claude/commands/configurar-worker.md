---
description: Pergunta qual agente e modelo serão o worker, verifica que rodam e grava a receita de lançamento no CLAUDE.md. Rodado pelo Claude (orquestrador) na primeira sessão.
---

> **Executado por:** Claude (orquestrador), na worktree atual.
> **Quando:** na primeira sessão do projeto (o `CLAUDE.md` traz o aviso `WORKER-SETUP`), ou quando
> o usuário quiser trocar a ferramenta ou o modelo do worker.

---

Você configura quem implementa as tarefas. O kit não fixa ferramenta nem modelo: isso é decisão do
usuário, tomada aqui, e o resultado fica gravado na seção 2 do `CLAUDE.md`.

<critical>NÃO ESCOLHA a ferramenta nem o modelo pelo usuário. Pergunte.</critical>
<critical>Nada é gravado sem um teste real: o modelo precisa responder antes de virar receita</critical>

## 1. Perguntar

Faça as perguntas de uma vez, com opções (use a ferramenta de perguntas se houver):

1. **Ferramenta do worker:** opencode, Antigravity (`agy`), Codex CLI, Claude Code em outro
   terminal, outra (qual?), ou **nenhuma** (o Claude implementa sozinho, sem workers).
2. **Modelo:** antes de perguntar, liste os disponíveis na ferramenta escolhida (tabela abaixo) e
   ofereça os mais indicados, com custo e janela de contexto quando a ferramenta informar.
3. **Esforço / variante:** se o modelo tiver variantes de raciocínio, qual usar (sugira a mais alta).
4. **Limite de gasto:** se o plano da ferramenta tiver teto (por hora, semana ou mês), qual é, para
   o Claude vigiar.

## 2. Verificar

Rode e observe a saída de cada passo. Se um falhar, mostre o erro ao usuário e não grave nada.

| Ferramenta | Listar modelos | Teste headless | MCP do worker |
|---|---|---|---|
| opencode | `opencode models <provider> --verbose` | `opencode run -m <model> [--variant <v>] "Reply with one word: ready"` | `opencode mcp list` |
| agy | `agy models` | `agy -p "Reply with one word: ready"` | `agy mcp list` |
| codex | `codex --help` (modelos pela doc do provedor) | `codex exec -m <model> "Reply with one word: ready"` | config do Codex |
| claude | `claude --help` | `claude -p --model <model> "Reply with one word: ready"` | `claude mcp list` |
| outra | peça ao usuário o comando | peça ao usuário o comando | peça ao usuário |

Depois, abra um terminal Orca real com o comando de lançamento e confirme a prontidão
(`orca terminal read`): a TUI precisa mostrar o modelo (e a variante) escolhidos. Feche esse
terminal de teste.

## 3. Gravar

1. No `CLAUDE.md`, substitua o conteúdo entre `<!--WORKER-RECIPE-->` e `<!--/WORKER-RECIPE-->` por:
   - ferramenta, modelo, variante e a data da escolha;
   - o **comando de lançamento** exato para `orca terminal create --command`;
   - a **checagem de prontidão**: o que a cauda do `terminal read` mostra quando a TUI está pronta;
   - se o worker tem MCP (normalmente não);
   - o teto de gasto e como acompanhá-lo;
   - as notas da ferramenta (abaixo) que se confirmaram.
2. Apague o bloco inteiro entre `<!--WORKER-SETUP-->` e `<!--/WORKER-SETUP-->`, marcadores incluídos.
3. Se a escolha foi **nenhuma**: grave na receita que não há worker, troque `worker` por `Claude` nas
   linhas `/executar-task` e `/executar-bugfix` da tabela do pipeline, e diga na seção 1 que o Claude
   implementa diretamente, mantendo o review com `/executar-review` sobre o próprio diff.
4. Mostre o diff ao usuário.

## Notas conhecidas por ferramenta

Use como ponto de partida e confirme na verificação; ferramentas mudam entre versões.

**opencode**
- Lançamento: `opencode --model <provider>/<model> --auto`.
- A variante **não** é flag da TUI (`--variant` só existe no `opencode run`; na TUI imprime a ajuda e
  sai). Ela fica fixada por modelo em `~/.local/state/opencode/model.json`, chave `variant`. Sem isso
  a TUI sobe sem variante, no esforço padrão do provedor.
- Pronto quando a linha de status mostra o modelo e termina em `· <variante>`.
- Modelos marcados `contributor` exigem opt-in de coleta de dados na conta; sem ele toda requisição
  falha, mas a TUI sobe e a linha de status parece certa. Só o teste headless pega isso.
- A barra de status mostra contexto e custo acumulado; `opencode stats` dá o total.

**Antigravity (`agy`)**
- Lançamento: `agy --model <model> --dangerously-skip-permissions`.
- Pronto quando a cauda mostra o banner seguido de um prompt `>` vazio. Não use
  `terminal wait --for tui-idle`: nunca é satisfeito.
- O primeiro lançamento numa pasta mostra um prompt de confiança (persiste por pasta).
- Suba um worker por vez: um segundo `agy` pode morrer enquanto outro inicia ou se atualiza. Se o
  banner travar por ~2 min, feche e relance.

**Codex CLI / Claude Code como worker**
- Descubra o comando interativo e a checagem de prontidão na própria verificação, e grave o que viu.
- Um Claude Code worker lê o `AGENTS.md`/`CLAUDE.md` do repositório: o brief precisa dizer
  explicitamente que ele segue `docs/agents/worker.md`, não o papel de orquestrador.
