---
description: Gate de validação (qa, system, uiux, security, acceptance) sobre o trabalho de um worker; aprova ou devolve com achados. Rodado pelo coordenador ou por um validador.
---

> **Executado por:** o perfil do gate em `.agent-kit/config.json` (`roles.qa`, `roles.system`,
> `roles.uiux`, `roles.security`, `roles.product-owner`). Quando o perfil é `coordinator`, o
> coordenador roda o gate; senão, `agent-kit wf gate <run> <task> <gate>` gera o brief do validador.
> Quem implementou nunca valida o próprio trabalho. Ver `CLAUDE.md` seções 1 e 6.

## Gates

| Gate | Papel | Quando | Foco |
|---|---|---|---|
| `qa` | QA | sempre | Testes, casos de borda; fluxos no browser quando houver UI (`/executar-qa`) |
| `system` | System | sempre | Aderência à TechSpec, arquitetura, contratos e convenções |
| `uiux` | UI/UX | tag `ui` | Estados, responsividade, acessibilidade WCAG 2.2, consistência visual |
| `security` | Segurança | tag `security` | Autenticação, autorização, validação de entrada, segredos, PII, LGPD |
| `acceptance` | Product owner | sempre, depois dos outros | Cada critério de aceite, um por um, com evidência |

Rode as etapas abaixo com o foco do gate em questão. O resultado de cada gate é registrado
separadamente: `agent-kit wf review <run> <task> --gate <gate> --reviewer <id> --file <resposta>`
(a resposta termina com o bloco `agent-kit-review`) ou `--verdict approved|rejected --finding "..."`.

---

Você é um assistente IA especializado em Code Review. Sua tarefa é analisar o código produzido, verificar se está de acordo com as regras do projeto, se os testes passam e se a implementação segue a TechSpec e as Tasks definidas.

<critical>Utilize git diff para analisar as mudanças de código</critical>
<critical>Verifique se o código está de acordo com as rules do projeto</critical>
<critical>TODOS os testes devem passar antes de aprovar o review</critical>
<critical>A implementação deve seguir EXATAMENTE a TechSpec e as Tasks</critical>

## Objetivos

1. Analisar código produzido via git diff
2. Verificar conformidade com as rules do projeto
3. Validar se os testes passam
4. Confirmar aderência à TechSpec e Tasks
5. Identificar code smells e oportunidades de melhoria
6. Gerar relatório de code review

## Pré-requisitos / Localização dos Arquivos

- PRD: `./tasks/prd-[nome-funcionalidade]/prd.md`
- TechSpec: `./tasks/prd-[nome-funcionalidade]/techspec.md`
- Tasks: `./tasks/prd-[nome-funcionalidade]/tasks.md`
- Regras do Projeto: @.claude/rules

## Etapas do Processo

### 1. Análise de Documentação (Obrigatório)

- Ler a TechSpec para entender as decisões arquiteturais esperadas
- Ler as Tasks para verificar o escopo implementado
- Ler as rules do projeto para conhecer os padrões exigidos

<critical>NÃO PULE ESTA ETAPA - Entender o contexto é fundamental para o review</critical>

### 2. Análise das Mudanças de Código (Obrigatório)

Executar comandos git para entender o que foi alterado:

O worker pode ter trabalhado em **outra worktree**. Use `-C <caminho-da-worktree>` sempre que o
review não for na worktree atual — o caminho vem do relatório do worker ou do runtime.

```bash
# Arquivos modificados
git -C <worktree> status --porcelain

# Diff completo do working tree (workers não commitam, então o trabalho está aqui)
git -C <worktree> diff

# Confirmar que o worker não commitou nem fez stage
git -C <worktree> log --oneline -3
git -C <worktree> diff --staged

# Se houver branch própria, comparar com a base
git -C <worktree> diff main...HEAD
```

Para cada arquivo modificado:
1. Analisar as mudanças linha por linha
2. **Ler o arquivo inteiro**, não só o diff
3. Verificar se seguem os padrões do projeto
4. Confirmar que nenhum arquivo fora do brief foi tocado

### 3. Verificação de Conformidade com Rules (Obrigatório)

Para cada mudança de código, verificar:

- [ ] Segue os padrões de nomenclatura definidos nas rules
- [ ] Segue a estrutura de pastas do projeto
- [ ] Segue os padrões de código (formatação, linting)
- [ ] Não introduz dependências não autorizadas
- [ ] Segue os padrões de tratamento de erro
- [ ] Segue os padrões de logging (se aplicável)
- [ ] Código está em português/inglês conforme definido nas rules

### 4. Verificação de Aderência à TechSpec (Obrigatório)

Comparar implementação com a TechSpec:

- [ ] Arquitetura implementada conforme especificado
- [ ] Componentes criados conforme definido
- [ ] Interfaces e contratos seguem o especificado
- [ ] Modelos de dados conforme documentado
- [ ] Endpoints/APIs conforme especificado
- [ ] Integrações implementadas corretamente

### 5. Verificação de Completude das Tasks (Obrigatório)

Para cada task marcada como completa:

- [ ] Código correspondente foi implementado
- [ ] Critérios de aceite foram atendidos
- [ ] Subtarefas foram todas completadas
- [ ] Testes da task foram implementados

### 6. Execução dos Testes (Obrigatório)

Execute a suíte **você mesmo**, na worktree do worker. Nunca aceite o resultado relatado sem
reproduzi-lo. Os comandos exatos vêm do `CLAUDE.md`; enquanto a stack não existir, não há suíte
para rodar e isso deve constar no relatório como "não executável ainda".

Verificar:
- [ ] Todos os testes passam — com a saída observada por você, não a relatada pelo worker
- [ ] Novos testes foram adicionados para o código novo
- [ ] Coverage não diminuiu
- [ ] Testes são significativos: falhariam se a lógica estivesse sutilmente errada

