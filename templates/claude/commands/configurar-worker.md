---
description: Escolhe os modelos secundários por perfil (fast, standard, advanced, validator), verifica que respondem e grava em .agent-kit/config.json. Rodado pelo coordenador na primeira sessão.
---

> **Executado por:** coordenador (Claude Opus), na worktree atual.
> **Quando:** na primeira sessão (o `CLAUDE.md` traz o aviso `WORKER-SETUP`), ou para trocar
> modelos, a receita do runtime ou o tracker.

---

O coordenador é sempre o agente principal. Este comando define **quem faz o resto**: cada papel do
pipeline (`roles` em `.agent-kit/config.json`) aponta para um perfil, e cada perfil aponta para um
provider e um modelo.

<critical>NÃO ESCOLHA os modelos pelo usuário. Liste o que existe e pergunte, com uma recomendação</critical>
<critical>Nunca grave um identificador de modelo que não apareceu na listagem real do runtime nesta sessão</critical>
<critical>Nada é gravado sem um teste real: o modelo precisa responder antes de virar configuração</critical>

<!--IF:runtime-t3-->
## 1. Listar (T3 Code)

1. Chame `orchestrator_capabilities`. Anote, para cada provider com `canRunChildTask: true`, o
   `providerInstanceId`, os modelos (`id`) e as opções de cada modelo (ex.: `effort`,
   `thought_level`).
2. Se o provider desejado estiver desabilitado, diga isso ao usuário: ele habilita nas configurações
   do T3. Não troque de provider por conta própria.

## 2. Perguntar

Faça as perguntas de uma vez, com opções (use a ferramenta de perguntas se houver):

1. **Modelo por perfil**, com sua recomendação a partir da listagem:
   - `fast` — docs, boilerplate, mudanças mecânicas (o mais barato e rápido);
   - `standard` — implementação do dia a dia;
   - `advanced` — debugging difícil e tarefas complexas (o mais capaz);
   - `validator` — gates de QA, sistema, UI/UX, segurança e product owner. Precisa ser diferente
     do modelo que implementa, para a validação ser independente.
2. **Opções** de cada modelo (esforço / nível de raciocínio).
3. **Papéis no coordenador**: confirme que `pm`, `architect` e `release` ficam em `coordinator` e
   se algum gate deve rodar no coordenador (ex.: `qa` quando só o coordenador tem browser).
4. **Limite de uso**: se o plano do provider tiver cota (por hora, dia ou semana), qual é — ajuste
   `maxWorkers` em `.agent-kit/autonomy.json` de acordo.
5. **Tracker**: `local` ou `linear`. Com Linear no T3, o padrão é `via: "t3"`: usa o Linear que o
   usuário conectou ao projeto no T3, sem API key (teste com `list_issues`). `via: "api"` exige a
   chave do time e uma API key pessoal numa variável de ambiente.

## 3. Verificar

Para cada modelo escolhido, faça um `delegate_task` de teste com `mode: "wait"`, `role: "general"`,
o `target` do perfil e a tarefa `Reply with one word: ready`. Considere aprovado só se o resultado
voltar com a palavra. Se falhar, mostre o erro e não grave aquele perfil.

Com tracker `linear` e `via: "t3"`: `list_issues` precisa devolver issues com `tracker: "linear"`.
Com `via: "api"`: confirme que a variável de ambiente da API key existe (sem imprimir o valor). Em
ambos, só crie issues de teste se o usuário quiser; caso contrário, registre que não foi testado.

## 4. Gravar

1. Em `.agent-kit/config.json`, para cada perfil: `provider` = `providerInstanceId`, `model` = `id`,
   `options` = opções escolhidas (ex.: `{ "thought_level": "high" }`). Ajuste `roles` se o usuário
   pediu. Com Linear: `tracker.kind`, `tracker.linear.teamKey`, `tracker.linear.apiKeyEnv`.
2. `agent-kit validate` — precisa passar sem erros.
3. No `CLAUDE.md`, apague o bloco entre `<!--WORKER-SETUP-->` e `<!--/WORKER-SETUP-->`, marcadores
   incluídos.
4. Mostre ao usuário o diff de `.agent-kit/config.json` e a data da escolha.
<!--END-->
<!--IF:runtime-orca-->
## 1. Perguntar (Orca)

Faça as perguntas de uma vez, com opções:

1. **Ferramenta do worker:** opencode, Antigravity (`agy`), Codex CLI, Claude Code em outro
   terminal, outra (qual?), ou **nenhuma** (o coordenador implementa sozinho).
2. **Modelo por perfil** (`fast`, `standard`, `advanced`, `validator`): liste os disponíveis na
   ferramenta (tabela abaixo) e recomende.
3. **Esforço / variante** de cada modelo.
4. **Limite de gasto** do plano da ferramenta, para ajustar `maxWorkers`.
5. **Tracker**: `local` ou `linear`.

## 2. Verificar

| Ferramenta | Listar modelos | Teste headless |
|---|---|---|
| opencode | `opencode models <provider> --verbose` | `opencode run -m <model> "Reply with one word: ready"` |
| agy | `agy models` | `agy -p --model <model> "Reply with one word: ready"` |
| codex | doc do provedor | `codex exec -m <model> "Reply with one word: ready"` |
| claude | `claude --help` | `claude -p --model <model> "Reply with one word: ready"` |

Depois, abra um terminal Orca real com o comando de lançamento e confirme a prontidão
(`orca terminal read`). Feche esse terminal de teste.

## 3. Gravar

1. `.agent-kit/config.json`: `runtimes.orca.launchCommand` (use `{model}` onde entra o modelo),
   `runtimes.orca.readiness` (o que a cauda do `terminal read` mostra quando a TUI está pronta), e
   `profiles.<perfil>.provider` = nome da ferramenta, `model` = id verificado.
2. Em `.agent-kit/runtime/orca.md`, substitua o conteúdo entre `<!--WORKER-RECIPE-->` e
   `<!--/WORKER-RECIPE-->` pela ferramenta, modelos, data, comando de lançamento, checagem de
   prontidão, MCP do worker (normalmente nenhum) e as notas confirmadas abaixo.
3. `agent-kit validate`, apague o bloco `WORKER-SETUP` do `CLAUDE.md` e mostre o diff.

## Notas conhecidas por ferramenta

Confirme na verificação; ferramentas mudam entre versões.

**opencode** — lançamento `opencode --model <provider>/<model> --auto`. A variante não é flag da
TUI; fica fixada por modelo em `~/.local/state/opencode/model.json`. Modelos `contributor` exigem
opt-in de coleta de dados — só o teste headless pega isso.

**Antigravity (`agy`)** — lançamento `agy --model <model> --dangerously-skip-permissions`. Pronto
quando a cauda mostra o banner e um prompt `>` vazio; não use `terminal wait --for tui-idle`. O
primeiro lançamento numa pasta mostra um prompt de confiança. Suba um worker por vez.

**Claude Code como worker** — o brief precisa dizer que ele segue `docs/agents/worker.md`, não o
papel de coordenador.
<!--END-->
