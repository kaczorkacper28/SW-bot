"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createResourceNotifications } = require("./resource-notifications");
const { buildReportMessage } = require("./report-content");

const DATA_DIR = process.env.MANAGEMENT_DATA_DIR || process.env.SW_DATA_DIR || path.join(__dirname, "..", "data");
const RECORDS_FILE = path.join(DATA_DIR, "panel-records.json");
const KEY_FILE = path.join(DATA_DIR, "panel-bridge.key");
const RESOURCES = ["members", "prisoners", "passes", "ranks", "reports", "calls", "documents", "proposals", "payouts"];
const registry = new Map();
let server;
let serverReady;
let currentClient;
const notificationProviders = new Map();
let resourceNotifications;

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
let records = Object.fromEntries([...RESOURCES, "audit"].map(name => [name, []]));
if (fs.existsSync(RECORDS_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(RECORDS_FILE, "utf8"));
    if (!saved || Array.isArray(saved) || typeof saved !== "object") throw new Error("nieprawidłowy obiekt");
    for (const name of Object.keys(records)) {
      if (name === "passes" && saved[name] === undefined) continue;
      if (!Array.isArray(saved[name])) throw new Error(`pole ${name} nie jest listą`);
      records[name] = saved[name];
    }
  } catch (error) {
    throw new Error(`Nie można odczytać ${RECORDS_FILE}: ${error.message}; plik zachowano bez zmian.`, { cause: error });
  }
}

function persist() {
  const temporary = `${RECORDS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(records, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, RECORDS_FILE);
}

function getBridgeKey() {
  if (!fs.existsSync(KEY_FILE)) {
    try {
      fs.writeFileSync(KEY_FILE, crypto.randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  const key = fs.readFileSync(KEY_FILE, "utf8").trim();
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error(`Nieprawidłowy klucz zarządzania ${KEY_FILE}; plik zachowano bez zmian.`);
  return key;
}

function equalSecret(a, b) {
  const left = crypto.createHash("sha256").update(String(a)).digest();
  const right = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

function audit(resource, action, item, actor = "discord") {
  const entry = {
    id: crypto.randomUUID(), resource, action, actor: String(actor).slice(0, 64),
    recordId: item?.id == null ? null : String(item.id), createdAt: new Date().toISOString(),
  };
  records.audit.unshift(entry);
  records.audit = records.audit.slice(0, 2000);
  return entry;
}

// Discord modules call this after a successful action. Panel entries remain a ledger;
// creating a payout or call here does not send Discord messages or transfer money.
function record(resource, input, actor = "discord") {
  if (!RESOURCES.includes(resource)) throw new Error("Unknown management resource");
  const now = new Date().toISOString();
  const id = String(input?.id || crypto.randomUUID());
  const index = records[resource].findIndex(entry => String(entry.id) === id);
  const previous = index >= 0 ? records[resource][index] : {};
  const item = { ...previous, ...input, id, createdAt: previous.createdAt || input?.createdAt || now, updatedAt: now };
  if (index >= 0) records[resource][index] = item;
  else records[resource].unshift(item);
  audit(resource, index >= 0 ? "update" : "create", item, actor);
  persist();
  return item;
}

// A remote Discord action has already succeeded when modules journal it.
// A local disk failure must not tell users to repeat that successful action.
function recordDiscord(resource, input, actor = "discord") {
  try { return record(resource, input, actor); }
  catch (error) {
    console.error("Operacja Discord powiodła się, ale zapis dziennika nie powiódł się:", error.message);
    return null;
  }
}

function registerResource(name, handlers) {
  if (!RESOURCES.includes(name) || typeof handlers?.list !== "function") {
    throw new Error("Invalid management resource registration");
  }
  registry.set(name, handlers);
}

function registerNotifications(provider, resource = "prisoners") {
  if (!RESOURCES.includes(resource)) throw new Error("Invalid notification resource");
  notificationProviders.set(resource, provider);
}

function notificationList() {
  const native = [...notificationProviders].flatMap(([resource, provider]) => provider.list().map(item => ({ resource, ...item })));
  return [...native, ...(resourceNotifications?.list() || [])]
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt))).slice(0, 300);
}

function json(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const body = await new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let failed = false;
    request.on("data", chunk => {
      bytes += chunk.length;
      if (bytes > 65536) {
        if (!failed) reject(Object.assign(new Error("Żądanie jest za duże."), { status: 413 }));
        failed = true;
      } else if (!failed) chunks.push(chunk);
    });
    request.on("end", () => { if (!failed) resolve(Buffer.concat(chunks)); });
    request.on("error", reject);
  });
  try {
    const value = JSON.parse(body.toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
    for (const key of ["__proto__", "prototype", "constructor"]) {
      if (Object.hasOwn(value, key)) throw new Error();
    }
    return value;
  } catch {
    throw Object.assign(new Error("Nieprawidłowy obiekt JSON."), { status: 400 });
  }
}

const GENERIC_FIELDS = {
  reports: ["title", "author", "authorId", "date", "hours", "place", "serviceType", "content", "status"],
  calls: ["title", "target", "reason", "status"],
  documents: ["title", "kind", "content", "status"],
  proposals: ["title", "author", "content", "status"],
  payouts: ["title", "recipient", "amount", "reason", "status"],
};
const STATUSES = ["nowy", "w toku", "zatwierdzony", "odrzucony", "zamknięty"];
const REPORT_LIMITS = { author: 100, authorId: 20, date: 10, hours: 100, place: 200, serviceType: 100, content: 4000 };

function reportDate(value) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const polish = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!iso && !polish) throw Object.assign(new Error("Data służby musi mieć format DD.MM.RRRR lub RRRR-MM-DD."), { status: 400 });
  const [year, month, day] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [Number(polish[3]), Number(polish[2]), Number(polish[1])];
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw Object.assign(new Error("Podaj prawidłową datę służby."), { status: 400 });
  }
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${String(year).padStart(4, "0")}`;
}

