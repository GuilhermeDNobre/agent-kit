---
description: Decompõe PRD e Tech Spec em tarefas incrementais, marcando as paralelizáveis. Rodado pelo Claude (orquestrador).
---

> **Executado por:** Claude (orquestrador), na worktree atual.
> **Não delegue este comando a um worker** — decomposição de tarefas e planejamento de paralelismo.
> Ver `CLAUDE.md` seção 1 (divisão de responsabilidades).

---

Você é um assistente especializado em gerenciamento de projetos de desenvolvimento de software. Sua tarefa é criar uma lista detalhada de tarefas baseada em um PRD e uma Tech Spec para uma funcionalidade específica.

<critical>**ANTES DE GERAR QUALQUER ARQUIVO ME MOSTRE A LISTA DAS TASKS HIGH LEVEL PARA APROVAÇÃO**</critical>
<critical>NÃO IMPLEMENTE NADA</critical>
<critical>CADA TAREFA DEVE SER UM ENTREGÁVEL FUNCIONAL E INCREMENTAL</critical>
<critical>É FUNDAMENTAL QUE PARA CADA TAREFA EXISTA UM CONJUNTO DE TESTES QUE GARANTA O SEU FUNCIONAMENTO E OBJETIVO DE NEGÓCIO</critical>

## Pré-requisitos

A funcionalidade em que você trabalhará é identificada por este slug:

- PRD requerido: `tasks/prd-[nome-funcionalidade]/prd.md`
- Tech Spec requerido: `tasks/prd-[nome-funcionalidade]/techspec.md`

## Etapas do Processo

<critical>**ANTES DE GERAR QUALQUER ARQUIVO ME MOSTRE A LISTA DAS TASKS HIGH LEVEL PARA APROVAÇÃO**</critical>

1. **Analisar PRD e Tech Spec**

- Extrair requisitos e decisões técnicas
- Identificar componentes principais

2. **Gerar Estrutura de Tarefas**

- Organizar sequenciamento
- **Cada tarefa deve ser um entregável funcional**
- **Todas as tarefas devem ter o seu próprio conjunto de testes de unidade e integração**

3. **Gerar Arquivos de Tarefas Individuais**

- Criar arquivo para cada tarefa principal
- Detalhar subtarefas e critérios de sucesso
- Detalhar os testes de unidade e integração

## Diretrizes de Criação de Tarefas

- Agrupar tarefas por entregável lógico
- Ordenar tarefas logicamente, com dependências antes de dependentes (ex: backend antes do frontend, backend e frontend antes dos testes E2E)
- Tornar cada tarefa principal independentemente completável
- Definir escopo e entregáveis claros para cada tarefa
- Incluir testes como subtarefas dentro de cada tarefa principal

## Especificações de Saída

### Localização dos Arquivos

- Pasta da funcionalidade: `./tasks/prd-[nome-funcionalidade]/`
- Template para a lista de tarefas: `./.claude/templates/tasks-template.md`
- Lista de tarefas: `./tasks/prd-[nome-funcionalidade]/tasks.md`
- Template para cada tarefa individual: `./.claude/templates/task-template.md`
- **Crie sempre a pasta** `./tasks/prd-[nome-funcionalidade]/itemized-tasks/`
- Tarefas individuais: `./tasks/prd-[nome-funcionalidade]/itemized-tasks/[num]_task.md`

<critical>Os arquivos `[num]_task.md` vão SEMPRE dentro de `itemized-tasks/`, nunca soltos na pasta da funcionalidade. O `prd.md`, o `techspec.md` e o `tasks.md` ficam um nível acima, na raiz da funcionalidade.</critical>

Como os briefs passam a viver um nível abaixo, todo caminho relativo escrito dentro deles aponta
para `../` ao referenciar `prd.md`, `techspec.md` ou `tasks.md`.

### Formato do Resumo de Tarefas (tasks.md)

- **SEGUIR ESTRITAMENTE O TEMPLATE EM `./.claude/templates/tasks-template.md`**

### Formato de Tarefa Individual ([num]_task.md)

- **SEGUIR ESTRITAMENTE O TEMPLATE EM `./.claude/templates/task-template.md`**

## Diretrizes Finais

- Assuma que o leitor principal é um worker sem contexto prévio do projeto (seja explícito)
- **Evite criar mais de 10 tarefas** (agrupe conforme definido anteriormente)
- Use o formato X.0 para tarefas principais, X.Y para subtarefas

## Marcação de Paralelismo (Obrigatório)

Esta marcação decide quantas worktrees e workers serão abertos, então precisa ser precisa.

Para cada tarefa principal, registre no `tasks.md`:

- **Depende de:** lista de tarefas que precisam terminar antes, ou `nenhuma`
- **Arquivos:** os arquivos e diretórios que a tarefa vai tocar
- **Paralelizável:** `sim` apenas se as duas condições valerem:
  1. Não depende de nenhuma tarefa ainda não concluída
  2. Não compartilha **nenhum** arquivo com outra tarefa marcada como paralelizável

Duas tarefas que tocam o mesmo arquivo **nunca** são paralelizáveis, mesmo sem dependência lógica
entre elas — elas seriam executadas em worktrees diferentes e o conflito só apareceria na
integração.

Na dúvida, marque `não`. Serializar custa tempo; paralelizar errado custa retrabalho.

Após completar a análise e gerar todos os arquivos necessários, apresente os resultados ao usuário e aguarde confirmação para prosseguir com a implementação.

<critical>NÃO IMPLEMENTE NADA, O FOCO DESSA ETAPA É NA LISTA E NO DETALHAMENTO DAS TAREFAS</critical>
