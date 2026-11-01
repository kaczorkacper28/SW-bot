# 🛡️ SW Central — główny projekt Służby Więziennej

To repozytorium jest głównym punktem projektu SW. Główny bot Discord pozostaje w katalogu głównym.

## Projekty do połączenia

| Projekt | Rola |
|---|---|
| [SW-bot](https://github.com/kaczorkacper28/SW-bot) | Główny bot i kadry |
| [SW-Osadzieni](https://github.com/kaczorkacper28/SW-Osadzieni) | Rejestr osadzonych i przepustki |
| [SW-stopnie](https://github.com/kaczorkacper28/SW-stopnie) | Lista i stopnie funkcjonariuszy |
| [SW-RAPORT](https://github.com/kaczorkacper28/SW-RAPORT) | Raporty służbowe |
| [SW-CENTRUM](https://github.com/kaczorkacper28/SW-CENTRUM) | Dokumentacja i centrum systemu |
| [propozycja-SW](https://github.com/kaczorkacper28/propozycja-SW) | Propozycje |
| [SW-Wyplaty](https://github.com/kaczorkacper28/SW-Wyplaty) | Wypłaty |
| [Wezwanie-SW](https://github.com/kaczorkacper28/Wezwanie-SW) | Wezwania |
| [SW-Set-Bot](https://github.com/kaczorkacper28/SW-Set-Bot) | Dokumenty służbowe |
| [SW-android](https://github.com/kaczorkacper28/SW-android) | Aplikacja Android |

## Ważne

Rejestr modułów znajduje się w `SW-MODULES.json`. To jest spis integracyjny, a nie jeszcze gotowe podłączenie kodu wszystkich repozytoriów. Przed uruchomieniem jako jednego procesu trzeba przenieść źródła modułów, ujednolicić rejestrację komend i eventów oraz sprawdzić konfigurację i pliki danych.

Nie uruchamiaj osobnych `npm start` dla każdego modułu w tym samym bocie Discord — docelowo jeden klient Discord i jedna rejestracja komend.

Aplikacja Android pozostaje osobnym projektem w ramach tego samego repozytorium i nie jest ładowana przez Node.js.

## Bezpieczeństwo

Nie dodawaj tokenów Discord, webhooków ani pliku `.env` do GitHuba.