<critical>O REVIEW NÃO PODE SER APROVADO SE ALGUM TESTE FALHAR</critical>

### 7. Análise de Qualidade de Código (Obrigatório)

Verificar code smells e boas práticas:

| Aspecto | Verificação |
|---------|-------------|
| Complexidade | Funções não muito longas, baixa complexidade ciclomática |
| DRY | Código não duplicado |
| SOLID | Princípios SOLID seguidos |
| Naming | Nomes claros e descritivos |
| Comments | Comentários apenas onde necessário |
| Error Handling | Tratamento de erros adequado |
| Security | Sem vulnerabilidades óbvias (SQL injection, XSS, etc.) |
| Performance | Sem problemas óbvios de performance |

### 8. Relatório de Code Review (Obrigatório)

Gerar relatório final no formato:

```
# Relatório de Code Review - [Nome da Funcionalidade]

## Resumo
- Data: [data]
- Branch: [branch]
- Status: APROVADO / APROVADO COM RESSALVAS / REPROVADO
- Arquivos Modificados: [X]
- Linhas Adicionadas: [Y]
- Linhas Removidas: [Z]

## Conformidade com Rules
| Rule | Status | Observações |
|------|--------|-------------|
| [rule] | OK/NOK | [obs] |

## Aderência à TechSpec
| Decisão Técnica | Implementado | Observações |
|-----------------|--------------|-------------|
| [decisão] | SIM/NÃO | [obs] |

## Tasks Verificadas
| Task | Status | Observações |
|------|--------|-------------|
| [task] | COMPLETA/INCOMPLETA | [obs] |

## Testes
- Total de Testes: [X]
- Passando: [Y]
- Falhando: [Z]
- Coverage: [%]

## Problemas Encontrados
| Severidade | Arquivo | Linha | Descrição | Sugestão |
|------------|---------|-------|-----------|----------|
| Blocker/High/Medium/Low | [file] | [line] | [desc] | [fix] |

## Pontos Positivos
- [pontos positivos identificados]

## Recomendações
- [recomendações de melhoria]

## Conclusão
[Parecer final do review]
```

## Checklist de Qualidade

- [ ] TechSpec lida e entendida
- [ ] Tasks verificadas
- [ ] Rules do projeto revisadas
- [ ] Git diff analisado
- [ ] Conformidade com rules verificada
- [ ] Aderência à TechSpec confirmada
- [ ] Tasks validadas como completas
- [ ] Testes executados e passando
- [ ] Code smells verificados
- [ ] Relatório final gerado

## Severidade

| Nível | Quando | Efeito |
|---|---|---|
| **Blocker** | Teste falhando, segurança, perda de dados, quebra de invariante de ADR, critério de aceite não atendido | Reprova |
| **High** | Violação de rule ou da TechSpec, bug de comportamento sem teste, contrato divergente | Reprova |
| **Medium** | Code smell real, teste fraco (não falharia com a lógica errada), nome ou estrutura confusa | Ressalva: vai para o `bugs.md` como item não bloqueante |
| **Low** | Polimento | Ressalva: só no relatório |

Classifique cada problema antes de decidir. Na dúvida entre dois níveis, escolha o mais alto e diga por quê.

## Critérios de Aprovação

**APROVADO**: Nenhum achado Blocker, High ou Medium.

**APROVADO COM RESSALVAS**: Nenhum Blocker ou High; há Medium ou Low registrados.

**REPROVADO**: Pelo menos um Blocker ou High.

O loop de correção trata Blocker e High. Os limites (`maxFixCycles`, `maxAttemptsPerTask`) e o que
acontece quando se esgotam vêm de `.agent-kit/autonomy.json`.

## Ação Após o Review (Obrigatório)

O review não termina no relatório: ele vira o veredito do gate.

1. Termine com o bloco `agent-kit-review` (`docs/agents/worker.md` seção 4): `approved` (aprovado ou
   aprovado com ressalvas — sem Blocker/High) ou `rejected` (pelo menos um Blocker/High), com os
   achados e, no gate `acceptance`, a lista `criteria` completa.
2. O coordenador registra com `agent-kit wf review ... --gate <gate>`. Um gate reprovado devolve a
   tarefa ao dev automaticamente; antes do redespacho o coordenador **diagnostica a causa raiz** e a
   escreve em `tasks/prd-<feature>/bugs.md` (`.claude/templates/bugs-template.md`).
3. **Não fazer merge.** Os limites de tentativas e ciclos de correção vêm de
   `.agent-kit/autonomy.json`; ao esgotá-los, vale `escalation.onBudgetExhausted`.
4. No runtime Orca, não pare (`worker-stop`) o worker antes de registrar todos os gates: workers que
   terminam fecham sozinhos, e um follow-up vai por `orca orchestration send --to dispatch:<id>`
   (`.agent-kit/runtime/orca.md`).

<critical>Validador não altera arquivos: só lê, roda verificações e reporta</critical>
<critical>NUNCA corrija o código do worker por conta própria em vez de devolver com achados, exceto em correções de segurança ou que alterem a arquitetura (feitas pelo coordenador)</critical>

## Notas Importantes

- Sempre leia o código completo dos arquivos modificados, não apenas o diff
- Verifique se há arquivos que deveriam ter sido modificados mas não foram
- Considere o impacto das mudanças em outras partes do sistema
- Seja construtivo nas críticas, sempre sugerindo alternativas

<critical>O REVIEW NÃO ESTÁ COMPLETO ATÉ QUE TODOS OS TESTES PASSEM</critical>
<critical>Verifique SEMPRE as rules do projeto antes de apontar problemas</critical>