function validateInput(resource, input, creating) {
  const fields = GENERIC_FIELDS[resource];
  if (!fields) return input;
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (!fields.includes(key)) throw Object.assign(new Error(`Niedozwolone pole: ${key}.`), { status: 400 });
    if (key === "amount") {
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1e9) throw Object.assign(new Error("Kwota musi być liczbą większą od zera, do 1 000 000 000."), { status: 400 });
      result[key] = value;
    } else {
      const limit = resource === "reports" && Object.hasOwn(REPORT_LIMITS, key) ? REPORT_LIMITS[key] : ["content", "reason"].includes(key) ? 10000 : 200;
      if (typeof value !== "string" || value.length > limit) throw Object.assign(new Error(`Pole ${key} musi być tekstem do ${limit} znaków.`), { status: 400 });
      result[key] = value.trim();
      if (key === "status" && !STATUSES.includes(result[key])) throw Object.assign(new Error("Nieprawidłowy status wpisu."), { status: 400 });
    }
  }
  if (resource === "reports") {
    if (Object.hasOwn(result, "authorId") && !/^\d{17,20}$/.test(result.authorId)) throw Object.assign(new Error("ID funkcjonariusza Discord musi zawierać 17–20 cyfr."), { status: 400 });
    if (Object.hasOwn(result, "date")) result.date = reportDate(result.date);
    for (const field of ["hours", "place", "serviceType", "content"]) {
      if (Object.hasOwn(result, field) && !result[field]) throw Object.assign(new Error(`Wymagane pole raportu: ${field}.`), { status: 400 });
    }
    if (Object.hasOwn(result, "serviceType")) result.title = result.serviceType;
  }
  const required = resource === "reports" && creating && Object.hasOwn(result, "serviceType")
    ? ["authorId", "date", "hours", "place", "serviceType", "content"]
    : resource === "payouts" ? ["recipient", "amount", "reason"] : resource === "calls" ? ["target", "reason"] : ["title"];
  for (const field of required) {
    if ((creating || Object.hasOwn(result, field)) && !result[field]) throw Object.assign(new Error(`Wymagane pole: ${field}.`), { status: 400 });
  }
  if (creating && !result.status) result.status = "nowy";
  return result;
}

async function state() {
  const collections = {};
  for (const name of RESOURCES) {
    collections[name] = registry.has(name) ? await registry.get(name).list() : records[name];
  }
  collections.audit = records.audit;
  const online = Boolean(currentClient?.isReady?.());
  return {
    collections,
    notifications: notificationList(),
    status: {
      online, mode: process.env.OFFLINE === "1" ? "offline" : (online ? "connected" : "connecting"),
      guilds: currentClient?.guilds?.cache?.size || 0,
      username: currentClient?.user?.tag || null,
    },
  };
}

