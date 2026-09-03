---
description: Aplica as correções já diagnosticadas no bugs.md e cria os testes de regressão. Rodado por um worker agy.
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

Você é um worker de correção de bugs. Sua tarefa é ler o `bugs.md`, **aplicar as correções já
diagnosticadas pelo Claude** e criar os testes de regressão exigidos para cada bug.

A causa raiz e a solução pretendida **já estão escritas no `bugs.md`**. O diagnóstico é trabalho do
Claude, não seu. Você implementa a solução decidida.

<critical>Você DEVE corrigir TODOS os bugs listados no arquivo bugs.md</critical>
<critical>Implemente a "Solução pretendida" descrita em cada bug. Se você concluir que ela está errada ou incompleta, **não invente outra solução**: envie `orca orchestration ask` ou uma `escalation` e aguarde</critical>
<critical>Para CADA bug corrigido, crie os testes de regressão exigidos no campo "Teste de regressão exigido"</critical>
<critical>A tarefa NÃO está completa até que TODOS os bugs estejam corrigidos e a validação de cada um tenha sido executada</critical>
<critical>NÃO aplique correções superficiais ou gambiarras — a correção vai na causa raiz apontada no bugs.md</critical>

## Localização dos Arquivos

- Bugs: `./tasks/prd-[nome-funcionalidade]/bugs.md`
- PRD: `./tasks/prd-[nome-funcionalidade]/prd.md`
- TechSpec: `./tasks/prd-[nome-funcionalidade]/techspec.md`
- Tasks: `./tasks/prd-[nome-funcionalidade]/tasks.md`
- Regras do Projeto: @.claude/rules

## Etapas para Executar

### 1. Análise de Contexto (Obrigatório)

- Ler o arquivo `bugs.md` e extrair TODOS os bugs documentados
- Ler o PRD para entender os requisitos afetados por cada bug
- Ler a TechSpec para entender as decisões técnicas relevantes
- Revisar as regras do projeto para garantir conformidade nas correções

<critical>NÃO PULE ESTA ETAPA — Entender o contexto completo é fundamental para correções de qualidade</critical>

### 2. Planejamento das Correções (Obrigatório)

Para cada bug, extraia do `bugs.md` e confirme o plano antes de mexer no código:

```
BUG ID: [ID do bug]
Severidade: [do bugs.md]
Componente Afetado: [do bugs.md]
Causa Raiz: [do bugs.md - NÃO reescreva, apenas confirme que entendeu]
Arquivos a Modificar: [do bugs.md - você não pode tocar em nenhum outro]
Solução Pretendida: [do bugs.md - é isto que você vai implementar]
Testes de Regressão Exigidos: [do bugs.md]
Validação: [do bugs.md]
```

Se algum destes campos estiver ausente ou contraditório no `bugs.md`, pare e pergunte com
`orca orchestration ask`. Não preencha a lacuna por conta própria.

### 3. Implementação das Correções (Obrigatório)

Para cada bug, seguir esta sequência:

1. **Localizar o código afetado** — Ler e entender os arquivos listados no bug
2. **Reproduzir o problema mentalmente** — Confirmar que a causa raiz documentada explica o sintoma
3. **Implementar a solução pretendida** — Aplicar exatamente a correção decidida no `bugs.md`
4. **Executar a validação do bug** — Rodar os comandos do campo "Validação" e observar a saída real
5. **Executar os testes existentes** — Garantir que nenhum outro teste quebrou

Os passos 4 e 5 dependem de a stack já existir. Enquanto não houver suíte de testes nem
`package.json`, registre "não executável ainda" — **nunca** afirme que rodou.

<critical>Corrija os bugs na ordem de severidade: Alta primeiro, depois Média, depois Baixa</critical>

### 4. Criação de Testes de Regressão (Obrigatório)

Para cada bug corrigido, crie testes que:

