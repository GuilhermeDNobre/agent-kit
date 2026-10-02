# Regras do Projeto

Padrões de engenharia compartilhados entre o Claude (orquestrador) e os workers, qualquer que seja a ferramenta deles.

Precedência: arquivo do papel (`CLAUDE.md` ou `docs/agents/worker.md`) > `AGENTS.md` > estas regras.

<!--IF:greenfield-->
## A stack ainda não foi escolhida

Este repositório é um scaffold greenfield. Linguagem, framework, gerenciador de pacotes, estrutura
de pastas e ferramenta de testes são **decisões do usuário**. Nem o Claude nem um worker escolhem
qualquer uma delas por conta própria.

Por isso as regras estão divididas em dois grupos. Os exemplos de código são **ilustrativos**, não
um mandato de stack — a linguagem dos exemplos não define a linguagem do projeto.
<!--END-->
<!--IF:existing-->
## A stack já existe

Este projeto já tem uma stack definida (`{{STACK_MANIFEST}}`). Trocar, adicionar ou atualizar
linguagem, framework, gerenciador de pacotes ou ferramenta de testes continua sendo **decisão do
usuário** — nem o Claude nem um worker introduzem uma por conta própria.

Por isso as regras estão divididas em dois grupos. Os exemplos de código são **ilustrativos**: se
um exemplo usa uma tecnologia que este projeto não tem, ele não autoriza adotá-la.
<!--END-->

## Sempre aplicáveis

Valem para qualquer stack, porque descrevem princípios e não ferramentas.

| Arquivo | Escopo |
|---|---|
| `code-standards.md` | Idioma do código, nomenclatura, magic numbers, tamanho de funções e classes, efeitos colaterais, comentários, escopo de variáveis |
| `logging.md` | Níveis de log, armazenamento, dados sensíveis, contexto e estrutura |
| `tests.md` | Independência, AAA/GWT, mocks e tempo, cobertura, nomenclatura de testes |

## Condicionais

Só valem **depois** que a tecnologia correspondente for escolhida pelo usuário. Até lá, servem
apenas como referência.

| Arquivo | Aplica-se quando |
|---|---|
| `node.md` | O projeto usar Node.js / TypeScript |
| `react.md` | O projeto usar React |
| `http.md` | O projeto expuser uma API REST/HTTP |

## Como usar

1. Antes de escrever ou revisar código, carregue as regras **sempre aplicáveis**.
2. Carregue uma regra condicional apenas se a tecnologia dela já fizer parte do projeto.
3. Se uma regra condicional for a única resposta para uma decisão ainda em aberto, isso é um sinal
   de que a decisão precisa subir para o usuário — não trate a regra como se a escolha já tivesse
   sido feita.

## Manutenção

Sempre que a stack mudar, atualize este README movendo as regras condicionais que passaram a valer
(ou deixaram de valer), e ajuste `CLAUDE.md` e `AGENTS.md` na mesma passada.

As regras condicionais que vêm no kit cobrem Node/TypeScript, React e REST/HTTP. Se o projeto usar
outra stack, substitua esses arquivos pelos equivalentes da sua — a divisão em dois grupos é que
importa, não a lista específica.