async function mutate(resource, method, id, input, actor, role = "admin") {
  const handlers = registry.get(resource);
  if (resource === "passes" && !handlers) throw Object.assign(new Error("Moduł przepustek jest wyłączony."), { status: 503 });
  const action = method === "POST" ? "create" : method === "PATCH" ? "update" : "remove";
  if (action !== "remove") input = validateInput(resource, input, action === "create");
  let item;
  if (handlers) {
    if (typeof handlers[action] !== "function") throw Object.assign(new Error("Operacja niedostępna."), { status: 405 });
    const context = { actor: String(actor).slice(0, 64), role };
    item = action === "create" ? await handlers.create(input, context) : await handlers[action](id, input, context);
    if (item == null || item === false) throw Object.assign(new Error("Nie znaleziono wpisu."), { status: 404 });
  } else if (action === "create") {
    const now = new Date().toISOString();
    item = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    records[resource].unshift(item);
  } else {
    const index = records[resource].findIndex(entry => String(entry.id) === id);
    if (index < 0) throw Object.assign(new Error("Nie znaleziono wpisu."), { status: 404 });
    if (records[resource][index].publishState === "pending") throw Object.assign(new Error("Trwa publikacja wpisu. Zaczekaj na potwierdzenie przed edycją lub usunięciem."), { status: 409 });
    if (action === "update") {
      item = { ...records[resource][index], ...input, id, createdAt: records[resource][index].createdAt, updatedAt: new Date().toISOString() };
      records[resource][index] = item;
    } else [item] = records[resource].splice(index, 1);
  }
  audit(resource, action, typeof item === "object" ? item : { id }, actor);
  persist();
  const notification = await notifyMutation(resource, action, item, actor, handlers);
  return { record: item, ...(notification ? { notification } : {}) };
}

async function notifyMutation(resource, action, item, actor, handlers) {
  let notification;
  if (typeof handlers?.afterMutation === "function" || (resource !== "prisoners" && resourceNotifications)) {
    try {
      notification = typeof handlers?.afterMutation === "function"
        ? { resource, ...await handlers.afterMutation(action, item, String(actor).slice(0, 64)) }
        : await resourceNotifications.enqueue(resource, action, item, String(actor).slice(0, 64));
    }
    catch (error) {
      console.error("Zmiana została zapisana, ale powiadomienie Discord nie zostało przygotowane:", error.message);
      notification = { resource, recordId: item?.id, action, status: "failed", canRetry: false, message: "Zapisano zmianę, ale nie udało się zapisać kolejki powiadomień. Sprawdź dziennik bota i Discord przed ponowieniem." };
    }
  }
  return notification;
}

async function decidePass(id, input, actor, role) {
  if (role !== "admin") throw Object.assign(new Error("Decyzja o przepustce wymaga roli administratora."), { status: 403 });
  const handlers = registry.get("passes");
  if (typeof handlers?.decide !== "function") throw Object.assign(new Error("Moduł przepustek jest wyłączony."), { status: 503 });
  const item = await handlers.decide(id, input, { actor: String(actor).slice(0, 64), role });
  audit("passes", "update", item, actor);
  persist();
  const notification = await notifyMutation("passes", "update", item, actor, handlers);
  return { record: item, ...(notification ? { notification } : {}) };
}