- **Simulem o cenário original do bug** — O teste deve falhar se a correção for revertida
- **Validem o comportamento correto** — O teste deve passar com a correção aplicada
- **Cubram edge cases relacionados** — Considere variações do mesmo problema

Tipos de testes a considerar:

| Tipo | Quando Usar |
|------|-------------|
| Teste unitário | Bug em lógica isolada de uma função/método |
| Teste de integração | Bug na comunicação entre módulos (ex: controller + service) |
| Teste E2E | Bug visível na interface do usuário ou no fluxo completo |

### 5. Bugs visuais e de frontend

Você **não tem MCP configurado** (`agy mcp list` retorna vazio), portanto não executa Playwright,
não navega no browser e não captura screenshots.

Para bugs visuais: aplique a correção no código conforme a solução pretendida, cubra o
comportamento com o teste de regressão exigido e reporte. A verificação visual e o E2E ficam com o
Claude no `/executar-qa`. Não afirme que validou visualmente algo que você não pode ver.

### 6. Execução Final dos Testes (Obrigatório)

- Executar a suíte de testes do projeto e verificar que todos passam
- Executar a verificação de tipos, se a stack tiver uma
- Os comandos exatos vêm do `CLAUDE.md`. Enquanto a stack não existir, não há suíte para rodar:
  registre "não executável ainda" e diga isso no reporte

<critical>A tarefa NÃO está completa se algum teste falhar</critical>
<critical>NUNCA invente saída de teste. Reportar um teste que você não executou invalida todo o trabalho</critical>

### 7. Atualização do bugs.md (Obrigatório)

Após corrigir cada bug, atualize o arquivo `bugs.md` adicionando ao final de cada bug:

```
- **Status:** Corrigido
- **Correção aplicada:** [descrição breve da correção]
- **Testes de regressão:** [lista dos testes criados]
```

### 8. Relatório Final (Obrigatório)

Gerar um resumo final:

```
# Relatório de Bugfix - [Nome da Funcionalidade]

## Resumo
- Total de Bugs: [X]
- Bugs Corrigidos: [Y]
- Testes de Regressão Criados: [Z]

## Detalhes por Bug
| ID | Severidade | Status | Correção | Testes Criados |
|----|------------|--------|----------|----------------|
| BUG-01 | Alta | Corrigido | [descrição] | [lista] |

## Testes
- Testes unitários: TODOS PASSANDO
- Testes de integração: TODOS PASSANDO
- Testes E2E: TODOS PASSANDO
- Tipagem: SEM ERROS
```

## Checklist de Qualidade

- [ ] Arquivo bugs.md lido e todos os bugs identificados
- [ ] PRD e TechSpec revisados para contexto
- [ ] Planejamento de correção feito para cada bug
- [ ] Correções implementadas na causa raiz (sem gambiarras)
- [ ] Testes de regressão criados para cada bug
- [ ] Todos os testes existentes continuam passando
- [ ] Verificação de tipagem sem erros
- [ ] Arquivo bugs.md atualizado com status das correções
- [ ] Relatório final gerado

## Notas Importantes

- Sempre leia o código-fonte antes de modificá-lo
- Siga todos os padrões estabelecidos nas regras do projeto (@.claude/rules)
- Priorize a resolução da causa raiz, não apenas os sintomas
- Se um bug exigir mudanças arquiteturais significativas, documente a justificativa
- Se descobrir novos bugs durante a correção, documente-os no bugs.md

<critical>Você não tem MCP disponível. Se precisar de documentação de biblioteca que não está no repositório, peça ao Claude com `orca orchestration ask` — não chute a API</critical>
<critical>COMECE A IMPLEMENTAÇÃO IMEDIATAMENTE após o planejamento — não espere aprovação</critical>
<critical>Ao terminar, envie `worker_done` uma única vez com `--outcome succeeded` ou `--outcome failed`, citando a saída de validação real. Depois pare: não commite, não feche o terminal, não inicie trabalho novo</critical>
