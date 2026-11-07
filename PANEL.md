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
Polecenie `panel:admin` tworzy lub resetuje wskazane konto administratora,
zachowując pozostałe konta. Zmiana hasła unieważnia wcześniejsze sesje tego konta.
Nie podawaj hasła jako argumentu polecenia.

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
- **Osadzeni:** wspólny rejestr, dane kary i pozostały czas. Dodanie, edycja lub
  usunięcie w panelu tworzy automatyczne powiadomienie na Discordzie i aktualizuje
  kartę osadzonego. Panel pozwala pauzować licznik. Kolejka zachowuje zmiany offline
  i pokazuje rzeczywisty stan wysyłki; szczegóły poniżej.
- **Stopnie:** wspólna lista organizacyjna w sekcjach szefostwo, pracownicy, rekruci.
  Jest to lista obsługiwana komendami `/stopnie-*`, odrębna od stopnia w karcie kadrowej.
- **Raporty, wezwania, dokumenty, propozycje:** rejestry lokalne panelu i historia
  działań wykonanych przez moduły Discord. Każdy zapis, edycja i usunięcie z panelu
  wysyła krótkie powiadomienie o zmianie. Raport, wezwanie i propozycję możesz też
  wysłać przyciskiem „Opublikuj pełną treść”, jeśli bot jest online i ustawiono
  odpowiednio `REPORT_CHANNEL_ID`, `CALL_CHANNEL_ID`, `PROPOSALS_CHANNEL_ID`.
  Publikacja propozycji dodaje reakcje głosowania. Przy niepotwierdzonej wysyłce
  system blokuje powtórzenie: sprawdź kanał przed rozstrzygnięciem operacji.
  Tickety dokumentów nadal obsługują właściwe komendy bota.
- **Formularz raportu służbowego:** funkcjonariusz, ID Discord, data i godziny
  służby, miejsce, rodzaj oraz przebieg służby. Przycisk „Złóż raport” otwiera
  ten formularz. Datę wybiera się z kalendarza; w ewidencji i na Discordzie ma
  format `DD.MM.RRRR`. Pełna publikacja używa tej samej zielonej karty co formularz
  Discord: „📋 NOWY RAPORT SŁUŻBOWY”, z informacją o funkcjonariuszu i wszystkimi
  sekcjami służby. Treść do 4000 znaków jest dzielona na dalsze sekcje, gdy wymaga
  tego limit Discorda. Dotychczasowe wpisy pozostają zachowane; brakujące dane
  można uzupełnić podczas edycji. Krótkie powiadomienie o zmianie i publikacja
  pełnego raportu są nadal osobnymi operacjami.
- **Wypłaty:** ewidencja. Dodanie wpisu w panelu nie przelewa pieniędzy.
  Rzeczywistą wypłatę wykonuje `/sw-wyplata` przez UnbelievaBoat.
  Wymaga `MAIN_GUILD_ID` i `UNB_API_TOKEN` oraz właściwych uprawnień.
- **Dziennik:** historia operacji panelu i zdarzeń zapisywanych przez moduły.

Dane pozostają w ignorowanym katalogu `data/`: `sw-data.json`, `osadzeni.json`,
`sw-stopnie.json`, `panel-records.json`. Konta zawierają sól i skróty scrypt w `panel-users.json`. Dotychczasowy
`panel-admin.json` jest migrowany przy pierwszym użyciu; po migracji nadrzędny
jest `panel-users.json`. Klucz prywatnego połączenia panel–bot jest w `panel-bridge.key`.
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
Panel obsługuje osobne konta i role; nie używa logowania Discord OAuth.

## Sprawdzenie

```sh
npm test
```

Testy uruchamiają się bez tokenów, korzystają z tymczasowych katalogów i sprawdzają
integrację komend, współdzielone dane i API panelu. Testy prawdziwego Discorda i
UnbelievaBoat wymagają poprawnej konfiguracji oraz oddzielnego sprawdzenia na serwerze.
Aplikacja Android pozostaje osobnym klientem w repozytorium `SW-android`;
nie jest uruchamiana przez `npm run dev`.

## Inni użytkownicy i dostęp przez internet

Po zalogowaniu jako administrator otwórz **Użytkownicy**. Utwórz osobne konto
dla każdej osoby i wybierz rolę:

| Rola | Uprawnienia |
| --- | --- |
| Administrator | Zarządzanie danymi, kontami i ponawianiem powiadomień |
| Operator | Dodawanie, edycja i usuwanie danych oraz publikacja na Discordzie |
| Podgląd | Odczyt danych, bez operacji zapisu |

Nie ma publicznej rejestracji. Hasła mają minimum 12 znaków. Reset hasła,
zmiana roli i wyłączenie konta unieważniają wcześniejsze sesje. Ostatniego
aktywnego administratora nie można usunąć, wyłączyć ani pozbawić roli.
Stare konto administratora zostaje zachowane podczas migracji.

Dla telefonu z Termuxem można użyć tymczasowego linku HTTPS Cloudflare.
Najpierw zatrzymaj dotychczasowy `npm run dev` przez CTRL+C, następnie:

```sh
pkg install -y cloudflared
cd ~/SW-bot
npm run panel:share
```

Program wymaga istniejącego administratora. Gdy panel i tunel są gotowe, wypisze
**LINK DO PULPITU**. Otwórz ten link także na własnym telefonie. Inne osoby
otwierają ten sam adres w swoich przeglądarkach i logują się własnymi kontami.
Hasła przekazuj indywidualnie; nigdy nie udostępniaj tokena bota.

