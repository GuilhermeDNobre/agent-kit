# Resumo de Tarefas de Implementação de [Funcionalidade]

## Tarefas

- [ ] 1.0 Título da Tarefa
- [ ] 2.0 Título da Tarefa
- [ ] 3.0 Título da Tarefa

## Plano de Execução

A coluna **Paralelizável** decide quantas worktrees e workers `agy` serão abertos.
Marque `sim` somente quando a tarefa não depende de nada pendente **e** não compartilha nenhum
arquivo com outra tarefa paralelizável. Na dúvida, `não`. Ver `CLAUDE.md` seção 3.

| Tarefa | Depende de | Arquivos que toca | Paralelizável |
|---|---|---|---|
| 1.0 | nenhuma | [caminhos] | sim / não |
| 2.0 | 1.0 | [caminhos] | não |
| 3.0 | nenhuma | [caminhos] | sim / não |

## Ondas de Execução

Agrupe as tarefas na ordem em que serão despachadas. Cada onda roda em paralelo; a próxima só
começa quando a anterior for revisada e aprovada.

- **Onda 1 (paralela):** [1.0, 3.0]
- **Onda 2 (sequencial):** [2.0]