async function publish(input, actor) {
  const destinations = { calls: "CALL_CHANNEL_ID", reports: "REPORT_CHANNEL_ID", proposals: "PROPOSALS_CHANNEL_ID" };
  const variable = Object.hasOwn(destinations, input?.resource) ? destinations[input.resource] : null;
  if (!variable || typeof input?.id !== "string") throw Object.assign(new Error("Wybierz raport, wezwanie lub propozycję do publikacji."), { status: 400 });
  const item = records[input.resource].find(entry => String(entry.id) === input.id);
  if (!item) throw Object.assign(new Error("Nie znaleziono wpisu."), { status: 404 });
  if (item.discordMessageId || item.messageId || ["pending", "published", "uncertain"].includes(item.publishState)) throw Object.assign(new Error("Wpis został już wysłany albo wynik wysyłki wymaga sprawdzenia na Discordzie. Ponowna wysyłka zablokowana."), { status: 409 });
  if (!currentClient?.isReady?.()) throw Object.assign(new Error("Bot nie jest połączony z Discordem. Publikacja wymaga trybu online."), { status: 503 });
  const channelId = process.env[variable];
  if (!channelId) throw Object.assign(new Error(`Skonfiguruj kanał ${variable}, aby opublikować wpis.`), { status: 503 });
  const content = input.resource === "calls" ? item.reason : item.content;
  if (typeof content !== "string" || !content.trim() || content.length > 4000) throw Object.assign(new Error("Publikacja wymaga treści od 1 do 4000 znaków."), { status: 400 });
  let channel;
  try { channel = await currentClient.channels.fetch(channelId); }
  catch { throw Object.assign(new Error("Nie można odczytać kanału publikacji. Sprawdź identyfikator i uprawnienia bota."), { status: 503 }); }
  if (!channel?.isTextBased?.() || typeof channel.send !== "function") throw Object.assign(new Error("Kanał publikacji nie obsługuje wiadomości tekstowych."), { status: 503 });
  if (!process.env.GUILD_ID || String(channel.guildId || channel.guild?.id || "") !== String(process.env.GUILD_ID) || ![0, 5].includes(channel.type)) {
    throw Object.assign(new Error("Kanał publikacji musi należeć do skonfigurowanego serwera Discord GUILD_ID."), { status: 503 });
  }
  const reportMessage = input.resource === "reports" ? buildReportMessage(item) : null;
  // Channel lookup can overlap an edit or deletion. Never send a stale snapshot.
  const current = records[input.resource].find(entry => String(entry.id) === input.id);
  if (current !== item) throw Object.assign(new Error("Wpis został zmieniony lub usunięty podczas przygotowania publikacji. Odśwież dane."), { status: 409 });
  // Recheck after the asynchronous channel fetch so concurrent clicks cannot both send.
  if (item.discordMessageId || item.messageId || item.publishState) throw Object.assign(new Error("Wysyłka tego wpisu została już rozpoczęta."), { status: 409 });
  item.publishState = "pending";
  item.updatedAt = new Date().toISOString();
  audit(input.resource, "publish-pending", item, actor);
  persist();
  try {
    const fields = [];
    if (input.resource === "calls" && item.target) fields.push({ name: "Adresat", value: String(item.target).slice(0, 1024) });
    if (item.author) fields.push({ name: "Autor", value: String(item.author).slice(0, 1024) });
    if (input.resource === "proposals" && item.title) fields.push({ name: "Tytuł", value: String(item.title).slice(0, 1024) });
    const message = await channel.send(reportMessage || {
      embeds: [{ title: input.resource === "proposals" ? "💡 Nowa propozycja" : String(item.title || (input.resource === "calls" ? "Wezwanie SW" : "Służba Więzienna")).slice(0, 256), description: content, color: 3447003, fields, timestamp: new Date().toISOString() }],
      allowedMentions: { parse: [] },
    });
    if (!message?.id) throw new Error("Discord did not confirm message ID");
    item.discordMessageId = String(message.id);
    item.publishState = "published";
    item.publishedAt = new Date().toISOString();
    item.updatedAt = item.publishedAt;
    audit(input.resource, "publish", item, actor);
    persist();
    if (input.resource === "proposals") {
      try {
        for (const emoji of ["🟢", "🟡", "🔴"]) await message.react(emoji);
        item.votingState = "ready";
      } catch {
        item.votingState = "incomplete";
        console.error("Propozycja została wysłana, ale nie udało się dodać wszystkich reakcji głosowania.");
      }
      persist();
    }
    return item;
  } catch (error) {
    item.publishState = "uncertain";
    item.updatedAt = new Date().toISOString();
    audit(input.resource, "publish-uncertain", item, actor);
    persist();
    console.error("Discord publication could not be confirmed:", error.message);
    throw Object.assign(new Error("Nie potwierdzono wysyłki. Sprawdź kanał Discord; ponowna wysyłka została zablokowana, aby uniknąć duplikatu."), { status: 502 });
  }
}