Panel nadal nasłuchuje lokalnie; cloudflared dostarcza dostęp HTTPS. Port
zarządzania 3210 nie jest udostępniany. Nie potrzeba konta Cloudflare ani
płatnego hostingu do tymczasowego Quick Tunnel. Link może zmienić się po
ponownym uruchomieniu, a telefon i Termux muszą pozostać online. Usługa
zewnętrzna może odmówić połączenia lub je przerwać; nie jest to hosting 24/7.
CTRL+C kończy tunel i uruchomione przez niego procesy.

`npm run panel:share:offline` udostępnia tryb lokalny bez logowania do Discorda.
Testy helpera używają atrapy cloudflared i nie publikują danych w internecie.
Połączenie rzeczywistego tunelu trzeba sprawdzić na telefonie.

## Automatyczne wiadomości ze wszystkich modułów

Dodanie, edycja i usunięcie przez panel tworzy powiadomienie dla **kadr, osadzonych,
stopni, raportów, wezwań, dokumentów, propozycji i wypłat**. Wiadomość zawiera rodzaj
zmiany, dane wpisu i nazwę operatora panelu. Powiadomienia nie obejmują kont
użytkowników ani dziennika operacji.

Kanały wybiera się osobno dla modułów. Wszystkie muszą należeć do `GUILD_ID`:

| Moduł | Opcjonalna zmienna w `.env` | Ustawienie zastępcze / nazwa kanału |
| --- | --- | --- |
| Kadry | `PANEL_MEMBERS_CHANNEL_ID` | Kanał logów zapisany przez moduł kadr, następnie `kadry` lub `funkcjonariusze` |
| Osadzeni | `PRISONERS_CHANNEL_ID` | `osadzeni` lub `osądzeni` |
| Stopnie | `PANEL_RANKS_CHANNEL_ID` | Kanał zapisany przez moduł stopni, następnie `stopnie` lub `lista-sw` |
| Raporty | `PANEL_REPORTS_CHANNEL_ID` | `REPORT_CHANNEL_ID`, następnie `raporty` lub `raporty-służbowe` |
| Wezwania | `PANEL_CALLS_CHANNEL_ID` | `CALL_CHANNEL_ID`, następnie `wezwania` |
| Dokumenty | `PANEL_DOCUMENTS_CHANNEL_ID` | `dokumenty` |
| Propozycje | `PANEL_PROPOSALS_CHANNEL_ID` | `PROPOSALS_CHANNEL_ID`, następnie `propozycje` |
| Wypłaty | `PANEL_PAYOUTS_CHANNEL_ID` | `LOG_CHANNEL_ID`, następnie `wypłaty` |

Podane ID ma pierwszeństwo. Brak dostępu do wskazanego kanału jest błędem;
bot nie wybiera wtedy innego kanału. Przy wyszukiwaniu nazw pomija emoji,
separatory i polskie znaki. Gdy pasuje kilka kanałów, ustaw jednoznaczne ID.
Bot nie tworzy kanałów automatycznie. Potrzebuje uprawnień do wyświetlania kanału,
wysyłania wiadomości i osadzania linków; dla kart osadzonych również historii.

W widoku **Powiadomienia** można filtrować historię według modułu i stanu.
Historia jest też dostępna przy konkretnym wpisie. Po zapisie panel pokazuje
rzeczywisty wynik: wysłano, oczekuje, błąd albo wynik wymagający sprawdzenia.
Administrator może ponawiać zakończone błędem wysyłki po usunięciu przyczyny.
Zapis danych pozostaje ważny także przy awarii Discorda.

Automatyczny komunikat informuje o zmianie ewidencji. Pełna publikacja raportu,
wezwania lub propozycji jest osobną operacją. Samo powiadomienie nie rozpoczyna
głosowania, nie tworzy ticketu dokumentów, nie nadaje ról i nie wykonuje przelewu.
Komunikat o wypłacie dotyczy wpisu w ewidencji, również przy jego edycji lub usunięciu.
Wiadomości nie uruchamiają wzmianek. Operacje wykonane bezpośrednio przez komendy
Discord zachowują własne wiadomości; zapis ich historii nie tworzy drugiego powiadomienia.

Kolejki zapisują się w `data/resource-notifications.json` oraz
`data/prisoner-notifications.json`. Zmiany wykonane offline czekają na powrót
bota, a restart nie usuwa oczekujących wpisów. Niepotwierdzona wysyłka jest blokowana
przed powtórzeniem: sprawdź wtedy kanał Discord. Dane kolejek wymagają takiej samej
kopii zapasowej jak pozostałe pliki w `data/`.

### Karty osadzonych

Bot używa kanału `PRISONERS_CHANNEL_ID` na serwerze `GUILD_ID`. Bez podanego ID
szuka istniejącego kanału o nazwie **osadzeni** (również z emoji lub nazwą
osądzeni). Jeżeli istnieje kilka podobnych kanałów, ustaw jednoznaczne ID w `.env`.
Bot potrzebuje dostępu do kanału, wysyłania wiadomości, osadzania linków i
czytania historii wiadomości.

Dodanie tworzy kartę osadzonego; edycja odświeża kartę i wysyła komunikat
o zmianie; usunięcie oznacza kartę jako usuniętą i wysyła komunikat. Powiadomienie
zawiera nazwę operatora panelu. Wiadomości nie uruchamiają zbiorowych wzmianek.

Stan powiadomień jest w `data/prisoner-notifications.json`. Przy pracy offline
zmiany czekają i są wysyłane po powrocie bota. Błędy konfiguracji lub uprawnień
pokazują niepowodzenie; administrator może je ponowić po usunięciu przyczyny.
Niepotwierdzona wysyłka jest blokowana przed powtórzeniem, aby nie tworzyć
duplikatów — sprawdź wtedy kanał Discord. Zapis danych nie jest cofany przez
awarię Discorda. Samo odświeżanie licznika kary nie wysyła nowych komunikatów.
