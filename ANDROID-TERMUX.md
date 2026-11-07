# Bot i panel SW na telefonie z Androidem

Możesz uruchomić oba procesy na swoim telefonie bez opłaty za hosting.
Telefon potrzebuje internetu i uruchomionego Termuxa. Android może zatrzymać
aplikację w tle; to rozwiązanie nie zapewnia nieprzerwanej pracy 24/7.

## 1. Zainstaluj Termux

Zainstaluj [Termux z F-Droid](https://f-droid.org/packages/com.termux/).
Otwórz aplikację. W Termuxie wkleja się poniższe polecenia, nie w wyszukiwarce
Chrome ani na stronie GitHuba.

## 2. Pobierz projekt

Wklej w Termuxie:

```sh
pkg update
pkg install -y nodejs-lts npm git openssl
cd ~
git clone https://github.com/kaczorkacper28/SW-bot.git
cd SW-bot
npm ci
npm run configure
```

Aktualny pakiet Termuxa `nodejs-lts` używa Node.js 24; pakiet `npm` jest oddzielny,
dlatego instalujemy oba. Projekt obsługuje Node.js 22 i 24. Nie instaluj na Androidzie
zwykłego archiwum Node.js Linux x64. Repozytorium trzymaj w katalogu domowym Termuxa,
nie we współdzielonej pamięci `/sdcard` ani `storage/shared`.

Jeżeli masz już katalog `SW-bot`, przejdź do niego. Przed aktualizacją zachowaj swoje
zmiany. Gdy drzewo robocze jest czyste, użyj `git pull --ff-only`, potem `npm ci`.
Aktualizacja nie przenosi lokalnego `.env` ani danych z innego urządzenia.

## 3. Uzupełnij konfigurację

Konfigurator zapyta o token bota, ID aplikacji (`CLIENT_ID`), ID serwera
(`GUILD_ID`) oraz konto administratora panelu. Token i hasło wpisuje się niewidocznie
w terminalu; brak znaków podczas wpisywania jest normalny. Token nie jest zapisywany
w historii poleceń. Hasło panelu musi mieć co najmniej 12 znaków.

Wygeneruj nowy token w **Discord Developer Portal → aplikacja → Bot → Reset Token**,
jeżeli poprzedni został ujawniony. Nowy token wklej wyłącznie w terminalu.
Tokena, hasła, pliku `.env` ani zawartości katalogu `data/` nie wysyłaj na GitHuba
ani na czat. Konfiguracja jest lokalna dla telefonu — plik z chmury nie pojawi się
automatycznie w nowo sklonowanym repozytorium.

Identyfikatory można przekazać jako domyślne wartości pytań:

```sh
npm run configure -- --client-id ID_APLIKACJI --guild-id ID_SERWERA
```

Przy kolejnym uruchomieniu konfigurator zachowuje istniejące ustawienia. Puste pole
tokena zachowuje istniejący token. Konto panelu zostaje zachowane; do jawnego
zastąpienia konta użyj `npm run configure -- --reset-admin`, a potem zrestartuj panel.
Jeśli token jest fikcyjny lub nieprawidłowy, bot nie zaloguje się do Discorda.

Opcjonalne ustawienia kanałów i wypłat są opisane w `.env.example` i `PANEL.md`.

## 4. Uruchom bota i panel

W katalogu `SW-bot`:

```sh
termux-wake-lock
npm run dev
```

Zostaw Termux uruchomiony. W ustawieniach Androida ustaw dla Termuxa pracę bez
ograniczeń baterii, jeśli telefon udostępnia taką opcję. Blokada uśpienia pomaga,
ale nie chroni przed każdym zatrzymaniem aplikacji przez system.

W Chrome **na tym samym telefonie** wpisz w pasek adresu:

```text
http://127.0.0.1:3200
```

Zaloguj się kontem utworzonym w konfiguratorze. Jest to panel lokalny telefonu;
inne urządzenia nie uzyskają do niego dostępu przez ten adres. Nie zmieniaj
`PANEL_HOST`, jeśli nie konfigurujesz świadomie udostępniania panelu.

Jeżeli chcesz najpierw przetestować sam panel bez połączenia z Discordem:

```sh
npm run dev:offline
```

Bot musi być dodany do wskazanego serwera Discord z odpowiednimi uprawnieniami
oraz zakresami `bot` i `applications.commands`. Pierwsze połączenie rejestruje
komendy tej aplikacji. Zgodność z Node.js jest testowana automatycznie na Linuxie;
uruchomienie na Twoim modelu telefonu wymaga sprawdzenia w Termuxie.

## Zatrzymanie i następny start

Naciśnij **Ctrl+C** w Termuxie, aby zatrzymać oba procesy, następnie wykonaj
`termux-wake-unlock`, jeżeli kończysz pracę. Przy następnym uruchomieniu wystarczy:

```sh
cd ~/SW-bot
termux-wake-lock
npm run dev
```

Nie odinstalowuj Termuxa i nie czyść jego danych bez kopii bazy. Ewidencja oraz
konto administratora znajdują się w lokalnym katalogu `SW-bot/data/`.
