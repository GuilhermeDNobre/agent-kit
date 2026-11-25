---
description: Confirma o runtime pela sessão atual (Orca ou T3), escolhe os modelos secundários por perfil (fast, standard, advanced, validator), verifica que respondem, prepara o projeto do Linear e grava em .agent-kit/config.json. Rodado pelo coordenador na primeira sessão.
---

> **Executado por:** coordenador (Claude Opus), na worktree atual.
> **Quando:** na primeira sessão (o `CLAUDE.md` traz o aviso `WORKER-SETUP`), ao mudar de runtime
> (abriu o projeto no T3 depois de usar no Orca, ou o contrário), ou para trocar modelos ou tracker.

---

O coordenador é sempre o agente principal. Este comando define **onde** os workers rodam (o
runtime) e **quem faz o resto**: cada papel do pipeline (`roles` em `.agent-kit/config.json`) aponta
para um perfil, e cada perfil aponta para um provider/agente e um modelo.

<critical>O runtime é o da sessão em que este comando roda: terminal do Orca → `orca`; sessão do T3 Code → `t3`; qualquer outro terminal → `orca`</critical>
<critical>NÃO ESCOLHA os modelos pelo usuário. Liste o que existe e pergunte, com uma recomendação</critical>
<critical>Nunca grave um identificador de modelo que não apareceu na listagem real do runtime nesta sessão</critical>
<critical>Nada é gravado sem um teste real: o modelo precisa responder antes de virar configuração</critical>

## 0. Runtime: a sessão é a fonte da verdade

1. Veja se esta sessão tem a ferramenta `orchestrator_capabilities` (ferramentas MCP do T3 Code).
2. Rode `agent-kit runtime detect` — acrescente `--t3-tools` se a ferramenta existe. A saída traz
   `runtime`, `evidence` e `configured` (o que está em `.agent-kit/config.json`).
3. Se `matches` for `false`, rode `agent-kit runtime set <runtime>`: atualiza `config.json`, o import
   do guia em `CLAUDE.md` e a rota do Linear (`tracker.linear.via`). Avise o usuário da troca e da
   evidência, e siga com a seção do runtime detectado. Não pergunte: a sessão decide.

## 1. Listar e perguntar

### T3 Code

1. Chame `orchestrator_capabilities`. Anote, para cada provider com `canRunChildTask: true`, o
   `providerInstanceId`, os modelos (`id`) e as opções de cada modelo (ex.: `effort`,
   `thought_level`).
2. Se o provider desejado estiver desabilitado, diga isso ao usuário: ele habilita nas configurações
   do T3. Não troque de provider por conta própria.

### Orca

1. Agentes: o `--agent` do `orca orchestration worker-start` aceita os ids de agente do Orca
   (`orca orchestration worker-start --help` lista os conhecidos: `antigravity`, `claude`, `codex`,
   `cursor`, `opencode`, …). Pergunte quais o usuário tem instalados e logados.
2. Modelos: liste com a ferramenta do agente (tabela abaixo). `--model` vale para Claude, Codex,
   Cursor, Antigravity, Grok e Muse; outros agentes usam o modelo da própria configuração — nesse
   caso grave `options.agentDefaultModel: true` e `model: null`.

| Agente | Listar modelos |
|---|---|
| `antigravity` | `agy models` |
| `opencode` | `opencode models <provider> --verbose` |
| `codex` | documentação do provedor |
| `claude` | `claude --help` |

### Perguntas (ambos os runtimes)

Faça as perguntas de uma vez, com opções (use a ferramenta de perguntas se houver):

1. **Modelo por perfil**, com sua recomendação a partir da listagem:
   - `fast` — docs, boilerplate, mudanças mecânicas (o mais barato e rápido);
   - `standard` — implementação do dia a dia;
   - `advanced` — debugging difícil e tarefas complexas (o mais capaz);
   - `validator` — gates de QA, sistema, UI/UX, segurança e product owner. Precisa ser diferente
     do modelo que implementa, para a validação ser independente.
2. **Opções** de cada modelo (esforço / nível de raciocínio). No Orca, o esforço vira `--effort`.
3. **Papéis no coordenador**: confirme que `pm`, `architect` e `release` ficam em `coordinator` e
   se algum gate deve rodar no coordenador (ex.: `qa` quando só o coordenador tem browser).
