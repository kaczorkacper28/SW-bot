# 🛡️ Służba Więzienna — Discord Bot

Gotowy bot do prowadzenia ewidencji funkcjonariuszy Służby Więziennej.

## Funkcje

- SW-01, SW-02, SW-03 itd.
- przyjmowanie funkcjonariuszy
- awans
- degradacja
- wydalenie
- nagana
- plusy
- minusy
- karta funkcjonariusza
- lista kadry
- kanał logów
- zapis danych w `data/sw-data.json`

## Komendy

`/sw-dodaj`
`/sw-awans`
`/sw-degradacja`
`/sw-wydalenie`
`/sw-nagana`
`/sw-plus`
`/sw-minus`
`/sw-info`
`/sw-kadra`
`/sw-ustaw-logi`
`/sw-usun`

## Zmienne na Render

Dodaj w Environment Variables:

- `TOKEN`
- `CLIENT_ID`
- `GUILD_ID`

Nie wpisuj tokena bezpośrednio do `index.js`.

## Uruchomienie na Render

Build Command:
`npm install`

Start Command:
`node index.js`

Po wdrożeniu użyj:
`/sw-ustaw-logi`

i wybierz kanał, na którym bot ma zapisywać awanse, degradacje, nagany itd.


## Rejestr osadzonych i przepustki

Bot zawiera również zintegrowany moduł z repozytorium SW-Osadzieni.

### Komendy osadzonych
- `/osadzony-dodaj` — dodaje osobę do rejestru i tworzy kartę z licznikiem kary.
- `/osadzony-info` — pokazuje kartę osadzonego.
- `/osadzeni` — wyświetla listę osadzonych.
- `/osadzony-edytuj` — edytuje dane osadzonego.
- `/osadzony-usun` — usuwa wpis.
- `/przepustka` — składa wniosek o przepustkę.
- `/przepustki` — pokazuje oczekujące wnioski.

Karty osadzonych mają przyciski pauzy, wznowienia oraz dodawania i odejmowania czasu kary. Moduł zapisuje dane oddzielnie w `data/osadzeni.json`, a ewidencja funkcjonariuszy nadal korzysta z `data/sw-data.json`.

### Wymagane kanały Discord
- `📍・osadzeni`
- `🎫・przepustki`
- `📜・logi-osadzeni`

### Role modułu osadzonych
Dostęp do rejestru: `Generał Inspektor SW ⚖️👑`, `Generał SW ⚖️⭐`, `Dowódca zmiany`, `zca. Dowódca zmiany` lub administrator.
Pauzowanie i wznawianie kary: powyższe role oraz `Pracownik SW`.
Dodawanie i odejmowanie czasu: wyłącznie dwie role generalskie.
