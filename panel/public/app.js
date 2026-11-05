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
  const actionLabels = {create:"Dodano wpis",update:"Zaktualizowano wpis",remove:"Usunięto wpis",delete:"Usunięto wpis",discord:"Aktywność Discord",publish:"Opublikowano na Discordzie","publish-pending":"Rozpoczęto publikację","publish-uncertain":"Sprawdź wynik publikacji na Discordzie"};
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
      {key:"cela",label:"Numer celi",required:true,max:50},
      {key:"poczatek",label:"Początek kary",type:"time",required:true,help:"Czas serwera, format HH:MM."},
      {key:"koniec",label:"Koniec kary",type:"time",required:true,help:"Wcześniejsza godzina oznacza kolejny dzień."},
      {key:"uwagi",label:"Uwagi",type:"textarea",max:1000,full:true},
      {key:"paused",label:"Wstrzymaj odliczanie kary",type:"checkbox",editOnly:true,full:true},
    ]},
    ranks: {label:"Lista stopni",singular:"wpis do listy SW",icon:"rank",description:"Lista przydziałów i numerów w działach Służby Więziennej.",fields:[
      {key:"userId",label:"ID użytkownika Discord",required:true,pattern:"[0-9]{17,20}",immutable:true,full:true},
      {key:"section",label:"Dział",options:Object.entries(sections),required:true},
      {key:"number",label:"Numer w dziale",type:"number",min:1,max:9999,required:true},
    ]},
    reports: {label:"Raporty",singular:"raport",icon:"file",description:"Raporty służbowe i dokumentacja działań.",fields:[
      {key:"title",label:"Tytuł raportu",required:true,max:200,full:true},
      {key:"author",label:"Autor raportu",max:100},
      {key:"status",label:"Status",options:statuses},
      {key:"content",label:"Treść raportu",type:"textarea",required:true,max:4000,full:true},
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
  };
  let snapshot = null;
  let currentView = "overview";
  let search = "";
  let authenticated = false;
  let loading = false;
  let activeForm = null;
  let pendingDelete = null;
  let pendingPublish = null;
  let lastRefresh = null;
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
    const node = el("div", "toast" + (isError ? " error" : ""), message);
    $("#toasts").append(node);
    setTimeout(() => node.remove(), 5500);
  }
  async function api(path, options = {}) {
    let response;
    try {
      response = await fetch(path, {...options, credentials:"same-origin", headers:{"Content-Type":"application/json",...options.headers},signal:AbortSignal.timeout(12000)});
    } catch {
      throw new Error("Brak połączenia z panelem. Sprawdź, czy serwer działa, i spróbuj ponownie.");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && path !== "/api/login") showLogin();
      throw new Error(typeof data.error === "string" ? data.error : "Nie udało się wykonać operacji (" + response.status + ").");
    }
    return data;
  }
  function showLogin() {
    authenticated = false;
    snapshot = null;
    $("#app").classList.add("hidden");
    $("#login-screen").classList.remove("hidden");
    if ($("#record-dialog").open) $("#record-dialog").close();
    if ($("#confirm-dialog").open) $("#confirm-dialog").close();
    if ($("#publish-dialog").open) $("#publish-dialog").close();
  }
  async function showApp(username) {
    authenticated = true;
    $("#login-screen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    $("#admin-name").textContent = username || "Administrator";
    const initials = (username || "AD").slice(0,2).toUpperCase();
    $(".sidebar-user .avatar").textContent = initials;
    currentView = location.hash.slice(1);
    if (currentView !== "overview" && !resources[currentView]) currentView = "overview";
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
      snapshot = await api("/api/state");
      lastRefresh = new Date();
      setConnection();
      $("#last-updated").textContent = "Aktualizacja: " + timeFormat.format(lastRefresh);
      renderNavigation();
      if (!$("#record-dialog").open && !$("#confirm-dialog").open && !$("#publish-dialog").open) {
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
      if (!snapshot && authenticated) {
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
    currentView = view;
    search = "";
    if (location.hash !== "#" + view) history.replaceState(null, "", "#" + view);
    $("#sidebar").classList.remove("open");
    $("#sidebar-overlay").classList.add("hidden");
    $("#menu-toggle").setAttribute("aria-expanded", "false");
    renderNavigation();
    if (snapshot) render();
  }
  function renderNavigation() {
    const navigation = $("#navigation");
    navigation.replaceChildren();
    const entries = [["overview", {label:"Pulpit",icon:"grid"}], ...Object.entries(resources)];
    for (const [key, meta] of entries) {
      const link = el("a", "nav-item" + (currentView === key ? " active" : ""));
      link.href = "#" + key;
      if (currentView === key) link.setAttribute("aria-current", "page");
      link.append(icon(meta.icon),el("span", "", meta.label));
      if (["members","prisoners","reports"].includes(key) && snapshot) link.append(el("span","nav-count",collection(key).length));
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
    if (currentView === "overview") renderOverview(); else renderResource();
  }
  function renderOverview() {
    const main = $("#main");
    main.replaceChildren(heading("Pulpit dowodzenia", "Bieżący obraz jednostki. Wszystko, czego potrzebujesz do służby.",[
      button("Odśwież", "button secondary", () => refresh(),"refresh"),button("Dodaj funkcjonariusza", "button primary", () => openForm("members"),"plus")
    ]));
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
    if (!events.length) activity.append(emptyState("activity","Dziennik jest jeszcze pusty","Dodaj pierwszy wpis. Operacje w panelu będą widoczne w tym miejscu."));
    else for (const event of events) activity.append(activityRow(event));
    left.append(activity);
    const recent = el("section","panel-card recent-table");
    recent.append(cardHeader("Kadra jednostki","Ostatnio dodani funkcjonariusze",button("Zobacz wszystkich →","text-link",() => navigate("members"))));
    const members = collection("members").slice().sort((a,b) => String(b.joinedAt || "").localeCompare(String(a.joinedAt || ""))).slice(0,5);
    if (!members.length) recent.append(emptyState("users","Brak funkcjonariuszy","Dodaj kadrę z panelu lub komendą /sw-dodaj na Discordzie.",button("Dodaj funkcjonariusza","button secondary small",() => openForm("members"),"plus")));
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
    quick.append(cardHeader("Szybkie działania"));
    const links = el("div","quick-links");
    for (const [name,label] of [["prisoners","Dodaj osadzonego"],["reports","Nowy raport"],["calls","Dodaj wezwanie"],["documents","Nowy dokument"]]) {
      const link = button("","quick-link",() => openForm(name));
      link.append(icon(resources[name].icon),el("span","",label));links.append(link);
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
    const actions = resource.readonly ? [] : [button("Dodaj wpis","button primary",() => openForm(currentView),"plus")];
    const main = $("#main");main.replaceChildren(heading(resource.label,resource.description,actions));
    if (resource.notice) main.append(el("div","notice",resource.notice));
    if (["reports","calls","proposals"].includes(currentView)) main.append(el("div","intro-strip","Zapis formularza tworzy wpis w ewidencji. Aby opublikować go na Discordzie, użyj przycisku wysyłki przy wpisie. Bot musi być połączony."));
    if (currentView === "documents") main.append(el("div","intro-strip","Dokumenty z panelu trafiają do ewidencji. Formularze i tickety Discord obsługuje ten sam bot komendą /setup-dokumenty."));
    const filters = el("div","filter-bar");
    const searchBox = el("label","search-box");searchBox.append(icon("search"));
    const input = el("input");input.id="records-search";input.type="search";input.placeholder="Szukaj w ewidencji…";input.setAttribute("aria-label","Szukaj w ewidencji");input.value=search;
    input.addEventListener("input",() => {search=input.value;renderRecords();});searchBox.append(input);
    filters.append(searchBox,el("span","filter-label",collection(currentView).length + " wpisów w ewidencji"));main.append(filters);
    const tableArea = el("section","panel-card");tableArea.id="records-area";main.append(tableArea);renderRecords();
  }
  function renderRecords() {
    const node = $("#records-area");if (!node) return;
    const query = search.toLocaleLowerCase("pl-PL").trim();
    let records = collection(currentView).filter(record => !query || Object.values(record).filter(value => typeof value === "string" || typeof value === "number").join(" ").toLocaleLowerCase("pl-PL").includes(query));
    if (currentView === "audit") records = recentEvents().filter(record => !query || Object.values(record).join(" ").toLocaleLowerCase("pl-PL").includes(query));
    node.replaceChildren();
    if (!records.length) {
      node.append(emptyState(resources[currentView].icon,query?"Brak wyników":"Ewidencja jest pusta",query?"Zmień frazę wyszukiwania, aby znaleźć wpis.":"Nowe wpisy pojawią się tutaj po zapisaniu danych.",!query && !resources[currentView].readonly ? button("Dodaj pierwszy wpis","button secondary small",() => openForm(currentView),"plus"):null));
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
  function buildTable(name,records,compact=false) {
    const wrapper=el("div","table-scroll");const table=el("table");
    const headings={members:["FUNKCJONARIUSZ","NUMER","STOPIEŃ","BILANS","AKCJE"],prisoners:["OSADZONY","PARAGRAF / WYROK","CELA","KARA","AKCJE"],ranks:["ID DISCORD","DZIAŁ","NUMER","AKCJE"],reports:["RAPORT","AUTOR","STATUS","DATA","AKCJE"],calls:["WEZWANIE","OSOBA WZYWANA","STATUS","DATA","AKCJE"],documents:["DOKUMENT","RODZAJ","STATUS","DATA","AKCJE"],proposals:["PROPOZYCJA","AUTOR","STATUS","DATA","AKCJE"],payouts:["ODBIORCA","KWOTA","POWÓD","STATUS WPISU","AKCJE"],audit:["OPERACJA","MODUŁ","WYKONAŁ","DATA"]};
    const head=el("thead");const row=el("tr");
    const labels=compact?headings[name].slice(0,3):headings[name];
    for(const label of labels){const th=el("th","",label);th.scope="col";row.append(th);}head.append(row);table.append(head);
    const body=el("tbody");
    for(const record of records){
      let cells=[];
      if(name==="members")cells=[personCell(record.name || "Funkcjonariusz SW",record.userId || record.id),textCell("SW-"+String(record.number || "?").padStart(2,"0")),badge(record.rank || "Rekrut"),textCell("+"+(record.plus||0)+" / −"+(record.minus||0)+" · Nagany: "+(record.reprimands||0))];
      if(name==="prisoners"){
        const seconds=Number(record.remainingSeconds||0);const minutes=Math.max(0,Math.ceil(seconds/60));
        cells=[personCell(record.imie || record.name,record.id),titleCell(record.paragraf || record.reason,record.wyrok),textCell(record.cela),badge(record.paused?"Wstrzymana · "+minutes+" min":minutes+" min")];
      }
      if(name==="ranks")cells=[textCell(record.userId||record.id),badge(sections[record.section]||record.section),textCell((record.section==="rekruci"?"SWRO":"SW-")+String(record.number||"?").padStart(2,"0"))];
      if(["reports","documents","proposals"].includes(name))cells=[titleCell(record.title||resources[name].label,record.content || fieldDescription(record.fields)),textCell(name==="documents"?(record.kind||record.type):(record.author||record.authorId)),publicationStatus(record),textCell(formatDate(record.createdAt))];
      if(name==="calls")cells=[titleCell(record.title||"Wezwanie",record.reason||record.content),textCell(record.target||record.name||record.userId),publicationStatus(record),textCell(formatDate(record.createdAt))];
      if(name==="payouts")cells=[textCell(record.recipient||record.userId),textCell(Number(record.amount||0).toLocaleString("pl-PL",{style:"currency",currency:"PLN"})),titleCell(record.reason||record.content,(record.paid===true||record.status==="wypłacona")?"Wypłata potwierdzona przez bota":"Ewidencja — bez przelewu"),badge(record.status)];
      if(name==="audit")cells=[titleCell(record.title||record.message||actionLabels[record.action]||record.action,record.recordId||record.targetId),textCell(resources[record.resource]?.label||record.resource||record.type),textCell(record.actor||record.username||"System"),textCell(formatDate(record.createdAt||record.timestamp||record.at))];
      const tr=el("tr");for(const node of compact?cells.slice(0,3):cells){const td=el("td");td.append(node);tr.append(td);}
      if(!compact&&!resources[name].readonly){
        const td=el("td");const actions=el("div","action-cell");
        const edit=button("","icon-button",()=>openForm(name,record),"edit");edit.title="Edytuj wpis";edit.setAttribute("aria-label","Edytuj wpis "+(record.title||record.name||record.imie||record.id));
        const remove=button("","icon-button",()=>confirmRemove(name,record),"trash");remove.title="Usuń wpis";remove.setAttribute("aria-label","Usuń wpis "+(record.title||record.name||record.imie||record.id));
        actions.append(edit);
        if (["reports","calls","proposals"].includes(name)) {
          const publish = button("","icon-button",()=>confirmPublish(name,record),"send");
          const sent = record.discordMessageId || record.messageId || ["pending","published","uncertain"].includes(record.publishState);
          publish.disabled = snapshot?.status?.online !== true || Boolean(sent);
          publish.title = sent ? "Wysyłka została już rozpoczęta. Sprawdź status wpisu." : snapshot?.status?.online !== true ? "Wysyłka wymaga połączenia bota z Discordem" : "Wyślij na Discord";
          publish.setAttribute("aria-label","Wyślij na Discord: " + (record.title || record.target || record.id));
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
    if (record.discordMessageId || record.messageId || record.publishState === "published") node.append(el("small","published-note","Wysłano na Discord"));
    else if (record.publishState === "pending") node.append(el("small","published-note","Wysyłka rozpoczęta"));
    else if (record.publishState === "uncertain") node.append(el("small","published-note uncertain","Sprawdź kanał Discord"));
    return node;
  }
  function openForm(name,record=null){
    const resource=resources[name];if(!resource || resource.readonly)return;
    activeForm={name,record};
    $("#dialog-title").textContent=(record?"Edytuj ":"Dodaj ")+resource.singular;
    $("#record-error").textContent="";$("#record-submit").disabled=false;
    const fields=$("#dialog-fields");fields.replaceChildren();
    for(const field of resource.fields){
      if(field.editOnly&&!record)continue;
      const wrapper=el("div","field"+(field.full?" full":"")+(field.type==="checkbox"?" checkbox":""));
      const id="field-"+field.key;
      const label=el("label","",field.label+(field.required?" *":""));label.htmlFor=id;
      let input;
      if(field.options){
        input=el("select");
        for(const option of field.options){const [value,title]=Array.isArray(option)?option:[option,option];const opt=el("option","",title);opt.value=value;input.append(opt);}
        if (record?.[field.key] && !field.options.some(option => (Array.isArray(option) ? option[0] : option) === record[field.key])) {
          const preserved = el("option","",String(record[field.key]) + " (zapis Discord)");preserved.value=String(record[field.key]);input.append(preserved);
        }
      }else{input=el(field.type==="textarea"?"textarea":"input");if(field.type!=="textarea")input.type=field.type||"text";}
      input.id=id;input.name=field.key;input.required=Boolean(field.required);
      if(field.min!==undefined)input.min=field.min;if(field.type==="number")input.step="1";
      if(field.max!==undefined){if(field.type==="number")input.max=field.max;else input.maxLength=field.max;}
      if(field.pattern)input.pattern=field.pattern;
      if(field.immutable&&record)input.disabled=true;
      let value=record?.[field.key]??field.default;
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
      if(field.help)wrapper.append(el("small","",field.help));
      fields.append(wrapper);
    }
    $("#record-dialog").showModal();
  }
  async function saveForm(event){
    event.preventDefault();if(!activeForm)return;
    const {name,record}=activeForm;
    const body={};
    for(const field of resources[name].fields){
      const input=$("#field-"+field.key);if(!input)continue;
      if (record && field.options && input.value === record[field.key] && !field.options.some(option => (Array.isArray(option) ? option[0] : option) === input.value)) continue;
      if(field.type==="checkbox")body[field.key]=input.checked;
      else if(field.type==="number")body[field.key]=input.value===""?0:Number(input.value);
      else body[field.key]=input.value.trim();
    }
    const submit=$("#record-submit");submit.disabled=true;submit.textContent="Zapisywanie…";$("#record-error").textContent="";
    try{
      await api("/api/"+name+(record?"/"+encodeURIComponent(record.id||record.userId):""),{method:record?"PATCH":"POST",body:JSON.stringify(body)});
      $("#record-dialog").close();toast(name==="payouts"?"Zapisano wpis w ewidencji. Pieniądze nie zostały wysłane.":"Zapisano wpis w ewidencji.");
      await refresh();
    }catch(error){$("#record-error").textContent=error.message;}finally{submit.disabled=false;submit.textContent="Zapisz wpis";}
  }
  function confirmRemove(name,record){
    pendingDelete={name,record};
    const title=record.title||record.name||record.imie||record.recipient||record.userId||record.id;
    $("#confirm-description").textContent="Wpis „"+title+"” zostanie trwale usunięty z ewidencji. Operacja zostanie zapisana w dzienniku.";
    $("#confirm-delete").disabled=false;$("#confirm-dialog").showModal();
  }
  async function removeRecord(){
    if(!pendingDelete)return;const {name,record}=pendingDelete;$("#confirm-delete").disabled=true;
    try{
      await api("/api/"+name+"/"+encodeURIComponent(record.id||record.userId),{method:"DELETE",body:"{}"});
      $("#confirm-dialog").close();toast("Usunięto wpis z ewidencji.");await refresh();
    }catch(error){toast(error.message,true);}finally{$("#confirm-delete").disabled=false;}
  }
  function confirmPublish(name,record) {
    pendingPublish = {name,record};
    $("#publish-description").textContent = "Do publikacji: „" + (record.title || record.target || record.id) + "”.";
    $("#publish-error").textContent = "";
    $("#publish-send").disabled = false;
    $("#publish-dialog").showModal();
  }
  async function publishRecord() {
    if (!pendingPublish) return;
    $("#publish-send").disabled = true;
    $("#publish-send").textContent = "Wysyłanie…";
    $("#publish-error").textContent = "";
    try {
      await api("/api/actions/publish",{method:"POST",body:JSON.stringify({resource:pendingPublish.name,id:String(pendingPublish.record.id)})});
      $("#publish-dialog").close();toast("Discord potwierdził publikację wpisu.");
      await refresh();
    } catch (error) {
      $("#publish-dialog").close();toast(error.message,true);
      await refresh(true);
    } finally {
      $("#publish-send").disabled = false;$("#publish-send").textContent = "Wyślij na Discord";
    }
  }
  $("#login-form").addEventListener("submit",async event=>{
    event.preventDefault();const submit=$("#login-form button");submit.disabled=true;$("#login-error").textContent="";
    try{const data=await api("/api/login",{method:"POST",body:JSON.stringify({username:$("#username").value.trim(),password:$("#password").value})});$("#password").value="";await showApp(data.username||$("#username").value.trim());}
    catch(error){$("#login-error").textContent=error.message;}finally{submit.disabled=false;}
  });
  $("#logout").append(icon("logout"));$("#refresh").append(icon("refresh"));$("#menu-toggle").append(icon("menu"));
  $("#logout").addEventListener("click",async()=>{try{await api("/api/logout",{method:"POST",body:"{}"});showLogin();}catch(error){toast(error.message,true);}});
  $("#refresh").addEventListener("click",()=>refresh());
  $("#menu-toggle").addEventListener("click",()=>{const open=$("#sidebar").classList.toggle("open");$("#sidebar-overlay").classList.toggle("hidden",!open);$("#menu-toggle").setAttribute("aria-expanded",String(open));});
  $("#sidebar-overlay").addEventListener("click",()=>navigate(currentView));
  $("#record-form").addEventListener("submit",saveForm);
  for(const id of ["#dialog-close","#dialog-cancel"])$(id).addEventListener("click",()=>$("#record-dialog").close());
  $("#confirm-cancel").addEventListener("click",()=>$("#confirm-dialog").close());$("#confirm-delete").addEventListener("click",removeRecord);
  $("#publish-cancel").addEventListener("click",()=>$("#publish-dialog").close());$("#publish-send").addEventListener("click",publishRecord);
  window.addEventListener("hashchange",()=>{const view=location.hash.slice(1);if(authenticated&&(view==="overview"||resources[view]))navigate(view);});
  function tick(){$("#topbar-date").textContent=dateFormat.format(new Date())+" · "+timeFormat.format(new Date());}tick();setInterval(tick,30000);
  setInterval(()=>{if(authenticated&&!document.hidden&&!$("#record-dialog").open&&!$("#confirm-dialog").open&&!$("#publish-dialog").open)refresh(true);},20000);
  (async()=>{try{const session=await api("/api/session");if(session.authenticated)await showApp(session.username);}catch(error){$("#login-error").textContent=error.message;}})();
})();
