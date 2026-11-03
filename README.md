# Pac-Meta

Site gratuito, feito por fãs, com o metagame dos formatos competitivos de Magic, as listas dos torneios do MTGO, preços das cartas e guias de confronto.

## Como funciona

- `scripts/collect.py` baixa os resultados públicos de mtgo.com/decklists (Standard, Pioneer, Modern, Legacy, Vintage, Pauper e Premodern) e guarda cada evento em `data/raw/`.
- `scripts/prices.py` baixa, uma vez por dia, os dados do Scryfall e guarda preço, imagem e tipo das cartas usadas em `data/cards.json`, com histórico em `data/price_history/`.
- `scripts/build.py` classifica as listas em arquétipos (regras em `data/archetypes.json`) e gera os arquivos do site em `site/data/`.
- `.github/workflows/atualizar.yml` roda tudo isso a cada hora e publica o site no GitHub Pages.

## Ajustar arquétipos

Edite `data/archetypes.json`. Cada regra tem um nome e grupos de cartas: a lista entra no arquétipo se tiver pelo menos `min` cartas de cada grupo e nenhuma carta de `none`. A primeira regra que bater vale. Listas sem regra recebem o nome das cores e de uma carta marcante.

## Aviso legal

Pac-Meta é conteúdo de fã não oficial, permitido pela Política de Conteúdo de Fãs. Não é aprovado nem endossado pela Wizards. Partes dos materiais usados são propriedade da Wizards of the Coast. © Wizards of the Coast LLC. Dados e imagens das cartas: Scryfall.

## Artigos

Qualquer pessoa pode enviar um artigo pela página Artigos › Enviar. O envio chega por e-mail para o responsável e só é publicado depois de aprovado. Para publicar um artigo aprovado:

1. Salve o texto em `site/static/artigos/<slug>.md` (subtítulos com `##`, listas com `-`, negrito com `**`, cartas entre colchetes duplos, como `[[Lightning Bolt]]`).
2. Acrescente o artigo em `site/static/artigos/index.json` com `slug`, `titulo`, `resumo`, `data`, `autor` e `tags`.

As páginas Sugestões e Trabalhe conosco também montam um e-mail para o responsável; nada é guardado no site.
