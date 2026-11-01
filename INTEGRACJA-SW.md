# Integracja SW — stan na 2026-11-01

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

## Pozostałe elementy

- **SW-CENTRUM:** dokumentacja / projekt organizacyjny. Nie jest modułem wykonywalnym.
- **SW-android:** oddzielna aplikacja, nie jest jeszcze przeniesiona do tego repozytorium ani uruchamiana przez Node.js.
- **Wypłaty niedzielne:** aktualny moduł implementuje `/sw-wyplata`, a nie automatyczny cykl płac.
- **Uruchomienie produkcyjne:** wymaga konfiguracji zmiennych, uprawnień, ID kanałów, testów z prawdziwym Discordem i UnbelievaBoat.

## Dane i bezpieczeństwo

`data/sw-data.json` (kadry), `data/sw-stopnie.json` (lista stopni), `data/osadzeni.json` (osadzeni) są celowo oddzielne. Istniejących danych nie wolno zastępować pustymi szablonami podczas migracji.

Do repozytorium nie dodawaj `.env`, `TOKEN`, `UNB_API_TOKEN` ani adresów webhooków z poufnymi identyfikatorami. W publicznym źródłowym repozytorium SW-Wyplaty odnaleziono `.env`; wszelkie ujawnione tokeny należy unieważnić i wymienić. Samo skasowanie pliku nie usuwa go z historii Git.

Instrukcje ustawień i lista funkcji: [README.md](README.md).
