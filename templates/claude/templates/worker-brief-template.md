# Brief de Worker

> Escrito pelo **Claude (orquestrador)** e enviado como `--spec` em
> `orca orchestration task-create`. Ver `CLAUDE.md` seção 2.
>
> Um brief sem critérios de aceite verificáveis não pode ser despachado. "Implemente
> autenticação" é um brief inválido.

---

## OBJETIVO

[Uma frase declarando o entregável. O que deve existir ao final que não existe agora.]

## CONTEXTO

- Worktree: [caminho absoluto]
- Branch: [nome]
- Comando invocado: [`/executar-task` ou `/executar-bugfix`]
- Documentos a ler antes de começar:
  - `CLAUDE.md`
  - `AGENTS.md`
  - `.claude/rules/README.md` e as regras aplicáveis
  - [`tasks/prd-<feature>/prd.md`, `techspec.md`, `<num>_task.md` ou `bugs.md`, conforme o caso]
- Estado relevante do projeto: [o que já existe, o que não existe, decisões ainda em aberto]

## RESTRIÇÕES

- Modificar exatamente estes arquivos: [lista explícita]
- Não criar, mover ou remover nenhum outro arquivo ou diretório
- Não commitar, não fazer stage, não fazer push, não trocar de branch
- Não escolher linguagem, framework, gerenciador de pacotes ou ferramenta de testes
- Não inventar comandos, dependências, caminhos ou saídas de teste que não existam
- [Restrições específicas desta tarefa]

## ARQUIVOS ENVOLVIDOS

- Ler: [caminhos]
- Escrever: [caminhos]

## CRITÉRIOS DE ACEITE

[Lista numerada de condições verificáveis. Cada item precisa ser checável por um comando ou pela
leitura de um arquivo — nada subjetivo.]

1. [Critério]
2. [Critério]

## VALIDAÇÃO

[Comandos exatos a executar antes de reportar, com a instrução de citar a saída real observada.
Se um comando ainda não existir no projeto, diga explicitamente "não executável ainda" em vez de
listá-lo.]

1. `[comando]`
2. `[comando]`
3. Reler os arquivos modificados por inteiro e conferir cada critério de aceite

## REPORTE

Ao terminar, envie `worker_done` exatamente uma vez, com `--outcome succeeded` ou
`--outcome failed`, listando: o que foi feito, a saída de validação realmente observada, e o que
ficou de fora e por quê.

Itens parciais ou não implementados devem ser declarados explicitamente. Não reporte sucesso com
itens faltando.