4. **Limite de uso**: se o plano do provider tiver cota (por hora, dia ou semana), qual é — ajuste
   `maxWorkers` em `.agent-kit/autonomy.json` de acordo.
5. **Só no Orca — workspace dos workers**: `current` (padrão: todos na worktree atual; o scheduler
   já impede dois workers no mesmo arquivo) ou `new-child` (uma worktree filha por tarefa; o
   trabalho precisa ser integrado antes da revisão). Grave em `runtimes.orca.worktree`.
6. **Tracker**: `local` ou `linear` (seção 3).

## 2. Verificar os modelos

- **T3:** para cada modelo, um `delegate_task` com `mode: "wait"`, `role: "general"`, o `target`
  do perfil e a tarefa `Reply with one word: ready`. Aprovado só se o resultado voltar com a palavra.
- **Orca:** para cada perfil, um worker de teste na worktree atual:
  `orca orchestration worker-start --environment local --spec "Reply with one word: ready, then send worker_done." --task-title "agent-kit smoke <perfil>" --agent <agente> [--model <modelo>] [--effort <nível>] --worktree current --json`.
  Anote o `dispatch_id` e **encerre o turno**: o Orca acorda você com o `worker_done`. Aprovado só
  se o corpo trouxer a palavra. Se o `worker-start` falhar, não repita: leia `failedStage`, mostre o
  erro e não grave aquele perfil.

## 3. Linear: um projeto só deste repositório

Com tracker `linear`, todas as issues deste repositório ficam num **projeto do Linear dedicado**,
isolado das tarefas de outros projetos. Nada é criado fora dele.

1. **Nome do projeto**: o padrão é o nome do projeto (`project.name` em `config.json`). Confirme
   com o usuário e grave em `tracker.linear.project.name`.
2. **Rota** (`tracker.linear.via`), igual ao runtime: `t3` no T3 (usa o Linear conectado ao projeto
   no T3, sem API key) e `orca` no Orca (usa o Linear conectado ao Orca, sem API key). `api` exige
   uma API key pessoal na variável de `tracker.linear.apiKeyEnv` e funciona nos dois.
3. **Time**: no Orca, `orca linear team list --json` lista os times; grave a `key` em
   `tracker.linear.teamKey` (obrigatório em `orca` e `api`).
4. **Garantir que o projeto existe**:
   - Orca: `orca linear project list --query "<nome>" --json`. Se não existir e a variável da API
     key estiver definida, o agent-kit cria o projeto sozinho no primeiro `wf new`. Sem a key, peça
     ao usuário para criar o projeto no Linear (time certo, nome exato) — o CLI do Orca não cria
     projetos — e confira de novo com `project list`.
   - T3: confirme que o projeto do Linear existe e que as issues criadas pelo `create_issue` caem
     nele (crie uma issue de teste só se o usuário quiser; caso contrário, registre que não foi
     testado).
   - API: o agent-kit procura o projeto pelo nome no time e o cria se não existir.
5. Grave o `id` do projeto em `tracker.linear.project.id` quando a listagem o mostrar.

## 4. Gravar

1. Em `.agent-kit/config.json`, para cada perfil:
   - T3: `provider` = `providerInstanceId`, `model` = `id`, `options` = opções escolhidas
     (ex.: `{ "thought_level": "high" }`);
   - Orca: `provider` = id do agente no Orca (ex.: `antigravity`), `model` = id verificado,
     `options.effort` = nível escolhido.
   Ajuste `roles` se o usuário pediu. Com Linear: `tracker.kind`, `tracker.linear.*` (seção 3).
2. `agent-kit validate` — precisa passar sem erros.
3. No `CLAUDE.md`, apague o bloco entre `<!--WORKER-SETUP-->` e `<!--/WORKER-SETUP-->`, marcadores
   incluídos.
4. Mostre ao usuário o runtime (com a evidência), o diff de `.agent-kit/config.json` e a data da
   escolha.

## Notas por agente (Orca)

Confirme na verificação; ferramentas mudam entre versões.

**Antigravity** — o primeiro lançamento numa pasta pode mostrar um prompt de confiança; o
`worker-show` indica um worker parado num prompt humano (`observation.agentWait`): resolva-o e o
worker segue.

**Claude Code como worker** — o brief já diz que ele segue `docs/agents/worker.md`, não o papel de
coordenador.

**opencode** — a seleção de modelo exige uma worktree existente e o CLI verificado no host; esforço
não é suportado.
