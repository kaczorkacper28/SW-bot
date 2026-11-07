# Zintegrowany bot i osobny panel SW

Jeden bot Discord z modułami SW oraz osobny ciemny panel administracyjny.
Panel obsługuje osobne konta, role i automatyczne powiadomienia na Discordzie o zmianach we wszystkich modułach danych.
Dostęp przez internet z Termuxa: `npm run panel:share` (pakiet `cloudflared`).
Instrukcja panelu, uruchamiania i zakres operacji: **[PANEL.md](PANEL.md)**.

**Android bez płatnego hostingu:** [instrukcja Termuxa](ANDROID-TERMUX.md).
Konfigurator w terminalu: `npm run configure`.

Szybki start na Node.js 22 lub 24: `npm ci`, `npm run panel:admin -- --username admin`,
`npm run dev:offline`. Z tokenem Discord użyj `npm run dev`.

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

---

## Jeden bot — zintegrowane moduły

Wszystkie poniższe moduły korzystają z `index.js`, jednego `Client` i jednego `TOKEN`:

| Moduł | Plik | Komendy |
| --- | --- | --- |
| Kadry | `index.js` | `/sw-dodaj`, `/sw-awans`, `/sw-kadra` i pozostałe |
| Osadzeni | `osadzeni.js` | `/osadzony-dodaj`, `/osadzeni`, `/przepustka` |
| Stopnie / lista SW | `modules/stopnie.js` | `/stopnie-dodaj`, `/stopnie-usun`, `/stopnie-lista`, `/stopnie-przenies`, `/stopnie-ustaw-kanal`, `/stopnie-reset`, `/stopnie-tytul` |
| Raporty | `modules/raport.js` | `/raport-panel`, przycisk „Złóż raport” |
| Wezwania | `modules/wezwanie.js` | `/wezwanie` |
| Dokumenty | `modules/dokumenty.js` | `/setup-dokumenty`, formularze i tickety |
| Propozycje | `modules/propozycje.js` | `/panel-propozycje`, formularz i reakcje |
| Wypłaty manualne | `modules/wyplaty.js` | `/sw-wyplata` (UnbelievaBoat API) |

Zmiana nazw komend „stopnie” zapobiega konfliktom z kadrami. Dane kadr są zapisywane w `data/sw-data.json`, osadzeni w `data/osadzeni.json`, a lista stopni w `data/sw-stopnie.json`. **Nie nadpisuj istniejących plików danych podczas migracji.** Na hostingu musi istnieć trwała przestrzeń na katalog `data/`, inaczej zapisy mogą zniknąć po restarcie.

### Konfiguracja

Skopiuj `.env.example` do lokalnego pliku `.env`, ale **nie dodawaj go do GitHub**. Ustaw:
- Podstawowe: `TOKEN`, `CLIENT_ID`, `GUILD_ID`.
- Raporty: `REPORT_CHANNEL_ID` (ID kanału raportów).
- Wezwania: `ROLE_ID` i `CALL_CHANNEL_ID` (opcjonalne ograniczenie roli i docelowy kanał).
- Dokumenty: `STAFF_ROLE_IDS` (ID ról kadry rozdzielone przecinkami).
- Propozycje: `PROPOSALS_CHANNEL_ID` (opcjonalne).
- Wypłaty: `MAIN_GUILD_ID` (serwer ekonomii), `UNB_API_TOKEN` (nowy token API), `PAYOUT_ROLE_ID` (rola uprawniona do wypłat), `LOG_CHANNEL_ID` (opcjonalne logi), `SW_GUILD_ID` (opcjonalny osobny serwer SW; domyślnie `GUILD_ID`).

Gdy `SW_GUILD_ID` różni się od `GUILD_ID`, bot rejestruje `/sw-wyplata` na tym dodatkowym serwerze; ta sama aplikacja Discord musi być na nim dodana. Rejestracja komend zastępuje komendy **tej aplikacji** na wskazanym serwerze.

`/sw-wyplata` dodaje podaną kwotę do gotówki użytkownika na `MAIN_GUILD_ID`. Wyłącznie administrator lub rola `PAYOUT_ROLE_ID` może wypłacać. To **wypłata ręczna**, nie automatyczny harmonogram niedzielny. Jeśli API nie odpowie, sprawdź saldo przed powtórzeniem, aby nie wypłacić podwójnie.

### Uruchomienie i sprawdzenie

```bash
npm install
npm start
```

Na jednym procesie uruchamiaj tylko **główne `index.js`**. Nie uruchamiaj plików w `modules/` oddzielnie. Integracja wymaga sprawdzenia na prawdziwym serwerze, konfiguracji uprawnień oraz przetestowania bezpiecznej, małej wypłaty.

### Ważne bezpieczeństwo

W źródłowym repozytorium `SW-Wyplaty` znajdował się publicznie dostępny plik `.env`. Usuń go z repozytorium i **unieważnij / wygeneruj nowe tokeny Discord i UnbelievaBoat**, jeśli były w tym pliku. Plik pozostaje w historii Git, nawet po usunięciu bieżącej wersji. `.gitignore` w tym repozytorium chroni tylko przed przyszłym dodaniem lokalnego `.env`.
