---
description: Faz a release/deploy de um run concluído. Só roda por ordem explícita do usuário. Rodado pelo coordenador.
---

> **Executado por:** coordenador (papel `release`).
> **Quando:** somente quando o usuário pedir explicitamente a release, nesta conversa.

---

<critical>Este comando só começa com uma ordem explícita do usuário. Nenhum workflow chama este comando sozinho</critical>
<critical>Cada comando de deploy, publicação ou push passa pela política de ações protegidas e precisa da aprovação do usuário no momento da execução</critical>

1. `agent-kit wf status <run>` — o run precisa estar `completed`. Se não estiver, pare e diga o que
   falta.
2. Confirme com o usuário o alvo (ambiente, versão, branch) e mostre o plano de release: comandos
   exatos, na ordem, e como reverter cada um.
3. Para cada comando: `agent-kit policy check -- <comando>`. Comandos protegidos só rodam com a
   aprovação do usuário para aquele comando.
4. Rode o smoke test pós-deploy combinado no plano e registre a saída real.
5. Relate: o que foi publicado, onde, versão, evidência do smoke test e como reverter.
