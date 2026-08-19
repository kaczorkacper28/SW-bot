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
