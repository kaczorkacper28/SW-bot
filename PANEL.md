# Centrum dowodzenia SW

Głównym projektem jest **SW-bot**. Kadry, osadzeni i przepustki, lista stopni, raporty,
wezwania, dokumenty, propozycje i ręczne wypłaty korzystają z jednego klienta Discord.
Nie uruchamiaj równocześnie starych botów z osobnych repozytoriów.

Panel ma osobny proces HTTP i ciemny interfejs służbowy w języku polskim. Nie wymaga
budowania frontendu ani dodatkowej bazy danych. Wymagany jest Node.js 22 lub 24. Instrukcja telefonu z Androidem: [ANDROID-TERMUX.md](ANDROID-TERMUX.md).

## Pierwsze uruchomienie

W katalogu `SW-bot`:

```sh
npm ci
npm run panel:admin -- --username admin
npm run dev:offline
```

Konfigurator pyta o niewidoczne hasło (minimum 12 znaków). Nie ma domyślnego hasła.
Przy ponownym wykonaniu konfiguratora konto jest zastępowane; zrestartuj proces panelu,
aby zakończyć wcześniejsze sesje. Nie podawaj hasła jako argumentu polecenia.

Panel domyślnie nasłuchuje na porcie **3200**, wyłącznie na `127.0.0.1`.
Tryb `dev:offline` uruchamia panel i moduły bota bez łączenia z Discordem.
Można tworzyć i edytować prawdziwe lokalne dane; nie są to rekordy demonstracyjne.
Zatrzymanie polecenia zatrzymuje oba uruchomione procesy.

## Uruchomienie Discorda

Skopiuj `.env.example` do `.env`, jeśli lokalny plik jeszcze nie istnieje, i uzupełnij
`TOKEN`, `CLIENT_ID`, `GUILD_ID` oraz ustawienia potrzebnych modułów. Nie dodawaj sekretów
do Gita. Bot potrzebuje uprawnień do używanych kanałów, wiadomości, reakcji i zarządzania
rolami/kanałami zależnie od modułu. Dodaj aplikację na serwer z zakresami `bot`
i `applications.commands`. Rejestracja komend zastępuje komendy tej aplikacji na serwerze.

```sh
npm run dev
```

Procesy można też uruchamiać osobno:

```sh
npm start
npm run panel
```

Do pracy bez Discorda zamiast `npm start` użyj `npm run start:offline`.
Przy błędzie uruchomienia lub zatrzymaniu bota `npm run dev` pozostawia panel
uruchomiony. Panel pokazuje brak połączenia z botem zamiast potwierdzenia zapisu.
Sprawdź komunikat błędu bota w terminalu. Ctrl+C zatrzymuje oba procesy; błąd
uruchomienia samego panelu zatrzymuje również bota.

## Dane i działanie panelu

- **Kadry:** wspólna ewidencja z komendami `/sw-*`; numer służbowy, stopień, plusy,
  minusy, nagany. Do identyfikacji używany jest Discord ID, nie nazwa użytkownika.
- **Osadzeni:** wspólny rejestr, dane kary i pozostały czas; zmiany są dostępne dla
  modułu Discord w tym samym procesie. Panel pozwala pauzować licznik.
- **Stopnie:** wspólna lista organizacyjna w sekcjach szefostwo, pracownicy, rekruci.
  Jest to lista obsługiwana komendami `/stopnie-*`, odrębna od stopnia w karcie kadrowej.
- **Raporty, wezwania, dokumenty, propozycje:** rejestry lokalne panelu i historia
  działań wykonanych przez moduły Discord. Dodanie lokalnego wpisu nie wysyła wiadomości
  na Discord ani nie tworzy ticketu. Raport, wezwanie i propozycję możesz następnie
  jawnie wysłać przyciskiem „Wyślij na Discord”, jeśli bot jest online i ustawiono
  odpowiednio `REPORT_CHANNEL_ID`, `CALL_CHANNEL_ID`, `PROPOSALS_CHANNEL_ID`.
  Publikacja propozycji dodaje reakcje głosowania. Przy niepotwierdzonej wysyłce
  system blokuje powtórzenie: sprawdź kanał przed rozstrzygnięciem operacji.
  Tickety dokumentów nadal obsługują właściwe komendy bota.
- **Wypłaty:** ewidencja. Dodanie wpisu w panelu nie przelewa pieniędzy.
  Rzeczywistą wypłatę wykonuje `/sw-wyplata` przez UnbelievaBoat.
  Wymaga `MAIN_GUILD_ID` i `UNB_API_TOKEN` oraz właściwych uprawnień.
- **Dziennik:** historia operacji panelu i zdarzeń zapisywanych przez moduły.

Dane pozostają w ignorowanym katalogu `data/`: `sw-data.json`, `osadzeni.json`,
`sw-stopnie.json`, `panel-records.json`. Konto panelu zawiera sól i skrót scrypt w
`panel-admin.json`; klucz prywatnego połączenia panel–bot jest w `panel-bridge.key`.
Zrób kopię katalogu przed migracją i zapewnij trwały dysk na hostingu.
Istniejących danych nie zastępuj szablonami. Dawna lista stopni z
`modules/data/sw-stopnie.json` jest kopiowana do nowej lokalizacji tylko wtedy,
gdy nowy plik jeszcze nie istnieje; stary plik pozostaje bez zmian.

Panel komunikuje się z prywatnym API bota na `127.0.0.1:3210`; oba procesy muszą
mieć dostęp do tego samego katalogu danych i portu zarządzania. Nie wystawiaj tego
portu publicznie. Uruchamiaj jedną instancję bota dla danego katalogu danych.

## Ustawienia

| Zmienna | Domyślnie | Znaczenie |
| --- | --- | --- |
| `PANEL_PORT` | `3200` | Port panelu |
| `PANEL_HOST` | `127.0.0.1` | Adres nasłuchu panelu |
| `MANAGEMENT_PORT` | `3210` | Prywatny port API bota |
| `SW_DATA_DIR` | `data/` w projekcie | Wspólny katalog trwałych danych |
| `PANEL_PUBLIC_ORIGIN` | brak | Dokładny origin HTTPS przy użyciu reverse proxy |
| `OFFLINE` | brak | `1` wyłącza logowanie do Discorda |

Przy udostępnianiu panelu użyj reverse proxy z HTTPS, ustaw dokładny
`PANEL_PUBLIC_ORIGIN` i ewentualnie `PANEL_HOST` zgodnie z hostingiem. Bez HTTPS
używaj panelu tylko lokalnie. Sesje mają cookies `HttpOnly` i `SameSite=Strict`,
na HTTPS także `Secure`; zmiany wymagają właściwego nagłówka `Origin`.
Logowanie ma ograniczenie prób, a sesje wygasają po 8 godzinach i po restarcie panelu.
Uprawnienia panelu należą do lokalnego administratora, nie są logowaniem Discord OAuth.

## Sprawdzenie

```sh
npm test
```

Testy uruchamiają się bez tokenów, korzystają z tymczasowych katalogów i sprawdzają
integrację komend, współdzielone dane i API panelu. Testy prawdziwego Discorda i
UnbelievaBoat wymagają poprawnej konfiguracji oraz oddzielnego sprawdzenia na serwerze.
Aplikacja Android pozostaje osobnym klientem w repozytorium `SW-android`;
nie jest uruchamiana przez `npm run dev`.
