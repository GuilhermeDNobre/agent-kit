# Bugs - [Nome da Funcionalidade]

> Preenchido pelo **Claude (orquestrador)** durante o review ou o QA, nunca pelo worker.
> A causa raiz e a solução pretendida já vêm diagnosticadas: o worker aplica a correção,
> não a investiga. Ver `CLAUDE.md` seção 5.

## Resumo

| Campo | Valor |
|---|---|
| Origem | Review / QA / Execução de task |
| Data | [AAAA-MM-DD] |
| Task relacionada | [X.0 ou n/a] |
| Total de bugs | [N] |
| Bloqueia entrega? | Sim / Não |

---

## BUG-01: [Título curto e específico]

- **Severidade:** Blocker / High / Medium / Low (escala do `/executar-review`; só Blocker e High bloqueiam a entrega)
- **Status:** Aberto
- **Componente afetado:** [módulo, arquivo ou camada]
- **Arquivos a modificar:** [lista explícita — o worker só pode tocar nestes]

### Comportamento observado

[O que acontece hoje. Inclua a saída real do comando, do teste ou do console — nunca uma
paráfrase. Se houver evidência visual, referencie o caminho do screenshot.]

### Comportamento esperado

[O que deveria acontecer, e por quê. Cite o requisito do PRD ou o critério de aceite violado.]

### Passos para reproduzir

1. [Passo]
2. [Passo]
3. [Resultado incorreto observado]

### Causa raiz

[Diagnóstico do Claude. Explique o mecanismo do erro, não o sintoma. Aponte arquivo e linha.]

### Solução pretendida

[A correção decidida pelo Claude, em nível de instrução acionável: o que mudar, onde, e por quê
essa abordagem e não outra. O worker implementa isto — não deve redesenhar a solução.]

### Teste de regressão exigido

- **Tipo:** unitário / integração / E2E
- **Arquivo:** [caminho do arquivo de teste]
- **Cenário:** [o teste deve falhar se a correção for revertida, e passar com ela aplicada]
- **Edge cases relacionados:** [variações do mesmo problema que também devem ser cobertas]

### Validação

[Comandos exatos a executar após a correção. Se o comando ainda não existir no projeto, escreva
"não executável ainda" — nunca invente um comando.]

---

## BUG-02: [Título]

[Repetir a estrutura acima para cada bug.]

---

## Preenchido pelo worker após a correção

> O worker atualiza apenas esta seção, um bloco por bug corrigido.

### BUG-01

- **Status:** Corrigido / Não corrigido
- **Correção aplicada:** [o que foi mudado, em qual arquivo]
- **Divergência da solução pretendida:** [nenhuma, ou o que mudou e por quê]
- **Testes de regressão criados:** [caminhos dos arquivos e nomes dos testes]
- **Saída da validação:** [saída real observada]
