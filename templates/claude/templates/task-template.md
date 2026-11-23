# Tarefa X.0: [Título da Tarefa]

<critical>Ler os arquivos `../prd.md` e `../techspec.md` (um nível acima desta pasta), se você não ler esses arquivos sua tarefa será invalidada</critical>
<critical>Ler também `AGENTS.md`, `docs/agents/worker.md` e `.claude/rules/README.md` antes de começar</critical>

## Execução

| Campo | Valor |
|---|---|
| Executada por | worker |
| Depende de | [tarefas anteriores, ou `nenhuma`] |
| Paralelizável | sim / não |
| Worktree | [nome da worktree, ou `atual`] |

## Visão Geral

[Breve descrição da tarefa]

<requirements>
[Lista de requisitos obrigatórios]
</requirements>

## Subtarefas

- [ ] X.1 [Descrição da subtarefa]
- [ ] X.2 [Descrição da subtarefa]

## Detalhes de Implementação

[Seções relevantes da spec técnica **NÃO PRECISA MOSTRAR TODA A IMPLEMENTAÇÃO, APENAS REFERENCIE A techspec.md**]

## Critérios de Sucesso

- [Resultados mensuráveis]
- [Requisitos de qualidade]

## Testes da Tarefa

- [ ] Testes de unidade
- [ ] Testes de integração

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>
<critical>Se o comando de testes ainda não existir no projeto, registre "não executável ainda" — nunca invente saída de teste</critical>

## Arquivos relevantes

[Lista explícita dos arquivos desta tarefa — a mesma do campo `files` no `plan.json`. O worker não
pode tocar em nenhum outro.]

## Reporte

Ao terminar, encerre com o bloco `agent-kit-report` (`docs/agents/worker.md` seção 4), citando a
saída de validação realmente observada e o que ficou de fora. Depois pare: não commite e não inicie
trabalho novo.
