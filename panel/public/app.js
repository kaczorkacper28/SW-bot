const PRISONER_PARAGRAPHS_RP = [{"numer":1,"opis":"Próba kradzieży","minuty":10},{"numer":2,"opis":"Kradzież mienia","minuty":15},{"numer":3,"opis":"Kradzież pojazdu","minuty":20},{"numer":4,"opis":"Włamanie do budynku lub pojazdu","minuty":20},{"numer":5,"opis":"Rozbój","minuty":30},{"numer":6,"opis":"Napad z użyciem broni","minuty":45},{"numer":7,"opis":"Oszustwo majątkowe","minuty":15},{"numer":8,"opis":"Wymuszenie pieniędzy lub haraczu","minuty":25},{"numer":9,"opis":"Umyślne zniszczenie mienia","minuty":10},{"numer":10,"opis":"Groźby karalne","minuty":10},{"numer":11,"opis":"Pobicie","minuty":20},{"numer":12,"opis":"Spowodowanie ciężkich obrażeń","minuty":35},{"numer":13,"opis":"Usiłowanie zabójstwa","minuty":50},{"numer":14,"opis":"Zabójstwo","minuty":60},{"numer":15,"opis":"Uprowadzenie lub bezprawne przetrzymywanie osoby","minuty":40},{"numer":16,"opis":"Wzięcie zakładnika","minuty":45},{"numer":17,"opis":"Nielegalne posiadanie broni","minuty":20},{"numer":18,"opis":"Nielegalny handel bronią","minuty":40},{"numer":19,"opis":"Bezprawne użycie broni, bez spowodowania obrażeń","minuty":25},{"numer":20,"opis":"Nielegalne posiadanie materiałów wybuchowych","minuty":35},{"numer":21,"opis":"Spowodowanie wybuchu lub podpalenia zagrażającego ludziom","minuty":50},{"numer":22,"opis":"Posiadanie substancji zabronionych","minuty":10},{"numer":23,"opis":"Handel substancjami zabronionymi","minuty":30},{"numer":24,"opis":"Produkcja substancji zabronionych","minuty":40},{"numer":25,"opis":"Ucieczka przed patrolem po poleceniu zatrzymania","minuty":15},{"numer":26,"opis":"Czynna napaść na funkcjonariusza","minuty":30},{"numer":27,"opis":"Utrudnianie interwencji z użyciem przemocy","minuty":20},{"numer":28,"opis":"Próba przekupienia funkcjonariusza","minuty":20},{"numer":29,"opis":"Przyjęcie łapówki przez funkcjonariusza","minuty":30},{"numer":30,"opis":"Podszywanie się pod funkcjonariusza","minuty":20},{"numer":31,"opis":"Fałszowanie dokumentów lub posługiwanie się nimi","minuty":20},{"numer":32,"opis":"Niszczenie albo ukrywanie dowodów","minuty":15},{"numer":33,"opis":"Celowe składanie fałszywych zeznań","minuty":15},{"numer":34,"opis":"Udział w zorganizowanej grupie przestępczej","minuty":35},{"numer":35,"opis":"Kierowanie zorganizowaną grupą przestępczą","minuty":50},{"numer":36,"opis":"Ucieczka z konwoju lub zakładu karnego","minuty":30},{"numer":37,"opis":"Próba ucieczki z konwoju lub zakładu karnego","minuty":15},{"numer":38,"opis":"Pomoc w ucieczce osadzonego","minuty":25},{"numer":39,"opis":"Przemyt broni lub substancji zabronionych do więzienia","minuty":25},{"numer":40,"opis":"Zorganizowanie buntu z użyciem przemocy","minuty":35},{"numer":41,"opis":"Udział w buncie z użyciem przemocy","minuty":20},{"numer":42,"opis":"Wtargnięcie na zabezpieczony teren zakładu karnego","minuty":15},{"numer":43,"opis":"Umyślne uszkodzenie zabezpieczeń więzienia","minuty":20},{"numer":44,"opis":"Niepowrót z przepustki bez usprawiedliwienia","minuty":15},{"numer":45,"opis":"Celowe spowodowanie wypadku zagrażającego ludziom","minuty":30}];
"use strict";

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const icons = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    rank: '<path d="m4 9 8-5 8 5-8 5-8-5Zm0 6 8 5 8-5m-16-3 8 5 8-5"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8m-8 4h6"/>',
    call: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 3.09 5.18 2 2 0 0 1 5.08 3h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.67 2.79a2 2 0 0 1-.45 2.11L9.03 10.9a16 16 0 0 0 4.07 4.07l1.27-1.27a2 2 0 0 1 2.11-.45c.9.32 1.83.55 2.79.67A2 2 0 0 1 22 16.92Z"/>',
    folder: '<path d="M22 19V7a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2Z"/>',
    idea: '<path d="M9 18h6m-6 3h6m-7-7a7 7 0 1 1 8 0c-1 .7-1 2-1 2H9s0-1.3-1-2Z"/>',
    wallet: '<path d="M20 8V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v11H5a3 3 0 0 1-3-3V6m18 6h-5v5h5m-2-2.5h.01"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.55-2.61L20 7M4 17l2.35 2.61A7 7 0 0 0 17.9 17"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9"/>',
    search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
    edit: '<path d="m16 3 5 5M4 20l4-1L21 6a2.12 2.12 0 0 0-3-3L5 16l-1 4Z"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3m-10 0 1 14h12l1-14M10 10v6m4-6v6"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    shield: '<path d="m12 3 9 4v5c0 5-9 10-9 10S3 17 3 12V7l9-4Z"/><path d="m8 12 3 3 5-6"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
    send: '<path d="m22 2-7 20-4-9-9-4L22 2ZM11 13 22 2"/>',
  };
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    // Icon markup is a fixed local dictionary, never server or user input.
    svg.innerHTML = icons[name] || icons.file;
    return svg;
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function button(text, className, handler, iconName) {
    const node = el("button", className || "button secondary");
    node.type = "button";
    if (iconName) node.append(icon(iconName));
    node.append(document.createTextNode(text));
    node.addEventListener("click", handler);
    return node;
  }
  const rankNames = ["Rekrut", "Szeregowy", "Starszy szeregowy", "Kapral", "Starszy kapral", "Plutonowy", "Sierżant", "Starszy sierżant", "Sierżant sztabowy", "Chorąży", "Starszy chorąży", "Chorąży sztabowy", "Podporucznik", "Porucznik", "Kapitan", "Major", "Podpułkownik", "Pułkownik", "Generał", "Generał inspektor"];
  const statuses = ["nowy", "w toku", "zatwierdzony", "odrzucony", "zamknięty"];
  const roleLabels = {admin:"Administrator",operator:"Operator",viewer:"Podgląd"};
  const businessResources = ["members","prisoners","passes","ranks","reports","calls","documents","proposals","payouts"];
  const actionLabels = {create:"Dodano wpis",update:"Zaktualizowano wpis",remove:"Usunięto wpis",delete:"Usunięto wpis",approve:"Zatwierdzono wniosek",reject:"Odrzucono wniosek",discord:"Aktywność Discord",publish:"Opublikowano na Discordzie","publish-pending":"Rozpoczęto publikację","publish-uncertain":"Sprawdź wynik publikacji na Discordzie"};
  const sections = {szefostwo: "Szefostwo", pracownicy: "Pracownicy SW", rekruci: "Rekruci"};
  const resources = {
    members: {label:"Funkcjonariusze", singular:"funkcjonariusza", icon:"users", description:"Ewidencja kadry, stopnie i historia służby.", fields:[
      {key:"userId",label:"ID użytkownika Discord",required:true,pattern:"[0-9]{17,20}",help:"17–20 cyfr. Ten identyfikator łączy wpis z botem.",immutable:true,full:true},
      {key:"name",label:"Imię i nazwisko / pseudonim",max:100,full:true},
      {key:"number",label:"Numer służbowy SW",type:"number",min:1,max:9999,required:true},
      {key:"rank",label:"Stopień służbowy",options:rankNames,required:true},
      {key:"plus",label:"Plusy",type:"number",min:0,default:0},
      {key:"minus",label:"Minusy",type:"number",min:0,default:0},
      {key:"reprimands",label:"Nagany",type:"number",min:0,default:0},
    ]},
    prisoners: {label:"Osadzeni",singular:"osadzonego",icon:"lock",description:"Rejestr osadzonych i bieżących kar.",fields:[
      {key:"imie",label:"Imię i nazwisko",required:true,max:100,full:true},
      {key:"paragraf",label:"Paragraf / przyczyna osadzenia",required:true,max:500,full:true},
      {key:"wyrok",label:"Wymiar kary",required:true,max:100,help:"Np. 2 miesiące lub opis wyroku."},
      {key:"poczatek",label:"Początek kary",type:"time",required:true,help:"Czas serwera, format HH:MM."},
      {key:"koniec",label:"Koniec kary",type:"time",required:true,help:"Wcześniejsza godzina oznacza kolejny dzień."},
      {key:"cela",label:"Numer celi",required:true,max:50},
      {key:"uwagi",label:"Uwagi",type:"textarea",max:1000,full:true},
      {key:"przepustka",label:"Przepustka udzielona",type:"checkbox",default:false,full:true,adminOnly:true,help:"Ręczne oznaczenie administratora. Wnioski i decyzje są dostępne w zakładce Przepustki."},
      {key:"paused",label:"Wstrzymaj odliczanie kary",type:"checkbox",editOnly:true,full:true},
    ]},
    passes: {label:"Przepustki",singular:"wniosek o przepustkę",icon:"file",description:"Wnioski o przepustki i decyzje uprawnionej kadry.",fields:[
      {key:"osadzonyId",label:"Osadzony",required:true,full:true,options:()=>[["","Wybierz osadzonego"],...collection("prisoners").map(item=>[String(item.id),item.id+" · "+item.imie])]},
      {key:"od",label:"Od godziny",type:"time",required:true},
      {key:"do",label:"Do godziny",type:"time",required:true,help:"Wcześniejsza godzina oznacza powrót następnego dnia."},
      {key:"powod",label:"Powód przepustki",type:"textarea",required:true,max:1000,full:true},
      {key:"miejsce",label:"Miejsce pobytu",required:true,max:200,full:true},
    ]},
    ranks: {label:"Lista stopni",singular:"wpis do listy SW",icon:"rank",description:"Lista przydziałów i numerów w działach Służby Więziennej.",fields:[
      {key:"userId",label:"ID użytkownika Discord",required:true,pattern:"[0-9]{17,20}",immutable:true,full:true},
      {key:"section",label:"Dział",options:Object.entries(sections),required:true},
      {key:"number",label:"Numer w dziale",type:"number",min:1,max:9999,required:true},
    ]},
    reports: {label:"Raporty",singular:"raport",icon:"file",description:"Raporty służbowe i dokumentacja działań.",fields:[
      {key:"author",label:"Funkcjonariusz",required:true,max:100,full:true,help:"Imię i nazwisko lub pseudonim osoby składającej raport."},
      {key:"authorId",label:"ID użytkownika Discord",required:true,pattern:"[0-9]{17,20}",max:20,full:true,help:"17–20 cyfr identyfikatora funkcjonariusza na Discordzie."},
      {key:"date",label:"Data służby",type:"date",required:true},
      {key:"hours",label:"Godziny służby",required:true,max:100,help:"Np. 20:00 lub 20:00–22:00."},
      {key:"place",label:"Miejsce służby",required:true,max:200,full:true},
      {key:"serviceType",label:"Rodzaj służby",required:true,max:100,full:true},
      {key:"content",label:"Przebieg służby",type:"textarea",required:true,max:4000,full:true},
    ]},
    calls: {label:"Wezwania",singular:"wezwanie",icon:"call",description:"Ewidencja wezwań i ich realizacji.",fields:[
      {key:"title",label:"Tytuł / sygnatura wezwania",max:200,full:true},
      {key:"target",label:"Osoba wzywana",required:true,max:200},
      {key:"status",label:"Status",options:statuses},
      {key:"reason",label:"Powód wezwania",required:true,type:"textarea",max:1000,full:true},
    ]},
    documents: {label:"Dokumenty",singular:"dokument",icon:"folder",description:"Wnioski, decyzje i notatki jednostki.",fields:[
      {key:"title",label:"Nazwa dokumentu",required:true,max:200,full:true},
      {key:"kind",label:"Rodzaj",options:["notatka","wniosek","decyzja","inne"]},
      {key:"status",label:"Status",options:statuses},
      {key:"content",label:"Treść dokumentu",type:"textarea",required:true,max:5000,full:true},
    ]},
    proposals: {label:"Propozycje",singular:"propozycję",icon:"idea",description:"Pomysły i usprawnienia zgłaszane przez kadrę.",fields:[
      {key:"title",label:"Tytuł propozycji",required:true,max:200,full:true},
      {key:"author",label:"Autor",max:100},
      {key:"status",label:"Status",options:statuses},
      {key:"content",label:"Opis propozycji",type:"textarea",required:true,max:4000,full:true},
    ]},
    payouts: {label:"Wypłaty",singular:"wpis wypłaty",icon:"wallet",description:"Ewidencja rozliczeń i wniosków o wypłatę.",notice:"Panel prowadzi ewidencję wypłat. Zapis lub zatwierdzenie wpisu nie wysyła pieniędzy. Faktyczną wypłatę wykonuje uprawniona osoba komendą /sw-wyplata na Discordzie.",fields:[
      {key:"recipient",label:"Odbiorca / ID Discord",required:true,max:200,full:true},
      {key:"amount",label:"Kwota (zł)",type:"number",min:1,max:1000000000,required:true},
      {key:"status",label:"Status wpisu",options:statuses},
      {key:"reason",label:"Powód wypłaty",required:true,type:"textarea",max:1000,full:true},
    ]},
    audit: {label:"Dziennik operacji",icon:"activity",description:"Historia operacji zarejestrowanych przez system.",readonly:true},
    notifications: {label:"Powiadomienia",icon:"send",description:"Automatyczne zgłoszenia zmian na Discordzie.",readonly:true},
    users: {label:"Użytkownicy",icon:"shield",description:"Konta służbowe i uprawnienia dostępu do panelu.",adminOnly:true},
  };
  let snapshot = null;
  let currentView = "overview";
  let search = "";
  let authenticated = false;
  let loading = false;
  let activeForm = null;
  let pendingDelete = null;
  let pendingPublish = null;
  let pendingPassDecision = null;
  let passStatusFilter = "oczekuje";
  let lastRefresh = null;
  let account = {id:null,username:"",role:"viewer"};
  let users = null;
  let usersLoading = false;
  let usersError = "";
  let notificationFilters = {resource:"",status:""};
  const canWrite = () => authenticated && ["admin","operator"].includes(account.role);
  const isAdmin = () => authenticated && account.role === "admin";
  const dialogsOpen = () => ["#record-dialog","#confirm-dialog","#publish-dialog","#pass-decision-dialog"].some(selector => $(selector).open);
  const dateFormat = new Intl.DateTimeFormat("pl-PL", {timeZone:"Europe/Warsaw",day:"numeric",month:"long",year:"numeric"});
  const timeFormat = new Intl.DateTimeFormat("pl-PL", {timeZone:"Europe/Warsaw",hour:"2-digit",minute:"2-digit"});
  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return dateFormat.format(date) + ", " + timeFormat.format(date);
  }
  function shortDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    if (new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Warsaw"}).format(date) === new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Warsaw"}).format(new Date())) return timeFormat.format(date);
    return new Intl.DateTimeFormat("pl-PL",{timeZone:"Europe/Warsaw",day:"2-digit",month:"2-digit"}).format(date);
  }
  function collection(name) {
    return Array.isArray(snapshot?.collections?.[name]) ? snapshot.collections[name] : [];
  }
  function recentEvents() {
    return collection("audit").slice().sort((a,b) => String(b.createdAt || b.timestamp || b.at || "").localeCompare(String(a.createdAt || a.timestamp || a.at || "")));
  }
  function toast(message, isError = false) {
    const node = el("div", "toast" + (isError === "warning" ? " warning" : isError ? " error" : ""), message);
    while ($("#toasts").children.length >= 2) $("#toasts").firstElementChild.remove();
    $("#toasts").append(node);
    setTimeout(() => node.remove(), 5500);
  }
  async function api(path, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
      let response;
      try {
        response = await fetch(path, {...options, credentials:"same-origin", headers:{"Content-Type":"application/json",...options.headers},signal:controller.signal});
      } catch {
        throw new Error("Brak połączenia z panelem. Sprawdź, czy serwer działa, i spróbuj ponownie.");
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 && path !== "/api/login") showLogin("Sesja wygasła lub uprawnienia konta zostały zmienione. Zaloguj się ponownie.");
        const error = new Error(typeof data.error === "string" ? data.error : response.status === 403 ? "Twoje konto nie ma uprawnień do tej operacji." : "Nie udało się wykonać operacji (" + response.status + ").");
        error.status = response.status;
        throw error;
      }
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  function showLogin(message = "") {
    authenticated = false;
    snapshot = null;
    users = null;
    usersError = "";
    account = {id:null,username:"",role:"viewer"};
    pendingPassDecision = null;
    $("#pass-decision-description").textContent = "";
    $("#app").classList.add("hidden");
    $("#login-screen").classList.remove("hidden");
    $("#password").value = "";
    $("#login-error").textContent = message;
    if ($("#record-dialog").open) $("#record-dialog").close();
    if ($("#confirm-dialog").open) $("#confirm-dialog").close();
    if ($("#publish-dialog").open) $("#publish-dialog").close();
    if ($("#pass-decision-dialog").open) $("#pass-decision-dialog").close();
  }
  async function showApp(session) {
    authenticated = true;
    account = {id:session.id || null,username:session.username || "Użytkownik",role:roleLabels[session.role] ? session.role : "viewer"};
    $("#login-screen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    $("#admin-name").textContent = account.username;
    $("#session-role").textContent = roleLabels[account.role];
    const initials = account.username.slice(0,2).toUpperCase();
    $(".sidebar-user .avatar").textContent = initials;
    currentView = location.hash.slice(1);
    if (currentView !== "overview" && (!resources[currentView] || (resources[currentView].adminOnly && !isAdmin()))) currentView = "overview";
    renderNavigation();
    $("#main").replaceChildren(el("div","loading","Pobieranie danych jednostki…"));
    await refresh();
  }
  function setConnection(failed = false) {
    const online = snapshot?.status?.online === true;
    const badge = $("#connection-badge");
    const label = failed ? "Brak połączenia" : online ? "Discord online" : "Tryb lokalny";
    badge.className = "connection-badge" + (failed ? " error" : online ? "" : " offline");
    badge.replaceChildren(el("span", "status-dot" + (failed ? " error" : online ? "" : " offline")),el("span", "", label));
    $("#sidebar-status").textContent = failed ? "Brak połączenia z botem" : online ? "Bot połączony z Discordem" : "Bot działa lokalnie";
    $("#sidebar-status-dot").className = "status-dot" + (failed ? " error" : online ? "" : " offline");
  }
  async function refresh(silent = false) {
    if (!authenticated || loading) return;
    loading = true;
    $("#refresh").disabled = true;
    try {
      if (currentView === "users") await loadUsers(silent);
      if (!authenticated) return;
      snapshot = await api("/api/state");
      lastRefresh = new Date();
      setConnection();
      $("#last-updated").textContent = "Aktualizacja: " + timeFormat.format(lastRefresh);
      renderNavigation();
      if (!dialogsOpen()) {
        const searchFocused = document.activeElement?.id === "records-search";
        const selectionStart = searchFocused ? document.activeElement.selectionStart : null;
        const selectionEnd = searchFocused ? document.activeElement.selectionEnd : null;
        render();
        if (searchFocused && $("#records-search")) {
          $("#records-search").focus();
          try { $("#records-search").setSelectionRange(selectionStart,selectionEnd); } catch { /* Search input selection is browser dependent. */ }
        }
      }
    } catch (error) {
      setConnection(true);
      if (!silent) toast(error.message, true);
      if (!snapshot && authenticated && currentView !== "users") {
        const card = el("div", "error-card");
        card.append(el("strong", "", "Nie można pobrać danych bota"), el("p", "", error.message),button("Spróbuj ponownie", "button secondary", () => refresh(), "refresh"));
        $("#main").replaceChildren(card);
      }
    } finally {
      loading = false;
      $("#refresh").disabled = false;
    }
  }
  function navigate(view) {
    if (view !== "overview" && !resources[view]) return;
    if (resources[view]?.adminOnly && !isAdmin()) {toast("Zarządzanie użytkownikami jest dostępne tylko dla administratora.",true);return;}
    currentView = view;
    search = "";
    if (location.hash !== "#" + view) history.replaceState(null, "", "#" + view);
    $("#sidebar").classList.remove("open");
    $("#sidebar-overlay").classList.add("hidden");
    $("#menu-toggle").setAttribute("aria-expanded", "false");
    renderNavigation();
    if (view === "users") {render();loadUsers();}
    else if (snapshot) render();
  }
  function renderNavigation() {
    const navigation = $("#navigation");
    navigation.replaceChildren();
    const entries = [["overview", {label:"Pulpit",icon:"grid"}], ...Object.entries(resources)];
    for (const [key, meta] of entries) {
      if (meta.adminOnly && !isAdmin()) continue;
      const link = el("a", "nav-item" + (currentView === key ? " active" : ""));
      link.href = "#" + key;
      if (currentView === key) link.setAttribute("aria-current", "page");
      link.append(icon(meta.icon),el("span", "", meta.label));
      if (["members","prisoners","reports"].includes(key) && snapshot) link.append(el("span","nav-count",collection(key).length));
      if (key === "passes" && snapshot) link.append(el("span","nav-count",collection("passes").filter(item=>item.status==="oczekuje").length));
      if (key === "notifications" && snapshot) {
        const waiting = notifications().filter(entry => entry.status !== "sent").length;
        if (waiting) link.append(el("span","nav-count",waiting));
      }
      link.addEventListener("click", event => {event.preventDefault();navigate(key);});
      navigation.append(link);
    }
  }
  function heading(title, description, actions = []) {
    const headingNode = el("div", "page-heading");
    const copy = el("div");
    copy.append(el("span", "overline", "SŁUŻBA WIĘZIENNA / CENTRUM"),el("h1", "", title),el("p", "", description));
    headingNode.append(copy);
    if (actions.length) {
      const actionsNode = el("div", "heading-actions");
      actionsNode.append(...actions);
      headingNode.append(actionsNode);
    }
    return headingNode;
  }
  function cardHeader(title, description, action) {
    const node = el("div","card-heading");
    const text = el("div");
    text.append(el("h2","",title));
    if (description) text.append(el("p","",description));
    node.append(text);
    if (action) node.append(action);
    return node;
  }
  function emptyState(name, title, message, action) {
    const node = el("div","empty-state");
    const iconNode = el("div","empty-icon");
    iconNode.append(icon(name));
    node.append(iconNode,el("strong","",title),el("p","",message));
    if (action) node.append(action);
    return node;
  }
  function statCard(label, value, note, name, color, badgeLabel) {
    const node = el("div","stat-card");
    const top = el("div","stat-top");
    const symbol = el("div","stat-icon " + color);
    symbol.append(icon(name));
    top.append(el("span","",label),symbol);
    const foot = el("div","stat-foot");
    if (badgeLabel) foot.append(el("span","mini-pill",badgeLabel));
    foot.append(document.createTextNode(note));
    node.append(top,el("div","stat-value",value),foot);
    return node;
  }
  function render() {
    $("#breadcrumb-view").textContent = currentView === "overview" ? "Pulpit" : resources[currentView].label;
    document.title = (currentView === "overview" ? "Pulpit" : resources[currentView].label) + " — SW Centrum";
    if (currentView === "users") renderUsers();
    else if (currentView === "passes") renderPasses();
    else if (currentView === "notifications") renderNotificationPage();
    else if (currentView === "overview") renderOverview(); else renderResource();
  }
  async function loadUsers(silent = false) {
    if (!isAdmin() || usersLoading) return;
    const searchFocused = document.activeElement?.id === "records-search";
    const selectionStart = searchFocused ? document.activeElement.selectionStart : null;
    const selectionEnd = searchFocused ? document.activeElement.selectionEnd : null;
    usersLoading = true;
    usersError = "";
    if (!users && currentView === "users" && !dialogsOpen()) renderUsers();
    try {
      const response = await api("/api/users");
      if (!Array.isArray(response.users)) throw new Error("Serwer nie zwrócił listy użytkowników.");
      users = response.users.slice().sort((a,b) => String(a.username).localeCompare(String(b.username),"pl"));
      $("#last-updated").textContent = "Aktualizacja: " + timeFormat.format(new Date());
    } catch (error) {
      usersError = error.message;
      if (!silent && authenticated) toast(error.message,true);
    } finally {
      usersLoading = false;
      if (authenticated && isAdmin() && currentView === "users" && !dialogsOpen()) {
        renderUsers();
        if (searchFocused && $("#records-search")) {
          $("#records-search").focus();
          try {$("#records-search").setSelectionRange(selectionStart,selectionEnd);} catch { /* Search input selection is browser dependent. */ }
        }
      }
    }
  }
  function renderUsers() {
    if (!isAdmin()) return;
    const main = $("#main");
    main.replaceChildren(heading("Użytkownicy","Przydziel dostęp do panelu poszczególnym osobom.",[
      button("Utwórz konto","button primary",() => openAccountForm("create"),"plus")
    ]));
    const roles = el("div","account-roles");
    for (const [role,description] of [["admin","Zarządza kontami i wszystkimi modułami."],["operator","Dodaje, edytuje i publikuje wpisy służbowe."],["viewer","Przegląda dane bez możliwości ich zmiany."]]) {
      const card = el("div","account-role-card");card.append(el("strong","",roleLabels[role]),el("p","",description));roles.append(card);
    }
    main.append(roles,el("div","intro-strip","Konta tworzy administrator. Każda osoba loguje się własną nazwą użytkownika i hasłem. Wyłączenie konta lub zmiana hasła kończy jego aktywne sesje."));
    const filters = el("div","filter-bar");
    const searchBox = el("label","search-box");searchBox.append(icon("search"));
    const input = el("input");input.id="records-search";input.type="search";input.placeholder="Szukaj użytkownika…";input.setAttribute("aria-label","Szukaj użytkownika");input.value=search;
    input.addEventListener("input",()=>{search=input.value;renderUsersList();});searchBox.append(input);
    filters.append(searchBox,el("span","filter-label",(users?.length ?? 0)+" kont"));main.append(filters);
    main.append(el("p","mobile-table-hint","Przesuń tabelę w bok, aby zobaczyć datę i działania konta."));
    const content = el("section","panel-card");content.id="users-area";main.append(content);renderUsersList();
  }
  function renderUsersList() {
    const area = $("#users-area");if (!area) return;
    area.replaceChildren();
    if (usersError) {
      const error = el("div","empty-state");error.append(el("strong","","Nie udało się pobrać kont"),el("p","",usersError),button("Spróbuj ponownie","button secondary small",()=>loadUsers(),"refresh"));area.append(error);return;
    }
    if (!users && usersLoading) {area.append(el("div","loading","Pobieranie kont użytkowników…"));return;}
    const query = search.toLocaleLowerCase("pl-PL").trim();
    const rows = (users || []).filter(user => [user.username,roleLabels[user.role],user.active ? "aktywne" : "wyłączone"].join(" ").toLocaleLowerCase("pl-PL").includes(query));
    if (!rows.length) {area.append(emptyState("users","Brak wyników","Zmień frazę wyszukiwania lub utwórz konto."));return;}
    const scroll = el("div","table-scroll");const table = el("table");const head = el("thead");const titles = el("tr");
    for (const title of ["UŻYTKOWNIK","UPRAWNIENIA","STATUS","UTWORZONO","AKCJE"]) {const th=el("th","",title);th.scope="col";titles.append(th);}head.append(titles);table.append(head);
    const body = el("tbody");
    for (const user of rows) {
      const self = user.id === account.id || user.username === account.username;
      const tr = el("tr");
      const cells = [personCell(user.username,self?"Twoje konto":"Konto służbowe"),el("span","badge"+(user.role==="admin"?" purple":""),roleLabels[user.role]||user.role),el("span","badge "+(user.active?"green":"gray"),user.active?"Aktywne":"Wyłączone"),textCell(formatDate(user.createdAt))];
      for (const cell of cells) {const td=el("td");td.append(cell);tr.append(td);}
      const td = el("td");const actions = el("div","action-cell");
      const edit = button("","icon-button",()=>openAccountForm("edit",user),"edit");edit.title="Zmień uprawnienia";edit.setAttribute("aria-label","Zmień uprawnienia: "+user.username);
      const reset = button("","icon-button",()=>openAccountForm("password",user),"shield");reset.title="Ustaw nowe hasło";reset.setAttribute("aria-label","Ustaw nowe hasło: "+user.username);
      const toggle = button("","icon-button",()=>confirmAccountAction(user,"toggle"),"lock");toggle.title=self?"Nie możesz wyłączyć własnego konta":user.active?"Wyłącz konto":"Włącz konto";toggle.setAttribute("aria-label",(user.active?"Wyłącz konto: ":"Włącz konto: ")+user.username);toggle.disabled=self;
      const remove = button("","icon-button",()=>confirmAccountAction(user,"delete"),"trash");remove.title=self?"Nie możesz usunąć własnego konta":"Usuń konto";remove.setAttribute("aria-label","Usuń konto: "+user.username);remove.disabled=self;
      actions.append(edit,reset,toggle,remove);td.append(actions);tr.append(td);body.append(tr);
    }
    table.append(body);scroll.append(table);area.append(scroll);
  }
  function openAccountForm(mode, user = null) {
    if (!isAdmin()) {toast("Ta operacja wymaga konta administratora.",true);return;}
    $("#record-dialog").classList.remove("report-dialog");
    activeForm = {name:"users",mode,record:user};
    $("#dialog-title").textContent = mode === "create" ? "Utwórz konto użytkownika" : mode === "password" ? "Ustaw nowe hasło" : "Zmień uprawnienia";
    $("#record-error").textContent="";$("#record-submit").disabled=false;$("#record-submit").textContent=mode==="create"?"Utwórz konto":mode==="password"?"Zmień hasło":"Zapisz zmiany";
    const fields = $("#dialog-fields");fields.replaceChildren();
    if (user) fields.append(el("div","account-form-note field full","Konto: "+user.username));
    function field(key,label,type,options={}) {
      const wrapper=el("div","field full"+(type==="checkbox"?" checkbox":""));const caption=el("label","",label);caption.htmlFor="account-"+key;
      const input=el(type==="select"?"select":"input");input.id="account-"+key;input.name=key;
      if(type==="select") for(const [value,title] of Object.entries(roleLabels)){const option=el("option","",title);option.value=value;input.append(option);}
      else input.type=type;
      if(options.required)input.required=true;
      if(options.minLength)input.minLength=options.minLength;
      if(options.maxLength)input.maxLength=options.maxLength;
      if(type==="password")input.autocomplete="new-password";
      if(type==="checkbox"){input.checked=options.value!==false;caption.prepend(input);wrapper.append(caption);}else{if(options.value!==undefined)input.value=options.value;wrapper.append(caption,input);}
      if(options.help)wrapper.append(el("small","",options.help));
      if(options.disabled)input.disabled=true;
      fields.append(wrapper);return input;
    }
    if (mode === "create") {
      const username=field("username","Nazwa użytkownika *","text",{required:true,minLength:3,maxLength:64,help:"3–64 znaki: litery bez polskich znaków, cyfry oraz . _ @ -"});
      username.pattern="[A-Za-z0-9_.@\\-]{3,64}";username.autocomplete="off";
    }
    if (mode === "create" || mode === "password") {
      field("password","Nowe hasło *","password",{required:true,minLength:12,maxLength:1024,help:"Co najmniej 12 znaków. Hasło nie będzie później wyświetlane."});
      field("passwordConfirm","Powtórz hasło *","password",{required:true,minLength:12,maxLength:1024});
    }
    if (mode !== "password") {
      field("role","Uprawnienia","select",{value:user?.role||"operator"});
      const self = user && (user.id===account.id || user.username===account.username);
      field("active","Konto aktywne","checkbox",{value:user?.active??true,disabled:self,help:self?"Własnego konta nie można wyłączyć.":"Wyłączone konto nie może się zalogować."});
    } else fields.append(el("div","account-form-note field full","Zmiana hasła wyloguje wszystkie aktywne sesje tego konta."));
    $("#record-dialog").showModal();
  }
  async function saveAccountForm() {
    if (!isAdmin() || !activeForm || activeForm.name!=="users") return;
    const {mode,record:user}=activeForm;
    const body={};
    if (mode === "create") body.username=$("#account-username").value.trim();
    if (mode === "create" || mode === "password") {
      body.password=$("#account-password").value;
      if (body.password.length<12) {$("#record-error").textContent="Hasło musi mieć co najmniej 12 znaków.";return;}
      if (body.password!==$("#account-passwordConfirm").value) {$("#record-error").textContent="Wpisane hasła muszą być takie same.";return;}
    }
    if (mode!=="password") {body.role=$("#account-role").value;body.active=$("#account-active").checked;}
    const submit=$("#record-submit");submit.disabled=true;submit.textContent="Zapisywanie…";$("#record-error").textContent="";
    try {
      await api("/api/users"+(user?"/"+encodeURIComponent(user.id):""),{method:mode==="create"?"POST":"PATCH",body:JSON.stringify(body)});
      $("#record-dialog").close();
      if (user && (user.id===account.id || user.username===account.username) && (mode==="password" || body.role!==account.role)) {
        showLogin("Dane Twojego konta zostały zmienione. Zaloguj się ponownie.");return;
      }
      toast(mode==="create"?"Utworzono konto użytkownika.":mode==="password"?"Zmieniono hasło i zakończono aktywne sesje tego konta.":"Zapisano uprawnienia użytkownika.");
      await loadUsers();
    } catch (error) {$("#record-error").textContent=error.message;}
    finally {submit.disabled=false;submit.textContent="Zapisz zmiany";}
  }
  function confirmAccountAction(user, action) {
    if (!isAdmin()) return;
    pendingDelete={name:"users",record:user,action};
    const verb = action==="delete"?"Usunąć":user.active?"Wyłączyć":"Włączyć";
    $("#confirm-dialog h2").textContent=verb+" konto?";
    $("#confirm-description").textContent=action==="delete"?"Konto „"+user.username+"” zostanie usunięte. Jego aktywne sesje zostaną zakończone.":user.active?"Konto „"+user.username+"” straci dostęp do panelu. Aktywne sesje zostaną zakończone.":"Konto „"+user.username+"” ponownie uzyska dostęp do panelu.";
    $("#confirm-delete").textContent=action==="delete"?"Usuń konto":user.active?"Wyłącz konto":"Włącz konto";
    $("#confirm-delete").disabled=false;$("#confirm-dialog").showModal();
  }
  function renderOverview() {
    const main = $("#main");
    const actions = [button("Odśwież", "button secondary", () => refresh(),"refresh")];
    if (canWrite()) actions.push(button("Dodaj funkcjonariusza", "button primary", () => openForm("members"),"plus"));
    main.replaceChildren(heading("Pulpit dowodzenia", "Bieżący obraz jednostki. Wszystko, czego potrzebujesz do służby.",actions));
    if (!canWrite()) main.append(el("div","intro-strip","Twoje konto ma dostęp do podglądu. Możesz przeglądać ewidencję i dziennik operacji."));
    if (snapshot.status?.online !== true) {
      const strip = el("div","intro-strip warning");
      strip.append(icon("info"),el("span","","Tryb lokalny — ewidencja jest dostępna. Funkcje wysyłające wiadomości i wypłaty na Discordzie wymagają połączenia bota."));
      main.append(strip);
    }
    const stats = el("div","stats-grid");
    const reports = collection("reports");
    const pending = reports.filter(record => !["zamknięty","zatwierdzony","odrzucony"].includes(record.status)).length;
    stats.append(
      statCard("Funkcjonariusze", collection("members").length,"w ewidencji kadrowej","users","","KADRA"),
      statCard("Osadzeni", collection("prisoners").length,"w rejestrze jednostki","lock","gold","EWIDENCJA"),
      statCard("Raporty do obsługi", pending,"oczekujących na decyzję","file","purple","RAPORTY"),
      statCard("Wezwania", collection("calls").filter(record => !["zamknięty","odrzucony"].includes(record.status)).length,"otwartych wpisów","call","green","DZIAŁANIA")
    );
    main.append(stats);
    const grid = el("div","dashboard-grid");
    const left = el("div");
    const activity = el("section","panel-card");
    activity.append(cardHeader("Ostatnia aktywność","Bieżące wpisy w dzienniku operacji",button("Cały dziennik →","text-link",() => navigate("audit"))));
    const events = recentEvents().slice(0,5);
    if (!events.length) activity.append(emptyState("activity","Dziennik jest jeszcze pusty","Zarejestrowane operacje będą widoczne w tym miejscu."));
    else for (const event of events) activity.append(activityRow(event));
    left.append(activity);
    const recent = el("section","panel-card recent-table");
    recent.append(cardHeader("Kadra jednostki","Ostatnio dodani funkcjonariusze",button("Zobacz wszystkich →","text-link",() => navigate("members"))));
    const members = collection("members").slice().sort((a,b) => String(b.joinedAt || "").localeCompare(String(a.joinedAt || ""))).slice(0,5);
    if (!members.length) recent.append(emptyState("users","Brak funkcjonariuszy","W ewidencji nie ma jeszcze funkcjonariuszy.",canWrite()?button("Dodaj funkcjonariusza","button secondary small",() => openForm("members"),"plus"):null));
    else recent.append(buildTable("members",members,true));
    left.append(recent);
    const right = el("div","side-stack");
    const system = el("section","panel-card");
    system.append(cardHeader("Status systemu","Wspólne centrum danych"));
    const summary = el("div","status-summary");
    const ring = el("div","status-ring");
    ring.append(el("strong","","8"),el("small","","modułów bota"));
    summary.append(ring);system.append(summary);
    const moduleList = el("div","module-list");
    const online = snapshot.status?.online === true;
    for (const [label,value,active] of [["Bot Discord",online?"Połączony":"Tryb lokalny",online],["Panel administracyjny","Działa",true],["Ewidencja","Dane lokalne",true],["Serwery Discord",snapshot.status?.guilds ?? 0,false]]) {
      const line = el("div","module-line");
      line.append(el("span","",label),el("strong",active?"module-online":"",value));moduleList.append(line);
    }
    system.append(moduleList);right.append(system);
    const quick = el("section","panel-card");
    quick.append(cardHeader(canWrite()?"Szybkie działania":"Szybki dostęp"));
    const links = el("div","quick-links");
    for (const [name,label] of [["prisoners","Dodaj osadzonego"],["reports","Złóż raport"],["calls","Dodaj wezwanie"],["documents","Nowy dokument"]]) {
      const link = button("","quick-link",() => canWrite()?openForm(name):navigate(name));
      link.append(icon(resources[name].icon),el("span","",canWrite()?label:resources[name].label));links.append(link);
    }
    quick.append(links);right.append(quick);
    grid.append(left,right);main.append(grid);
  }
  function activityRow(event) {
    const node = el("div","activity-row");
    const resource = event.resource || event.collection || event.type;
    const symbol = el("div","activity-icon");symbol.append(icon(resources[resource]?.icon || "activity"));
    const text = el("div","activity-copy");
    const title = event.title || event.message || ((actionLabels[event.action] || event.action || "Operacja") + (resources[resource] ? " · " + resources[resource].label : ""));
    text.append(el("strong","",title));
    const detail = [event.actor || event.username || "System",event.recordId || event.targetId || ""].filter(Boolean).join(" · ");
    text.append(el("p","",detail));
    const timestamp = el("time","activity-time",shortDate(event.createdAt || event.timestamp || event.at));
    timestamp.title = formatDate(event.createdAt || event.timestamp || event.at);
    node.append(symbol,text,timestamp);return node;
  }
  function renderResource() {
    const resource = resources[currentView];
    const actions = resource.readonly || !canWrite() ? [] : [button(currentView==="reports"?"Złóż raport":"Dodaj wpis","button primary",() => openForm(currentView),currentView==="reports"?"file":"plus")];
    const main = $("#main");main.replaceChildren(heading(resource.label,resource.description,actions));
    if (resource.notice) main.append(el("div","notice",resource.notice));
    if (!canWrite()) main.append(el("div","intro-strip","Dostęp do podglądu — edycję wpisów wykonuje operator lub administrator."));
    if (businessResources.includes(currentView)) main.append(el("div","intro-strip","Dodanie, edycja i usunięcie wpisu automatycznie zgłasza zmianę na Discordzie. Stan zgłoszenia jest widoczny przy wpisie i w historii poniżej."));
    if (["reports","calls","proposals"].includes(currentView)) main.append(el("div","intro-strip",canWrite()?"Zmiany są automatycznie zgłaszane na Discordzie. Osobna publikacja wysyła pełną treść wpisu — służy do tego przycisk „Opublikuj pełną treść”.":"Automatyczne zgłoszenie zmiany i publikacja pełnej treści to osobne wiadomości. Pełną treść może opublikować operator lub administrator."));
    if (currentView === "documents") main.append(el("div","intro-strip","Dokumenty z panelu trafiają do ewidencji. Formularze i tickety Discord obsługuje ten sam bot komendą /setup-dokumenty."));
    const filters = el("div","filter-bar");
    const searchBox = el("label","search-box");searchBox.append(icon("search"));
    const input = el("input");input.id="records-search";input.type="search";input.placeholder="Szukaj w ewidencji…";input.setAttribute("aria-label","Szukaj w ewidencji");input.value=search;
    input.addEventListener("input",() => {search=input.value;renderRecords();});searchBox.append(input);
    filters.append(searchBox,el("span","filter-label",collection(currentView).length + " wpisów w ewidencji"));main.append(filters);
    const tableArea = el("section","panel-card");tableArea.id="records-area";main.append(tableArea);renderRecords();
    if (businessResources.includes(currentView)) main.append(renderNotifications(currentView));
  }
  function openPassForm(prisonerId = "") {
    if(!canWrite()){toast("Twoje konto ma dostęp tylko do podglądu.",true);return;}
    if(!collection("prisoners").length){toast("Przed złożeniem wniosku dodaj osadzonego do rejestru.","warning");return;}
    openForm("passes",null,{osadzonyId:prisonerId});
  }
  function passStatusBadge(status) {
    const labels={oczekuje:"Oczekuje",zatwierdzona:"Zatwierdzona",odrzucona:"Odrzucona"};
    return el("span","badge "+(status==="zatwierdzona"?"green":status==="odrzucona"?"red":"gold"),labels[status]||status||"Brak statusu");
  }
  function renderPasses() {
    const main=$("#main");
    const actions=canWrite()?[button("Złóż wniosek","button primary",()=>openPassForm(),"plus")]:[];
    main.replaceChildren(heading("Przepustki","Złóż wniosek dla osadzonego i sprawdź decyzję kadry.",actions));
    main.append(el("div","intro-strip",isAdmin()?"Wnioski oczekują na decyzję administratora. Zatwierdzenie oznaczy przepustkę osadzonego jako udzieloną.":canWrite()?"Możesz złożyć wniosek. Decyzję o zatwierdzeniu lub odrzuceniu podejmuje administrator.":"Dostęp do podglądu — możesz przeglądać wnioski, ich statusy i decyzje."));
    if(!collection("prisoners").length&&canWrite())main.append(el("div","notice","Aby złożyć wniosek, najpierw dodaj osadzonego do rejestru."));
    const filters=el("div","pass-filters");
    const selectLabel=el("label","notification-filter","Status wniosku");const select=el("select");select.id="pass-status-filter";select.setAttribute("aria-label","Status wniosku");
    for(const[value,label]of [["oczekuje","Oczekujące"],["","Wszystkie"],["zatwierdzona","Zatwierdzone"],["odrzucona","Odrzucone"]]){
      const count=collection("passes").filter(item=>!value||item.status===value).length;
      const option=el("option","",label+" ("+count+")");option.value=value;select.append(option);
    }
    select.value=passStatusFilter;select.addEventListener("change",()=>{passStatusFilter=select.value;renderPassesList();});selectLabel.append(select);
    const searchBox=el("label","search-box");searchBox.append(icon("search"));
    const input=el("input");input.id="records-search";input.type="search";input.placeholder="Szukaj osadzonego lub wniosku…";input.setAttribute("aria-label","Szukaj wniosków o przepustkę");input.value=search;input.addEventListener("input",()=>{search=input.value;renderPassesList();});searchBox.append(input);
    filters.append(selectLabel,searchBox);main.append(filters);
    const area=el("div","passes-grid");area.id="passes-area";main.append(area);renderPassesList();
    main.append(renderNotifications("passes"));
  }
  function renderPassesList() {
    const area=$("#passes-area");if(!area)return;
    const query=search.toLocaleLowerCase("pl-PL").trim();
    const entries=collection("passes").filter(item=>(!passStatusFilter||item.status===passStatusFilter)&&(!query||[item.id,item.osadzonyId,item.osadzony,item.powod,item.miejsce,item.zlozyl,item.rozpatrzyl].filter(Boolean).join(" ").toLocaleLowerCase("pl-PL").includes(query))).slice().sort((a,b)=>String(b.utworzono||"").localeCompare(String(a.utworzono||"")));
    area.replaceChildren();
    if(!entries.length){area.append(emptyState("file",query?"Brak wyników":passStatusFilter==="oczekuje"?"Brak oczekujących wniosków":"Brak wniosków w tym widoku",query?"Zmień frazę wyszukiwania lub status wniosku.":"Złożone wnioski będą dostępne w tej zakładce."));return;}
    for(const entry of entries){
      const card=el("article","panel-card pass-card");card.dataset.passId=String(entry.id);card.dataset.status=String(entry.status);
      const prisonerName=entry.osadzony||collection("prisoners").find(item=>String(item.id)===String(entry.osadzonyId))?.imie||"Osadzony";
      card.append(cardHeader(entry.id+" · "+prisonerName,entry.osadzonyId,passStatusBadge(entry.status)));
      const content=el("div","pass-card-body");const details=el("dl","pass-details");
      const period=entry.od&&entry.do?entry.od+" – "+entry.do+(entry.do<entry.od?" (następny dzień)":""):"Brak godzin";
      for(const[label,value]of [["Godziny przepustki",period],["Miejsce pobytu",entry.miejsce],["Złożył",entry.zlozyl],["Data złożenia",formatDate(entry.utworzono)]]){
        const pair=el("div");pair.append(el("dt","",label),el("dd","",value||"—"));details.append(pair);
      }
      content.append(details,el("h3","pass-reason-heading","Powód przepustki"),el("p","pass-reason",entry.powod||"Brak podanego powodu."));
      if(entry.status!=="oczekuje"){
        const review=el("div","pass-review");review.append(el("strong","","Decyzja kadry"),el("p","","Rozpatrzył: "+(entry.rozpatrzyl||"Brak informacji")),el("p","","Data decyzji: "+formatDate(entry.rozpatrzono)));content.append(review);
      }
      const footer=el("div","pass-card-footer");const delivery=el("div","pass-delivery");delivery.append(el("small","","Powiadomienie Discord"),notificationBadge(notifications("passes").find(item=>String(item.recordId)===String(entry.id))));footer.append(delivery);
      if(isAdmin()&&entry.status==="oczekuje"){
        const actions=el("div","pass-decision-actions");
        const approve=button("Zatwierdź","button primary small",()=>confirmPassDecision(entry,"approve"));approve.setAttribute("aria-label","Zatwierdź wniosek "+entry.id);
        const reject=button("Odrzuć","button danger small",()=>confirmPassDecision(entry,"reject"));reject.setAttribute("aria-label","Odrzuć wniosek "+entry.id);actions.append(approve,reject);footer.append(actions);
      }
      card.append(content,footer);area.append(card);
    }
  }
  function confirmPassDecision(entry,decision) {
    if(!isAdmin())return;
    pendingPassDecision={entry,decision};
    $("#pass-decision-title").textContent=decision==="approve"?"Zatwierdzić wniosek?":"Odrzucić wniosek?";
    $("#pass-decision-description").textContent=entry.id+" · "+(entry.osadzony||entry.osadzonyId)+". "+(decision==="approve"?"Zatwierdzenie oznaczy przepustkę osadzonego jako udzieloną.":"Wniosek zostanie oznaczony jako odrzucony.");
    $("#pass-decision-submit").textContent=decision==="approve"?"Zatwierdź wniosek":"Odrzuć wniosek";
    $("#pass-decision-submit").className="button "+(decision==="approve"?"primary":"danger");$("#pass-decision-submit").disabled=false;$("#pass-decision-dialog").showModal();
  }
  async function decidePass() {
    if(!isAdmin()||!pendingPassDecision)return;
    const{entry,decision}=pendingPassDecision;const submit=$("#pass-decision-submit");submit.disabled=true;submit.textContent="Zapisywanie…";
    try{
      const result=await api("/api/passes/"+encodeURIComponent(entry.id)+"/decision",{method:"POST",body:JSON.stringify({decision})});
      $("#pass-decision-dialog").close();showNotificationOutcome(decision==="approve"?"Zatwierdzono wniosek o przepustkę.":"Odrzucono wniosek o przepustkę.",result.notification);await refresh();
    }catch(error){$("#pass-decision-dialog").close();toast(error.message,true);await refresh(true);}
    finally{submit.disabled=false;}
  }
  function renderRecords() {
    const node = $("#records-area");if (!node) return;
    const query = search.toLocaleLowerCase("pl-PL").trim();
    let records = collection(currentView).filter(record => !query || Object.values(record).filter(value => typeof value === "string" || typeof value === "number").join(" ").toLocaleLowerCase("pl-PL").includes(query));
    if (currentView === "audit") records = recentEvents().filter(record => !query || Object.values(record).join(" ").toLocaleLowerCase("pl-PL").includes(query));
    node.replaceChildren();
    if (!records.length) {
      node.append(emptyState(resources[currentView].icon,query?"Brak wyników":"Ewidencja jest pusta",query?"Zmień frazę wyszukiwania, aby znaleźć wpis.":"Nowe wpisy pojawią się tutaj po zapisaniu danych.",!query && !resources[currentView].readonly && canWrite() ? button(currentView==="reports"?"Złóż pierwszy raport":"Dodaj pierwszy wpis","button secondary small",() => openForm(currentView),"plus"):null));
    } else node.append(buildTable(currentView,records));
  }
  function personCell(name, id) {
    const cell = el("div","person-cell");
    const initials = String(name || "SW").replace(/[^\p{L} ]/gu,"").trim().split(/\s+/).map(part => part[0]).join("").slice(0,2) || "SW";
    cell.append(el("div","person-avatar",initials));
    const text = el("div");text.append(el("strong","",name || "Funkcjonariusz"));if(id) text.append(el("small","",id));cell.append(text);return cell;
  }
  function badge(value) {
    const color = ["zatwierdzony","aktywny","wypłacona"].includes(value)?"green":["odrzucony"].includes(value)?"red":["w toku","oczekuje"].includes(value)?"gold":["zamknięty"].includes(value)?"gray":"";
    return el("span","badge " + color,value || "nowy");
  }
  function textCell(value) {return el("span","",value ?? "—");}
  function titleCell(title,detail) {const node=el("div","record-detail");node.append(el("strong","record-title",title || "Bez tytułu"));if(detail)node.append(el("span","",String(detail).slice(0,230)));return node;}
  function reportAuthorId(record) {
    if (record.authorId) return String(record.authorId);
    const author=String(record.author||"").trim();
    const mention=/^<@!?(\d{17,20})>$/.exec(author);
    return mention?mention[1]:/^\d{17,20}$/.test(author)?author:"";
  }
  function reportDateInput(value) {
    const text=String(value||"").trim();
    const polish=/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
    const iso=polish?polish[3]+"-"+polish[2].padStart(2,"0")+"-"+polish[1].padStart(2,"0"):text;
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if(!match)return "";
    const date=new Date(iso+"T00:00:00Z");
    return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso?iso:"";
  }
  function reportFormValue(field,record) {
    if(field==="serviceType")return record.serviceType||record.title||"";
    if(field==="authorId")return reportAuthorId(record);
    if(field==="author")return record.author||collection("members").find(member=>String(member.userId||member.id)===reportAuthorId(record))?.name||"";
    if(field==="date")return reportDateInput(record.date);
    return record[field];
  }
  function buildTable(name,records,compact=false) {
    const wrapper=el("div","table-scroll");const table=el("table");
    const headings={members:["FUNKCJONARIUSZ","NUMER","STOPIEŃ","BILANS","POWIADOMIENIE","AKCJE"],prisoners:["OSADZONY","PARAGRAF / WYROK","CELA","KARA","PRZEPUSTKA","POWIADOMIENIE","AKCJE"],ranks:["ID DISCORD","DZIAŁ","NUMER","POWIADOMIENIE","AKCJE"],reports:["RODZAJ / PRZEBIEG SŁUŻBY","FUNKCJONARIUSZ","DATA / GODZINY SŁUŻBY","MIEJSCE SŁUŻBY","STATUS / PUBLIKACJA","POWIADOMIENIE","AKCJE"],calls:["WEZWANIE","OSOBA WZYWANA","STATUS / PUBLIKACJA","DATA","POWIADOMIENIE","AKCJE"],documents:["DOKUMENT","RODZAJ","STATUS","DATA","POWIADOMIENIE","AKCJE"],proposals:["PROPOZYCJA","AUTOR","STATUS / PUBLIKACJA","DATA","POWIADOMIENIE","AKCJE"],payouts:["ODBIORCA","KWOTA","POWÓD","STATUS WPISU","POWIADOMIENIE","AKCJE"],audit:["OPERACJA","MODUŁ","WYKONAŁ","DATA"]};
    const head=el("thead");const row=el("tr");
    const labels=compact?headings[name].slice(0,3):headings[name].filter(label => label !== "AKCJE" || canWrite());
    for(const label of labels){const th=el("th","",label);th.scope="col";row.append(th);}head.append(row);table.append(head);
    const body=el("tbody");
    for(const record of records){
      let cells=[];
      if(name==="members")cells=[personCell(record.name || "Funkcjonariusz SW",record.userId || record.id),textCell("SW-"+String(record.number || "?").padStart(2,"0")),badge(record.rank || "Rekrut"),textCell("+"+(record.plus||0)+" / −"+(record.minus||0)+" · Nagany: "+(record.reprimands||0))];
      if(name==="prisoners"){
        const seconds=Number(record.remainingSeconds||0);const minutes=Math.max(0,Math.ceil(seconds/60));
        cells=[personCell(record.imie || record.name,record.id),titleCell(record.paragraf || record.reason,record.wyrok),textCell(record.cela),badge(record.paused?"Wstrzymana · "+minutes+" min":minutes+" min"),el("span","badge "+(record.przepustka===true?"green":"gray"),record.przepustka===true?"Udzielona":"Brak")];
      }
      if(name==="ranks")cells=[textCell(record.userId||record.id),badge(sections[record.section]||record.section),textCell((record.section==="rekruci"?"SWRO":"SW-")+String(record.number||"?").padStart(2,"0"))];
      if(name==="reports")cells=[titleCell(record.serviceType||record.title||"Raport służbowy",record.content),personCell(record.author||"Nie podano funkcjonariusza",reportAuthorId(record)),titleCell(record.date||"Brak daty",record.hours),textCell(record.place),publicationStatus(record)];
      if(["documents","proposals"].includes(name))cells=[titleCell(record.title||resources[name].label,record.content || fieldDescription(record.fields)),textCell(name==="documents"?(record.kind||record.type):(record.author||record.authorId)),publicationStatus(record),textCell(formatDate(record.createdAt))];
      if(name==="calls")cells=[titleCell(record.title||"Wezwanie",record.reason||record.content),textCell(record.target||record.name||record.userId),publicationStatus(record),textCell(formatDate(record.createdAt))];
      if(name==="payouts")cells=[textCell(record.recipient||record.userId),textCell(Number(record.amount||0).toLocaleString("pl-PL",{style:"currency",currency:"PLN"})),titleCell(record.reason||record.content,(record.paid===true||record.status==="wypłacona")?"Wypłata potwierdzona przez bota":"Ewidencja — bez przelewu"),badge(record.status)];
      if(name==="audit")cells=[titleCell(record.title||record.message||actionLabels[record.action]||record.action,record.recordId||record.targetId),textCell(resources[record.resource]?.label||record.resource||record.type),textCell(record.actor||record.username||"System"),textCell(formatDate(record.createdAt||record.timestamp||record.at))];
      if (!compact && businessResources.includes(name)) cells.push(notificationBadge(notifications(name).find(item=>String(item.recordId)===String(record.id||record.userId))));
      const tr=el("tr");for(const node of compact?cells.slice(0,3):cells){const td=el("td");td.append(node);tr.append(td);}
      if(!compact&&!resources[name].readonly&&canWrite()){
        const td=el("td");const actions=el("div","action-cell");
        const edit=button("","icon-button",()=>openForm(name,record),"edit");edit.title="Edytuj wpis";edit.setAttribute("aria-label","Edytuj wpis "+(record.title||record.name||record.imie||record.id));
        const remove=button("","icon-button",()=>confirmRemove(name,record),"trash");remove.title="Usuń wpis";remove.setAttribute("aria-label","Usuń wpis "+(record.title||record.name||record.imie||record.id));
        actions.append(edit);
        if(name==="prisoners"){
          const request=button("Wniosek o przepustkę","button secondary small",()=>openPassForm(String(record.id)),"file");request.setAttribute("aria-label","Wniosek o przepustkę: "+(record.imie||record.id));actions.append(request);
        }
        if (["reports","calls","proposals"].includes(name)) {
          const publish = button("","icon-button",()=>confirmPublish(name,record),"send");
          const sent = record.discordMessageId || record.messageId || ["pending","published","uncertain"].includes(record.publishState);
          publish.disabled = snapshot?.status?.online !== true || Boolean(sent);
          publish.title = sent ? "Publikacja pełnej treści została już rozpoczęta. Sprawdź status wpisu." : snapshot?.status?.online !== true ? "Publikacja pełnej treści wymaga połączenia bota z Discordem" : "Opublikuj pełną treść";
          publish.setAttribute("aria-label","Opublikuj pełną treść: " + (record.title || record.target || record.id));
          actions.append(publish);
        }
        actions.append(remove);td.append(actions);tr.append(td);
      }
      body.append(tr);
    }table.append(body);wrapper.append(table);return wrapper;
  }
  function fieldDescription(fields) {
    if (!fields || typeof fields !== "object") return "";
    return Object.entries(fields).filter(([,value]) => typeof value === "string" || typeof value === "number").map(([key,value]) => key + ": " + value).join(" · ");
  }
  function publicationStatus(record) {
    const node = el("div","record-status");node.append(badge(record.status));
    if (record.discordMessageId || record.messageId || record.publishState === "published") node.append(el("small","published-note","Pełna treść opublikowana"));
    else if (record.publishState === "pending") node.append(el("small","published-note","Trwa publikacja pełnej treści"));
    else if (record.publishState === "uncertain") node.append(el("small","published-note uncertain","Sprawdź publikację na Discordzie"));
    return node;
  }
  function notificationResource(entry) {return entry.resource || "prisoners";}
  function notifications(resource = null) {
    return (Array.isArray(snapshot?.notifications)?snapshot.notifications:[]).filter(entry=>businessResources.includes(notificationResource(entry))&&(!resource||notificationResource(entry)===resource)).slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
  }
  function notificationBadge(notification) {
    const labels={sent:"Zmiana zgłoszona",pending:"Oczekuje",failed:"Wymaga uwagi"};
    const node=el("span","badge "+(notification?.status==="sent"?"green":notification?.status==="failed"?"red":notification?.status==="pending"?"gold":"gray"),labels[notification?.status]||"Brak informacji");
    if(notification?.message)node.title=notification.message;
    return node;
  }
  function renderNotifications(resource = null, {limit = 10,status = ""} = {}) {
    const card=el("section","panel-card recent-table");
    card.dataset.notificationResource=resource||"all";
    card.append(cardHeader(resource?"Powiadomienia Discord":"Historia zgłoszeń",resource?"Ostatnie "+limit+" zgłoszeń · "+resources[resource].label:"Zgłoszenia zmian ze wszystkich modułów"));
    const rows=notifications(resource).filter(entry=>!status||entry.status===status).slice(0,limit);
    if(!rows.length){card.append(emptyState("activity","Brak powiadomień","Po zmianie wpisu pojawi się tu stan automatycznego zgłoszenia na Discordzie."));return card;}
    const labels={create:"Dodano wpis",update:"Zmieniono wpis",remove:"Usunięto wpis",delete:"Usunięto wpis",approve:"Zatwierdzono wniosek",reject:"Odrzucono wniosek"};
    for(const entry of rows){
      const entryResource=notificationResource(entry);
      const row=el("div","notification-row");row.dataset.resource=entryResource;row.dataset.recordId=String(entry.recordId||"");
      const copy=el("div","notification-copy");
      const record=collection(entryResource).find(item=>String(item.id||item.userId)===String(entry.recordId));
      const recordLabel=record?.title||record?.name||record?.imie||record?.osadzony||record?.recipient||entry.recordId;
      copy.append(el("strong","",(labels[entry.action]||"Zmiana wpisu")+" · "+resources[entryResource].label+(recordLabel?" · "+String(recordLabel).slice(0,100):"")),el("p","",entry.message||"Oczekiwanie na informację o wysyłce."),el("small","",[entry.actor,formatDate(entry.createdAt)].filter(Boolean).join(" · ")));
      const actions=el("div","notification-actions");actions.append(notificationBadge(entry));
      if(isAdmin()&&entry.status!=="sent"&&entry.canRetry){
        const retry=button("Ponów wysyłkę","button secondary small",async()=>{
          retry.disabled=true;
          try{const result=await api("/api/notifications/"+encodeURIComponent(entry.id)+"/retry",{method:"POST",body:"{}"});showNotificationOutcome("Ponowiono zlecenie wysyłki.",result.notification);await refresh();}
          catch(error){toast(error.message,true);}finally{retry.disabled=false;}
        },"refresh");actions.append(retry);
      }
      row.append(copy,actions);card.append(row);
    }
    return card;
  }
  function renderNotificationPage() {
    const main=$("#main");
    main.replaceChildren(heading("Powiadomienia Discord","Automatyczne zgłoszenia dodania, edycji i usunięcia wpisów we wszystkich modułach.",[
      button("Odśwież","button secondary",()=>refresh(),"refresh")
    ]));
    main.append(el("div","intro-strip","Powiadomienie zgłasza zmianę w ewidencji. Publikacja pełnej treści, realizacja wypłaty i obsługa ticketów pozostają osobnymi operacjami."));
    const filters=el("div","notification-filters");
    for(const [key,label,options] of [["resource","Moduł",[["","Wszystkie moduły"],...businessResources.map(name=>[name,resources[name].label])]], ["status","Stan",[["","Wszystkie stany"],["pending","Oczekujące"],["sent","Zgłoszone"],["failed","Wymagające uwagi"]]]]){
      const wrapper=el("label","notification-filter",label);const select=el("select");select.setAttribute("aria-label",label);select.id="notification-filter-"+key;
      for(const [value,text]of options){const option=el("option","",text);option.value=value;select.append(option);}select.value=notificationFilters[key];
      select.addEventListener("change",()=>{notificationFilters[key]=select.value;renderNotificationPage();});wrapper.append(select);filters.append(wrapper);
    }
    main.append(filters,renderNotifications(notificationFilters.resource||null,{limit:100,status:notificationFilters.status}));
  }
  function showNotificationOutcome(savedMessage,notification) {
    if(notification && ["sent","pending","failed"].includes(notification.status)) {
      toast(savedMessage+" "+notification.message,notification.status==="sent"?false:"warning");
    } else toast(savedMessage+" Stan powiadomienia Discord nie jest dostępny.","warning");
  }
  function openForm(name,record=null,defaults={}){
    if (!canWrite()) {toast("Twoje konto ma dostęp tylko do podglądu.",true);return;}
    const resource=resources[name];if(!resource || resource.readonly)return;
    $("#record-dialog").classList.toggle("report-dialog",name==="reports");
    $("#record-dialog").classList.toggle("prisoner-dialog",name==="prisoners");
    activeForm={name,record};
    $("#dialog-title").textContent=name==="passes"?"Złóż wniosek o przepustkę":name==="reports"?(record?"Edytuj raport służbowy":"Złóż raport służbowy"):(record?"Edytuj ":"Dodaj ")+resource.singular;
    $("#record-error").textContent="";$("#record-submit").disabled=false;$("#record-submit").textContent=name==="passes"?"Złóż wniosek":name==="reports"?(record?"Zapisz raport":"Złóż raport"):"Zapisz wpis";
    const fields=$("#dialog-fields");fields.replaceChildren();
    for(const field of resource.fields){
      if(field.editOnly&&!record)continue;
      if(field.adminOnly&&!isAdmin())continue;
      const options=typeof field.options==="function"?field.options():field.options;
      const wrapper=el("div","field"+(field.full?" full":"")+(field.type==="checkbox"?" checkbox":""));
      const id="field-"+field.key;
      const label=el("label","",field.label+(field.required?" *":""));label.htmlFor=id;
      let input;
      if(options){
        input=el("select");
        for(const option of options){const [value,title]=Array.isArray(option)?option:[option,option];const opt=el("option","",title);opt.value=value;input.append(opt);}
        if (record?.[field.key] && !options.some(option => (Array.isArray(option) ? option[0] : option) === record[field.key])) {
          const preserved = el("option","",String(record[field.key]) + " (zapis Discord)");preserved.value=String(record[field.key]);input.append(preserved);
        }
      }else{input=el(field.type==="textarea"?"textarea":"input");if(field.type!=="textarea")input.type=field.type||"text";}
      input.id=id;input.name=field.key;input.required=Boolean(field.required);
      if(field.min!==undefined)input.min=field.min;if(field.type==="number")input.step="1";
      if(field.max!==undefined){if(field.type==="number")input.max=field.max;else input.maxLength=field.max;}
      if(field.pattern)input.pattern=field.pattern;
      if(field.immutable&&record)input.disabled=true;
      let value=record?.[field.key]??defaults[field.key]??field.default;
      if(name==="reports"&&record)value=reportFormValue(field.key,record);
      if (record && value === undefined) {
        if (field.key === "author") value=record.authorId;
        if (field.key === "target") value=record.name||record.userId;
        if (field.key === "recipient") value=record.userId;
        if (field.key === "reason") value=record.content;
        if (field.key === "content" && name === "documents") value=fieldDescription(record.fields);
      }
      if(field.type==="checkbox")input.checked=Boolean(value);
      else if(value!==undefined&&value!==null)input.value=String(value);
      if(field.type==="checkbox"){label.prepend(input);wrapper.append(label);}else wrapper.append(label,input);
      if(name==="prisoners" && field.key==="paragraf"){
        const list=el("datalist");list.id="prisoner-paragraphs-rp";
        for(const paragraph of PRISONER_PARAGRAPHS_RP){
          const option=el("option");
          option.value="§"+paragraph.numer+" — "+paragraph.opis;
          option.label=paragraph.minuty+" min (RP)";
          list.append(option);
        }
        input.setAttribute("list",list.id);
        wrapper.append(list,el("small","","Taryfikator RP: wybierz czyn lub wpisz kilka paragrafów ręcznie. Wyrok i godziny ustaw osobno."));
      }
      if(field.help)wrapper.append(el("small","",field.help));
      fields.append(wrapper);
    }
    $("#record-dialog").showModal();
    fields.scrollTop=0;
  }
  async function saveForm(event){
    event.preventDefault();if(!activeForm)return;
    if(activeForm.name==="users"){await saveAccountForm();return;}
    if(!canWrite()){toast("Twoje konto nie ma uprawnień do zmiany danych.",true);return;}
    const {name,record}=activeForm;
    const body={};
    for(const field of resources[name].fields){
      if(field.adminOnly&&!isAdmin())continue;
      const input=$("#field-"+field.key);if(!input)continue;
      const options=typeof field.options==="function"?field.options():field.options;
      if (record && options && input.value === record[field.key] && !options.some(option => (Array.isArray(option) ? option[0] : option) === input.value)) continue;
      if(field.type==="checkbox")body[field.key]=input.checked;
      else if(field.type==="number")body[field.key]=input.value===""?0:Number(input.value);
      else body[field.key]=input.value.trim();
    }
    if(name==="passes"&&body.od===body.do){$("#record-error").textContent="Godzina wyjścia i powrotu muszą być różne.";return;}
    const submit=$("#record-submit");submit.disabled=true;submit.textContent="Zapisywanie…";$("#record-error").textContent="";
    try{
      const result=await api("/api/"+name+(record?"/"+encodeURIComponent(record.id||record.userId):""),{method:record?"PATCH":"POST",body:JSON.stringify(body)});
      $("#record-dialog").close();
      const savedMessage=name==="passes"?"Złożono wniosek o przepustkę. Oczekuje na decyzję administratora.":name==="payouts"?"Zapisano wpis w ewidencji wypłat. Pieniądze nie zostały wysłane.":name==="prisoners"?"Zapisano osadzonego w ewidencji.":"Zapisano wpis w module „"+resources[name].label+"”.";
      showNotificationOutcome(savedMessage,result.notification);
      if(name==="passes"){passStatusFilter="oczekuje";navigate("passes");}
      await refresh();
    }catch(error){$("#record-error").textContent=error.message;}finally{submit.disabled=false;submit.textContent=name==="passes"?"Złóż wniosek":name==="reports"?(record?"Zapisz raport":"Złóż raport"):"Zapisz wpis";}
  }
  function confirmRemove(name,record){
    if(!canWrite())return;
    pendingDelete={name,record};
    $("#confirm-dialog h2").textContent="Usunąć ten wpis?";$("#confirm-delete").textContent="Usuń wpis";
    const title=record.title||record.name||record.imie||record.recipient||record.userId||record.id;
    $("#confirm-description").textContent="Wpis „"+title+"” zostanie trwale usunięty z ewidencji. Operacja zostanie zapisana w dzienniku.";
    $("#confirm-delete").disabled=false;$("#confirm-dialog").showModal();
  }
  async function removeRecord(){
    if(!pendingDelete)return;const {name,record}=pendingDelete;$("#confirm-delete").disabled=true;
    try{
      if(name==="users"){
        if(!isAdmin())throw new Error("Ta operacja wymaga konta administratora.");
        const toggle=pendingDelete.action==="toggle";
        await api("/api/users/"+encodeURIComponent(record.id),{method:toggle?"PATCH":"DELETE",body:toggle?JSON.stringify({active:!record.active}):"{}"});
        $("#confirm-dialog").close();toast(toggle?(record.active?"Wyłączono konto i zakończono jego sesje.":"Włączono konto użytkownika."):"Usunięto konto użytkownika.");await loadUsers();
      }else{
        if(!canWrite())throw new Error("Twoje konto ma dostęp tylko do podglądu.");
        const result=await api("/api/"+name+"/"+encodeURIComponent(record.id||record.userId),{method:"DELETE",body:"{}"});
        $("#confirm-dialog").close();
        const removedMessage=name==="payouts"?"Usunięto wpis z ewidencji wypłat. Saldo nie zostało zmienione.":name==="prisoners"?"Usunięto osadzonego z ewidencji.":"Usunięto wpis z modułu „"+resources[name].label+"”.";
        showNotificationOutcome(removedMessage,result.notification);
        await refresh();
      }
    }catch(error){toast(error.message,true);}finally{$("#confirm-delete").disabled=false;}
  }
  function confirmPublish(name,record) {
    if(!canWrite())return;
    pendingPublish = {name,record};
    $("#publish-description").textContent = "Pełna treść wpisu „" + (record.title || record.target || record.id) + "” zostanie opublikowana jako osobna wiadomość. Automatyczne zgłoszenie zmiany nie zastępuje tej publikacji.";
    $("#publish-error").textContent = "";
    $("#publish-send").disabled = false;
    $("#publish-dialog").showModal();
  }
  async function publishRecord() {
    if (!pendingPublish || !canWrite()) return;
    $("#publish-send").disabled = true;
    $("#publish-send").textContent = "Wysyłanie…";
    $("#publish-error").textContent = "";
    try {
      await api("/api/actions/publish",{method:"POST",body:JSON.stringify({resource:pendingPublish.name,id:String(pendingPublish.record.id)})});
      $("#publish-dialog").close();toast("Discord potwierdził publikację pełnej treści wpisu.");
      await refresh();
    } catch (error) {
      $("#publish-dialog").close();toast(error.message,true);
      await refresh(true);
    } finally {
      $("#publish-send").disabled = false;$("#publish-send").textContent = "Opublikuj pełną treść";
    }
  }
  $("#login-form").addEventListener("submit",async event=>{
    event.preventDefault();const submit=$("#login-form button");submit.disabled=true;$("#login-error").textContent="";
    try{const data=await api("/api/login",{method:"POST",body:JSON.stringify({username:$("#username").value.trim(),password:$("#password").value})});$("#password").value="";await showApp(data);}
    catch(error){$("#login-error").textContent=error.message;}finally{submit.disabled=false;}
  });
  $("#logout").append(icon("logout"));$("#refresh").append(icon("refresh"));$("#menu-toggle").append(icon("menu"));
  $("#logout").addEventListener("click",async()=>{try{await api("/api/logout",{method:"POST",body:"{}"});showLogin();}catch(error){toast(error.message,true);}});
  $("#refresh").addEventListener("click",()=>refresh());
  $("#menu-toggle").addEventListener("click",()=>{const open=$("#sidebar").classList.toggle("open");$("#sidebar-overlay").classList.toggle("hidden",!open);$("#menu-toggle").setAttribute("aria-expanded",String(open));});
  $("#sidebar-overlay").addEventListener("click",()=>navigate(currentView));
  $("#record-form").addEventListener("submit",saveForm);
  for(const id of ["#dialog-close","#dialog-cancel"])$(id).addEventListener("click",()=>$("#record-dialog").close());
  $("#record-dialog").addEventListener("close",()=>{for(const input of $("#record-dialog").querySelectorAll('input[type="password"]'))input.value="";activeForm=null;});
  $("#confirm-cancel").addEventListener("click",()=>$("#confirm-dialog").close());$("#confirm-delete").addEventListener("click",removeRecord);
  $("#publish-cancel").addEventListener("click",()=>$("#publish-dialog").close());$("#publish-send").addEventListener("click",publishRecord);
  $("#pass-decision-cancel").addEventListener("click",()=>$("#pass-decision-dialog").close());$("#pass-decision-submit").addEventListener("click",decidePass);
  $("#pass-decision-dialog").addEventListener("close",()=>{if(!$("#pass-decision-dialog").open){pendingPassDecision=null;$("#pass-decision-description").textContent="";}});
  window.addEventListener("hashchange",()=>{const view=location.hash.slice(1);if(authenticated&&(view==="overview"||resources[view]))navigate(view);});
  function tick(){$("#topbar-date").textContent=dateFormat.format(new Date())+" · "+timeFormat.format(new Date());}tick();setInterval(tick,30000);
  setInterval(()=>{if(authenticated&&!document.hidden&&!dialogsOpen())refresh(true);},20000);
  (async()=>{try{const session=await api("/api/session");if(session.authenticated)await showApp(session);}catch(error){$("#login-error").textContent=error.message;}})();
})();
