# Integracja SW — stan na 2026-11-05

Główny projekt: [SW-bot](https://github.com/kaczorkacper28/SW-bot).

## Podłączone do jednego bota Discord

| Źródłowe repozytorium | Obecny kod | Status |
| --- | --- | --- |
| SW-bot | `index.js` | Kadry — podłączone |
| SW-Osadzieni | `osadzeni.js` | Osadzeni i przepustki — podłączone |
| SW-stopnie | `modules/stopnie.js` | Lista stopni — podłączona, nazwy komend `/stopnie-*` |
| SW-RAPORT | `modules/raport.js` | Raporty — podłączone |
| Wezwanie-SW | `modules/wezwanie.js` | Wezwania — podłączone |
| SW-Set-Bot | `modules/dokumenty.js` | Dokumenty — podłączone |
| propozycja-SW | `modules/propozycje.js` | Propozycje — podłączone |
| SW-Wyplaty | `modules/wyplaty.js` | Manualna wypłata przez API — podłączona |

Główna aplikacja `index.js` loguje się do Discorda tylko raz. Komendy dla głównego serwera są rejestrowane razem. Jeśli `SW_GUILD_ID` różni się od `GUILD_ID`, komenda `/sw-wyplata` jest rejestrowana na drugim serwerze.

## Panel administracyjny

Osobny serwer `panel/server.js` i interfejs `panel/public/` współpracują z jednym
procesem bota przez prywatne API. Kadry, osadzeni i lista stopni korzystają
z tych samych obiektów i plików co komendy Discord. Raporty, wezwania, dokumenty,
propozycje i wypłaty mają trwałą ewidencję i dziennik. Jawna publikacja
raportów, wezwań i propozycji działa przez połączonego bota. Zapis ewidencji
wypłat nie wykonuje przelewu.

Uruchomienie lokalne: `npm run panel:admin -- --username admin`, potem
`npm run dev:offline`. Uruchomienie z Discordem: `npm run dev`.
Instrukcja konfiguracji i ograniczenia: [PANEL.md](PANEL.md).

## Pozostałe elementy

- **SW-CENTRUM:** dokumentacja / projekt organizacyjny. Nie jest modułem wykonywalnym.
- **SW-android:** oddzielna aplikacja, nie jest jeszcze przeniesiona do tego repozytorium ani uruchamiana przez Node.js.
- **Wypłaty niedzielne:** aktualny moduł implementuje `/sw-wyplata`, a nie automatyczny cykl płac.
- **Uruchomienie produkcyjne:** wymaga konfiguracji zmiennych, uprawnień, ID kanałów, testów z prawdziwym Discordem i UnbelievaBoat.

## Dane i bezpieczeństwo

`data/sw-data.json` (kadry), `data/sw-stopnie.json` (lista stopni), `data/osadzeni.json` (osadzeni) są celowo oddzielne. Istniejących danych nie wolno zastępować pustymi szablonami podczas migracji.

Do repozytorium nie dodawaj `.env`, `TOKEN`, `UNB_API_TOKEN` ani adresów webhooków z poufnymi identyfikatorami. W publicznym źródłowym repozytorium SW-Wyplaty odnaleziono `.env`; wszelkie ujawnione tokeny należy unieważnić i wymienić. Samo skasowanie pliku nie usuwa go z historii Git.

Instrukcje ustawień i lista funkcji: [README.md](README.md).