async function startManagement({ client, host = "127.0.0.1", port = Number(process.env.MANAGEMENT_PORT || 3210) } = {}) {
  if (server) return serverReady;
  currentClient = client;
  resourceNotifications = createResourceNotifications({ client, dataDir: DATA_DIR,
    getFallbackChannelId: resource => registry.get(resource)?.notificationChannelId?.() });
  for (const provider of notificationProviders.values()) provider.start();
  resourceNotifications.start();
  const key = getBridgeKey();
  server = http.createServer(async (request, response) => {
    try {
      if (!equalSecret(request.headers.authorization || "", `Bearer ${key}`)) return json(response, 401, { error: "Brak dostępu do bota." });
      const url = new URL(request.url, "http://localhost");
      if (request.method === "GET" && url.pathname === "/api/health") return json(response, 200, { status: "ok" });
      if (request.method === "GET" && url.pathname === "/api/state") return json(response, 200, await state());
      if (request.method === "GET" && url.pathname === "/api/notifications") return json(response, 200, { notifications: notificationList() });
      const retryNotification = /^\/api\/notifications\/([^/]+)\/retry$/.exec(url.pathname);
      if (request.method === "POST" && retryNotification) {
        const notificationId = decodeURIComponent(retryNotification[1]);
        if (resourceNotifications?.has(notificationId)) return json(response, 200, { notification: await resourceNotifications.retry(notificationId) });
        for (const [resource, provider] of notificationProviders) {
          if (provider.has?.(notificationId) || provider.list().some(item => item.id === notificationId)) {
            return json(response, 200, { notification: { resource, ...await provider.retry(notificationId) } });
          }
        }
        return json(response, 404, { error: "Nie znaleziono powiadomienia." });
      }
      const actor = request.headers["x-panel-user"] || "panel";
      // The private bearer key already grants bridge access. Older private clients
      // omit the role; the public proxy always supplies the authenticated role.
      const role = request.headers["x-panel-role"] ?? "admin";
      if (!["admin", "operator", "viewer"].includes(role)) return json(response, 403, { error: "Nieprawidłowa rola panelu." });
      const passDecision = /^\/api\/passes\/([^/]+)\/decision$/.exec(url.pathname);
      if (passDecision && request.method === "POST") {
        const passId = decodeURIComponent(passDecision[1]);
        if (passId.length > 128) return json(response, 400, { error: "Nieprawidłowy identyfikator." });
        return json(response, 200, await decidePass(passId, await readJson(request), actor, role));
      }
      if (request.method === "POST" && url.pathname === "/api/actions/publish") {
        return json(response, 200, { record: await publish(await readJson(request), request.headers["x-panel-user"] || "panel") });
      }
      const match = /^\/api\/([a-z]+)(?:\/([^/]+))?$/.exec(url.pathname);
      if (!match || !RESOURCES.includes(match[1])) return json(response, 404, { error: "Nieznany zasób." });
      const [, resource, rawId] = match;
      const id = rawId ? decodeURIComponent(rawId) : null;
      if (id && id.length > 128) return json(response, 400, { error: "Nieprawidłowy identyfikator." });
      if ((request.method === "POST" && id) || (["PATCH", "DELETE"].includes(request.method) && !id) || !["POST", "PATCH", "DELETE"].includes(request.method)) {
        return json(response, 405, { error: "Niedozwolona metoda." });
      }
      const input = request.method === "DELETE" ? {} : await readJson(request);
      const result = await mutate(resource, request.method, id, input, actor, role);
      return json(response, request.method === "POST" ? 201 : 200, { ...(request.method === "DELETE" ? { ok: true } : {}), ...result });
    } catch (error) {
      if (!error.status || error.status >= 500) console.error("Management request failed:", error.message);
      const known = error.status >= 400 && error.status < 600;
      json(response, known ? error.status : 500, { error: known ? error.message : "Błąd obsługi danych bota." });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  const active = server;
  serverReady = new Promise((resolve, reject) => {
    const failed = error => { server = undefined; serverReady = undefined; reject(error); };
    active.once("error", failed);
    active.listen(port, host, () => {
      active.removeListener("error", failed);
      console.log(`Management API nasłuchuje na ${host}:${active.address().port}.`);
      resolve(active);
    });
  });
  return serverReady;
}

async function stop() {
  if (server) {
    const active = server;
    await serverReady;
    server = undefined;
    serverReady = undefined;
    await new Promise((resolve, reject) => active.close(error => error ? reject(error) : resolve()));
  }
  for (const provider of notificationProviders.values()) await provider.stop();
  await resourceNotifications?.stop();
}

module.exports = { registerResource, registerNotifications, record, recordDiscord, startManagement, start: startManagement, stop };
