# Listas de Commander

Cada deck é um arquivo `<slug>.txt` nesta pasta, no formato exportado por Moxfield, Archidekt, LigaMagic ou MTGO.
O comandante vai numa seção `Commander` (ou `Comandante`) no topo, ou é indicado em `decks.json`.

`decks.json` guarda os dados de cada deck. `categoria` diz em qual sub-aba ele aparece:

- `bhell`: campeonato semanal de quinta-feira da Pac Deck. Use também `evento` (ex.: "Bhell #12"), `data`, `jogador` e `colocacao`.
- `cedh`: decks de cEDH.
- `comunidade`: decks da comunidade (padrão, se `categoria` faltar).

Exemplo:

    {"decks": [
      {"slug": "bhell-2026-11-06-kinnan", "categoria": "bhell", "evento": "Bhell", "data": "2026-11-06",
       "jogador": "Fulano", "colocacao": 1, "comandante": ["Kinnan, Bonder Prodigy"], "nome": "Kinnan"},
      {"slug": "cedh-tymna-thrasios", "categoria": "cedh", "nome": "Tymna Thrasios", "autor": "Fulano",
       "comandante": ["Tymna the Weaver", "Thrasios, Triton Hero"], "descricao": "..."}
    ]}

Preço e imagem de cada carta vêm do Scryfall na próxima atualização diária.
