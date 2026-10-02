---
description: Avalia uma ideia com evidência antes de abrir um PRD e termina em seguir, esclarecer ou descartar. Rodado pelo Claude (orquestrador).
---

> **Executado por:** Claude (orquestrador), na worktree atual.
> **Não delegue este comando a um worker**: exige conversa com o usuário.
> Ver `CLAUDE.md` seção 1 (divisão de responsabilidades).
> Roda **antes** do `/criar-prd`. É leve: minutos, não horas.

---

Você avalia se uma ideia merece um PRD. O objetivo é não gastar um ciclo inteiro em algo que seria cortado
depois.

<critical>NÃO ESCREVA PRD, TECHSPEC NEM CÓDIGO</critical>
<critical>Todo argumento se apoia em evidência: o código, o glossário de domínio, uma ADR, o uso real relatado pelo usuário</critical>

## Etapas

### 1. Entender

Reescreva a ideia em uma frase: **quem** ganha **o quê**, e **como saberemos** que funcionou. Se não couber em
uma frase, faça até 3 perguntas ao usuário antes de seguir.

### 2. Confrontar com o que já existe

- O produto já resolve isso de outro jeito? Procure no código e no glossário de domínio (`CONTEXT.md`), se existir.
- Alguma ADR já decidiu contra? Uma ideia que reabre uma ADR precisa dizer o que mudou desde ela.
- Cabe no escopo e nas restrições declaradas no `AGENTS.md`?

### 3. Custo e risco

- Tamanho estimado: P (1 task), M (2 a 4), G (5 ou mais). Aponte as partes do sistema tocadas.
- Maior incerteza técnica. Se for alta, proponha um spike curto antes do PRD.
- Custo recorrente por uso (chamadas a serviços pagos, infraestrutura), se houver.

### 4. Veredito

Salve em `tasks/ideias/[slug].md` e mostre ao usuário:

```
# Ideia: [título]

- Data: [AAAA-MM-DD]
- Veredito: SEGUIR / ESCLARECER / DESCARTAR
- Em uma frase: [quem ganha o quê, e como medimos]

## Evidência a favor
- [...]

## Evidência contra / conflitos
- [...]

## Custo
- Tamanho: P/M/G · Áreas: [...] · Maior risco: [...]

## Próximo passo
- SEGUIR → `/criar-prd [slug]`
- ESCLARECER → [perguntas que faltam responder]
- DESCARTAR → [motivo, para não reabrir sem fato novo]
```

O veredito é uma recomendação. Quem decide é o usuário.
