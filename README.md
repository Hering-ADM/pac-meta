# Painel MTG

Site gratuito, feito por fãs, com o metagame dos formatos competitivos de Magic, as listas dos torneios do MTGO, preços das cartas e guias de confronto.

## Como funciona

- `scripts/collect.py` baixa os resultados públicos de mtgo.com/decklists (Standard, Pioneer, Modern, Legacy, Vintage, Pauper e Premodern) e guarda cada evento em `data/raw/`.
- `scripts/prices.py` baixa, uma vez por dia, os dados do Scryfall e guarda preço, imagem e tipo das cartas usadas em `data/cards.json`, com histórico em `data/price_history/`.
- `scripts/build.py` classifica as listas em arquétipos (regras em `data/archetypes.json`) e gera os arquivos do site em `site/data/`.
- `.github/workflows/atualizar.yml` roda tudo isso a cada hora e publica o site no GitHub Pages.

## Ajustar arquétipos

Edite `data/archetypes.json`. Cada regra tem um nome e grupos de cartas: a lista entra no arquétipo se tiver pelo menos `min` cartas de cada grupo e nenhuma carta de `none`. A primeira regra que bater vale. Listas sem regra recebem o nome das cores e de uma carta marcante.

## Aviso legal

Painel MTG é conteúdo de fã não oficial, permitido pela Política de Conteúdo de Fãs. Não é aprovado nem endossado pela Wizards. Partes dos materiais usados são propriedade da Wizards of the Coast. © Wizards of the Coast LLC. Dados e imagens das cartas: Scryfall.
