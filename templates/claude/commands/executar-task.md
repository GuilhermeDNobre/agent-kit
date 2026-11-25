---
description: Implementa uma tarefa do plano e termina com o bloco agent-kit-report. Rodado por um worker despachado pelo coordenador.
---

> **Executado por:** worker, despachado pelo coordenador (ver o guia do runtime em `.agent-kit/runtime/`).
> Você recebe um brief gerado por `agent-kit wf dispatch`: ele é todo o seu contexto.
>
> Regras que valem do início ao fim:
> - Leia `AGENTS.md`, `docs/agents/worker.md` e `.claude/rules/README.md` antes de começar.
> - Toque **somente** nos arquivos que o brief nomear.
> - **Nunca** commite, faça stage, push ou troque de branch.
> - **Nunca** escolha stack, framework, gerenciador de pacotes ou ferramenta de testes.
> - Se um comando de validação ainda não existir no projeto, diga isso — não invente saída.
> - Ao terminar, encerre com o bloco `agent-kit-report` (`docs/agents/worker.md` seção 4) e pare.

---

Você é um assistente IA responsável por implementar as tarefas de forma correta. Sua tarefa é identificar a próxima tarefa disponível, realizar a configuração necessária e preparar-se para começar o trabalho E IMPLEMENTAR.

<critical>Não altere `tasks.md` nem arquivos fora do escopo do brief: o estado das tarefas é controlado pelo coordenador (`agent-kit wf`)</critical>
<critical>Você não deve se apressar para finalizar a tarefa, sempre verifique os arquivos necessários, verifique os testes, faça um processo de reasoning para garantir tanto a compreensão quanto na execução (you are not lazy)</critical>
<critical>A TAREFA NÃO PODE SER CONSIDERADA COMPLETA ENQUANTO TODOS OS TESTES NÃO ESTIVEREM PASSANDO, **com 100% de sucesso**</critical>
<critical>Você NÃO se auto-aprova. Ao terminar, envie o relatório e pare. O coordenador reexecuta a validação e os gates (QA, sistema, UI/UX, segurança, product owner) revisam; se reprovarem, uma nova tentativa recebe os achados</critical>

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

Termine sua resposta final com **exatamente um** bloco `agent-kit-report` (formato em
`docs/agents/worker.md` seção 4 e no brief), com `outcome` `succeeded`, `failed` ou `blocked`,
os arquivos alterados e cada comando de validação com o exit code real. Se o brief pedir um envio
específico do runtime (ex.: `worker_done` no Orca), faça-o uma única vez com o mesmo conteúdo.

Depois disso, encerre o turno. Não commite e não inicie trabalho novo.

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
<critical>Se precisar de documentação de biblioteca que não está no repositório e não tiver ferramenta para lê-la, termine com `outcome: blocked` dizendo o que falta — não chute a API</critical>
<critical>Você NÃO se auto-aprova. Ao terminar, envie o relatório e pare. O coordenador reexecuta a validação e os gates (QA, sistema, UI/UX, segurança, product owner) revisam; se reprovarem, uma nova tentativa recebe os achados</critical>