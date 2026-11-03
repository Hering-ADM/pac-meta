"""Cotação do dólar (USD → BRL) para mostrar os preços do Scryfall em reais.

Atualiza data/fx.json no máximo a cada 6 horas. Se as fontes falharem, mantém a última cotação.
"""
import datetime as dt, json, os
from common import get, load, save, DATA

FX = os.path.join(DATA, 'fx.json')


def fetch():
    try:
        d = json.loads(get('https://economia.awesomeapi.com.br/json/last/USD-BRL', headers={'Accept': 'application/json'}))['USDBRL']
        return float(d['bid']), d.get('create_date', '')[:10], 'AwesomeAPI'
    except Exception as e:
        print('AwesomeAPI falhou:', e)
    d = json.loads(get('https://open.er-api.com/v6/latest/USD', headers={'Accept': 'application/json'}))
    return float(d['rates']['BRL']), dt.datetime.utcfromtimestamp(d['time_last_update_unix']).date().isoformat(), 'ExchangeRate-API'


def main():
    cur = load(FX, {}) or {}
    now = dt.datetime.utcnow()
    try:
        if cur.get('checked') and now - dt.datetime.fromisoformat(cur['checked']) < dt.timedelta(hours=6):
            print('cotação recente:', cur['rate']); return
    except ValueError:
        pass
    try:
        rate, date, src = fetch()
    except Exception as e:
        print('sem cotação nova, mantendo a anterior:', cur.get('rate'), e); return
    if not 2 < rate < 20:
        print('cotação fora do esperado, ignorando:', rate); return
    save(FX, {'rate': round(rate, 4), 'date': date, 'source': src, 'checked': now.isoformat(timespec='minutes')}, compact=False)
    print('cotação USD→BRL:', rate, date, src)


if __name__ == '__main__':
    main()
