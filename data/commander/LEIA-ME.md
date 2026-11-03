# Listas de Commander

Cada deck é um arquivo `<slug>.txt` nesta pasta, no formato exportado por Moxfield, Archidekt, LigaMagic ou MTGO.
O comandante vai numa seção `Commander` (ou `Comandante`) no topo, ou é indicado em `decks.json`.

`decks.json` (opcional) guarda nome, autor, descrição, data e tags de cada deck:

    {"decks": [{"slug": "atraxa-superfriends", "nome": "Atraxa Superfriends", "comandante": ["Atraxa, Praetors' Voice"],
                "autor": "Fulano", "descricao": "...", "data": "2026-11-03", "tags": ["Bracket 3"]}]}

Preço e imagem de cada carta vêm do Scryfall na próxima atualização diária.
