---
description: Implementa uma tarefa do tasks.md e reporta worker_done. Rodado por um worker agy despachado via Orca.
---

> **Executado por:** worker `agy`, despachado pelo Claude via Orca (ver `CLAUDE.md` seção 2).
> Você recebe este comando dentro de um brief com `task_id` e `dispatch_id` injetados.
>
> Regras que valem do início ao fim:
> - Leia `AGENTS.md` e `.claude/rules/README.md` antes de começar.
> - Toque **somente** nos arquivos que o brief nomear.
> - **Nunca** commite, faça stage, push ou troque de branch.
> - **Nunca** escolha stack, framework, gerenciador de pacotes ou ferramenta de testes.
> - Se um comando de validação ainda não existir no projeto, diga isso — não invente saída.
> - Ao terminar, envie `worker_done` uma única vez e pare. O Claude revisa e fecha seu terminal.

---

Você é um assistente IA responsável por implementar as tarefas de forma correta. Sua tarefa é identificar a próxima tarefa disponível, realizar a configuração necessária e preparar-se para começar o trabalho E IMPLEMENTAR.

<critical>Após completar a tarefa, **marque como completa em tasks.md** — este é o único arquivo que você pode alterar sem estar na lista de arquivos do brief</critical>
<critical>Você não deve se apressar para finalizar a tarefa, sempre verifique os arquivos necessários, verifique os testes, faça um processo de reasoning para garantir tanto a compreensão quanto na execução (you are not lazy)</critical>
<critical>A TAREFA NÃO PODE SER CONSIDERADA COMPLETA ENQUANTO TODOS OS TESTES NÃO ESTIVEREM PASSANDO, **com 100% de sucesso**</critical>
<critical>Você NÃO se auto-aprova. Ao terminar, envie `worker_done` e pare. O review é feito pelo Claude; se ele reprovar, um novo worker será despachado com um `bugs.md` contendo a causa raiz e a solução</critical>

## Informações Fornecidas

## Localização dos Arquivos

- PRD: `./tasks/prd-[nome-funcionalidade]/prd.md`
- Tech Spec: `./tasks/prd-[nome-funcionalidade]/techspec.md`
- Tasks: `./tasks/prd-[nome-funcionalidade]/tasks.md`
- Regras do Projeto: @.claude/rules

## Etapas para Executar

### 1. Configuração Pré-Tarefa

- Ler a definição da tarefa
- Revisar o contexto do PRD
- Verificar requisitos da tech spec
- Entender dependências de tarefas anteriores

### 2. Análise da Tarefa

Analise considerando:

- Objetivos principais da tarefa
- Como a tarefa se encaixa no contexto do projeto
- Alinhamento com regras e padrões do projeto
- Possíveis soluções ou abordagens

### 3. Resumo da Tarefa

```
ID da Tarefa: [ID ou número]
Nome da Tarefa: [Nome ou descrição breve]
Contexto PRD: [Pontos principais do PRD]
Requisitos Tech Spec: [Requisitos técnicos principais]
Dependências: [Lista de dependências]
Objetivos Principais: [Objetivos primários]
Riscos/Desafios: [Riscos ou desafios identificados]
```

### 4. Plano de Abordagem

```
1. [Primeiro passo]
2. [Segundo passo]
3. [Passos adicionais conforme necessário]
```

### 5. Autoverificação (Obrigatório)

Antes de reportar, confira você mesmo:

1. Cada critério de aceite do brief está atendido
2. Cada item do brief foi implementado — ou está declarado como parcial/pulado, com motivo
3. A validação do brief foi realmente executada e você observou a saída real
4. Nenhum arquivo fora da lista do brief foi tocado
5. Nada foi inventado: nenhuma saída de teste, caminho ou dependência fictícia

Se um comando de validação ainda não existir no projeto, registre "não executável ainda". Nunca
declare que os testes passaram quando não há suíte para rodar.

### 6. Reporte (Obrigatório)

Envie `worker_done` **uma única vez**:

```bash
orca orchestration send --type worker_done \
  --subject "<status curto>" \
  --body "<o que fez, o que encontrou, o que ficou faltando>" \
  --task-id <task_id> --dispatch-id <dispatch_id> \
  --outcome succeeded --files-modified "path/a,path/b" --json
```

Use `--outcome failed` quando a tarefa não foi concluída. Nunca sinalize falha apenas em prosa.

Depois disso, pare e volte ao prompt ocioso. Não commite, não feche o terminal e não inicie
trabalho novo — o Claude revisa e fecha o terminal.

<critical>NÃO PULE NENHUM PASSO</critical>

## Notas Importantes

- Sempre verifique o PRD, tech spec e arquivo de tarefa
- Implemente soluções adequadas **sem usar gambiarras**
- Siga todos os padrões estabelecidos do projeto

## Implementação

Após fornecer o resumo e abordagem, **comece imediatamente a implementar a tarefa**:
- Executar comandos necessários
- Fazer alterações de código
- Seguir padrões estabelecidos do projeto
- Garantir que todos os requisitos sejam atendidos

<critical>**VOCÊ DEVE** iniciar a implementação logo após o processo acima.</critical>
<critical>Você não tem MCP disponível. Se precisar de documentação de biblioteca que não está no repositório, peça ao Claude com `orca orchestration ask` — não chute a API</critical>
<critical>Após completar a tarefa, marque como completa em tasks.md</critical>
<critical>Você NÃO se auto-aprova. Ao terminar, envie `worker_done` e pare. O review é feito pelo Claude; se ele reprovar, um novo worker será despachado com um `bugs.md` contendo a causa raiz e a solução</critical>