# Tarefa X.0: [Título da Tarefa]

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>
<critical>Ler também `AGENTS.md` e `.claude/rules/README.md` antes de começar</critical>

## Execução

| Campo | Valor |
|---|---|
| Executada por | worker `agy` |
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

[Lista explícita dos arquivos desta tarefa. O worker não pode tocar em nenhum outro, com a única
exceção de marcar a tarefa como concluída no `tasks.md`.]

## Reporte

Ao terminar, envie `worker_done` uma única vez com `--outcome succeeded` ou `--outcome failed`,
citando a saída de validação realmente observada e o que ficou de fora. Depois pare: não commite,
não feche o terminal e não inicie trabalho novo. Ver `AGENTS.md` seção 3.
