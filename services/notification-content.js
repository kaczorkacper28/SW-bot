"use strict";

const { EmbedBuilder } = require("discord.js");

const RESOURCES = Object.freeze({
  members: { label:"funkcjonariusza", variable:"PANEL_MEMBERS_CHANNEL_ID", aliases:["kadry","funkcjonariusze"] },
  ranks: { label:"wpis listy stopni", variable:"PANEL_RANKS_CHANNEL_ID", aliases:["stopnie","lista sw"] },
  reports: { label:"raport", variable:"PANEL_REPORTS_CHANNEL_ID", legacy:"REPORT_CHANNEL_ID", aliases:["raporty","raporty służbowe"] },
  calls: { label:"wezwanie", variable:"PANEL_CALLS_CHANNEL_ID", legacy:"CALL_CHANNEL_ID", aliases:["wezwania"] },
  documents: { label:"dokument", variable:"PANEL_DOCUMENTS_CHANNEL_ID", aliases:["dokumenty"] },
  proposals: { label:"propozycję", variable:"PANEL_PROPOSALS_CHANNEL_ID", legacy:"PROPOSALS_CHANNEL_ID", aliases:["propozycje"] },
  payouts: { label:"wpis wypłaty", variable:"PANEL_PAYOUTS_CHANNEL_ID", legacy:"LOG_CHANNEL_ID", aliases:["wypłaty"] }
});
const ACTIONS = Object.freeze({ create:"Dodano", update:"Zmieniono", remove:"Usunięto" });

function normalizeChannelName(value) {
  return typeof value === "string" ? value.replace(/ł/g,"l").replace(/Ł/g,"L").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"") : "";
}
function resourceInfo(resource) {
  if (!Object.hasOwn(RESOURCES,resource)) throw new Error("Nieznany moduł powiadomień panelu.");
  return RESOURCES[resource];
}
const PERMISSIONS = Object.freeze({
  ViewChannel: "Wyświetlanie kanału",
  SendMessages: "Wysyłanie wiadomości",
  EmbedLinks: "Osadzanie linków",
});
const CONFIGURATION_CODES = new Set([
  "INVALID_GUILD_ID", "GUILD_UNAVAILABLE", "INVALID_CHANNEL_ID", "CHANNEL_UNAVAILABLE",
  "CHANNEL_WRONG_GUILD", "CHANNEL_NOT_TEXT", "CHANNELS_UNAVAILABLE", "CHANNEL_MISSING",
  "CHANNEL_AMBIGUOUS", "PERMISSIONS_UNAVAILABLE", "MISSING_PERMISSIONS",
]);

// Messages are assembled only from this fixed vocabulary. SDK errors, channel
// identifiers and environment values are deliberately never copied into them.
class NotificationConfigurationError extends Error {
  constructor(code, resource, { source = "names", missingPermissions = [] } = {}) {
    const info = resourceInfo(resource);
    if (!CONFIGURATION_CODES.has(code)) throw new TypeError("Nieznany błąd konfiguracji powiadomień.");
    const setting = ["INVALID_GUILD_ID", "GUILD_UNAVAILABLE"].includes(code) ? "GUILD_ID"
      : source === "legacy" && info.legacy ? info.legacy : info.variable;
    const channelHint = resource === "members" && source !== "panel"
      ? `Wybierz kanał komendą /sw-ustaw-logi albo ustaw ${info.variable} w .env.`
      : setting === info.variable ? `Sprawdź ${setting} w .env.`
        : `Sprawdź ${setting} albo ustaw ${info.variable} w .env.`;
    const missing = Object.keys(PERMISSIONS).filter(permission => missingPermissions.includes(permission));
    const messages = {
      INVALID_GUILD_ID: "Ustaw poprawne GUILD_ID serwera Discord w .env.",
      GUILD_UNAVAILABLE: "Bot nie ma dostępu do serwera wskazanego przez GUILD_ID. Sprawdź GUILD_ID i dodaj bota do tego serwera.",
      INVALID_CHANNEL_ID: `Identyfikator kanału ma nieprawidłowy format. ${channelHint}`,
      CHANNEL_UNAVAILABLE: `Bot nie może odczytać wskazanego kanału. Sprawdź, czy kanał istnieje i bot ma do niego dostęp. ${channelHint}`,
      CHANNEL_WRONG_GUILD: `Wskazany kanał należy do innego serwera niż GUILD_ID. ${channelHint}`,
      CHANNEL_NOT_TEXT: `Wskazany kanał nie obsługuje zwykłych wiadomości tekstowych. ${channelHint}`,
      CHANNELS_UNAVAILABLE: `Bot nie może odczytać listy kanałów na serwerze GUILD_ID. ${channelHint}`,
      CHANNEL_MISSING: `Nie znaleziono kanału tekstowego. Szukane nazwy po pominięciu emoji, separatorów i polskich znaków: ${info.aliases.map(normalizeChannelName).join(", ")}. ${channelHint}`,
      CHANNEL_AMBIGUOUS: `Kilka kanałów pasuje do modułu. Wskaż jednoznaczny kanał przez ${info.variable} w .env. ${resource === "members" && source !== "panel" ? "Możesz też użyć komendy /sw-ustaw-logi." : ""}`.trim(),
      PERMISSIONS_UNAVAILABLE: `Nie można sprawdzić uprawnień bota na kanale. Sprawdź dostęp bota i ustawienia uprawnień kanału. ${channelHint}`,
      MISSING_PERMISSIONS: `Na kanale brakuje botowi uprawnień: ${(missing.length ? missing : Object.keys(PERMISSIONS)).map(permission => PERMISSIONS[permission]).join(", ")}. ${channelHint}`,
    };
    super(messages[code]);
    this.name = "NotificationConfigurationError";
    this.code = code;
    this.setting = setting;
    this.resource = resource;
  }
}

// Persist only a validated descriptor. Stored metadata is never a source of
// trusted display text, even if a file also contains an arbitrary message.
function notificationConfigurationDiagnostic(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  try {
    const { code,setting,resource } = value;
    if (typeof resource !== "string" || !Object.hasOwn(RESOURCES,resource) || !CONFIGURATION_CODES.has(code)) return undefined;
    const info = RESOURCES[resource];
    const allowed = ["INVALID_GUILD_ID", "GUILD_UNAVAILABLE"].includes(code) ? ["GUILD_ID"] : [info.variable,info.legacy].filter(Boolean);
    if (typeof setting !== "string" || !allowed.includes(setting)) return undefined;
    return { code,setting,resource };
  } catch { return undefined; }
}

function channelGuildId(channel) {
  try {
    const id = channel?.guildId || channel?.guild?.id;
    return typeof id === "string" ? id : "";
  } catch { return ""; }
}
function textChannel(channel) {
  try { return channel && [0,5].includes(channel.type) && channel.isTextBased?.() && typeof channel.send === "function"; }
  catch { return false; }
}
function channelShape(channel, guildId) { return channelGuildId(channel) === guildId && textChannel(channel); }

async function resolveDestination(client, resource, { env = process.env, fallbackChannelId } = {}) {
  const info = resourceInfo(resource);
  const guildId = env.GUILD_ID;
  if (typeof guildId !== "string" || !/^[0-9]{17,20}$/.test(guildId)) throw new NotificationConfigurationError("INVALID_GUILD_ID",resource);
  let guild;
  try { guild = client.guilds?.cache?.get(guildId) || await client.guilds?.fetch?.(guildId); }
  catch { throw new NotificationConfigurationError("GUILD_UNAVAILABLE",resource); }
  if (!guild || typeof guild.id !== "string" || guild.id !== guildId) throw new NotificationConfigurationError("GUILD_UNAVAILABLE",resource);
  const explicit = env[info.variable];
  const legacy = info.legacy ? env[info.legacy] : undefined;
  const channelId = explicit || fallbackChannelId || legacy;
  const source = explicit ? "panel" : fallbackChannelId ? "saved" : legacy ? "legacy" : "names";
  const fail = (code, options) => new NotificationConfigurationError(code,resource,{ source,...options });
  let channel;
  if (channelId) {
    if (typeof channelId !== "string" || !/^[0-9]{17,20}$/.test(channelId)) throw fail("INVALID_CHANNEL_ID");
    try { channel = guild.channels?.cache?.get(channelId) || await guild.channels?.fetch?.(channelId); }
    catch { throw fail("CHANNEL_UNAVAILABLE"); }
    if (!channel) throw fail("CHANNEL_UNAVAILABLE");
  } else {
    let matches;
    try {
      const channels = guild.channels?.fetch ? await guild.channels.fetch() : guild.channels?.cache;
      const aliases = new Set(info.aliases.map(normalizeChannelName));
      matches = [...(channels?.values?.() || [])].filter(item => channelShape(item,guildId) && aliases.has(normalizeChannelName(item.name)));
    } catch { throw fail("CHANNELS_UNAVAILABLE"); }
    if (matches.length > 1) throw fail("CHANNEL_AMBIGUOUS");
    [channel] = matches;
    if (!channel) throw fail("CHANNEL_MISSING");
  }
  if (channelGuildId(channel) !== guildId) throw fail("CHANNEL_WRONG_GUILD");
  if (!textChannel(channel)) throw fail("CHANNEL_NOT_TEXT");
  let missing;
  try {
    const permissions = client.user && channel.permissionsFor?.(client.user);
    if (!permissions || typeof permissions.has !== "function") throw new Error();
    missing = Object.keys(PERMISSIONS).filter(permission => !permissions.has([permission]));
  } catch { throw fail("PERMISSIONS_UNAVAILABLE"); }
  if (missing.length) throw fail("MISSING_PERMISSIONS",{ missingPermissions:missing });
  return channel;
}

function bounded(value, limit = 200) {
  if (typeof value !== "string" && !(typeof value === "number" && Number.isFinite(value))) return "";
  const text = String(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,"").trim();
  const result = text.slice(0,limit);
  return /[\uD800-\uDBFF]$/.test(result) ? result.slice(0,-1) : result;
}

// This is a change announcement, separate from publishing full business content.
// Only listed domain fields are rendered; account/credential properties are ignored.
function buildNotice(event) {
  const info = resourceInfo(event?.resource);
  if (!Object.hasOwn(ACTIONS,event?.action)) throw new Error("Nieznana operacja powiadomienia panelu.");
  const timestamp = new Date(event.createdAt);
  if (!Number.isFinite(timestamp.getTime())) throw new Error("Nieprawidłowa data powiadomienia panelu.");
  const snapshot = event.snapshot && typeof event.snapshot === "object" && !Array.isArray(event.snapshot) ? event.snapshot : {};
  const embed = new EmbedBuilder().setTitle(`Panel SW • ${ACTIONS[event.action]} ${info.label}`)
    .setColor(event.action === "remove" ? 0xb84444 : event.action === "create" ? 0x269563 : 0x426b9f)
    .addFields({ name:"Operator panelu",value:bounded(event.actor,128) || "Nieznany" },
      { name:"Identyfikator wpisu",value:bounded(event.recordId,128) || "Brak" })
    .setFooter({ text:`Zdarzenie ${bounded(event.id,128) || "bez identyfikatora"}` }).setTimestamp(timestamp);
  const add = (name,value,limit = 200) => { const content = bounded(value,limit); if (content) embed.addFields({ name,value:content }); };
  let excerpt;
  if (event.resource === "members") {
    embed.setDescription("Zmiana ewidencji funkcjonariuszy.");
    add("Funkcjonariusz",bounded(snapshot.name) || snapshot.userId);
    add("Numer służbowy",snapshot.number); add("Stopień",snapshot.rank); add("Korpus",snapshot.corps);
    add("Plusy",snapshot.plus); add("Minusy",snapshot.minus); add("Nagany",snapshot.reprimands);
  } else if (event.resource === "ranks") {
    embed.setDescription("Zmiana wpisu listy stopni SW.");
    add("Funkcjonariusz",snapshot.userId); add("Dział",snapshot.section); add("Numer",snapshot.number);
  } else if (event.resource === "payouts") {
    embed.setDescription("EWIDENCJA WYPŁAT • Ta operacja zmienia wyłącznie wpis ewidencji i nie wykonuje przelewu.");
    add("Odbiorca",bounded(snapshot.recipient) || snapshot.userId);
    add("Kwota ewidencji",snapshot.amount); add("Status wpisu",snapshot.status);
    excerpt = bounded(snapshot.reason,500) || bounded(snapshot.content,500);
  } else {
    embed.setDescription("Powiadomienie o zmianie wpisu w panelu SW.");
    add("Tytuł",snapshot.title); add("Status wpisu",snapshot.status);
    if (event.resource === "calls") { add("Adresat",bounded(snapshot.target) || bounded(snapshot.name) || snapshot.userId); add("Termin",snapshot.deadline); }
    if (event.resource === "documents") add("Rodzaj dokumentu",snapshot.kind);
    if (["reports","proposals"].includes(event.resource)) add("Autor wpisu",bounded(snapshot.author) || snapshot.authorId);
    if (event.resource === "reports") {
      add("Data służby", snapshot.date); add("Godziny służby", snapshot.hours);
      add("Miejsce służby", snapshot.place); add("Rodzaj służby", snapshot.serviceType || snapshot.title);
    }
    excerpt = bounded(snapshot.content,500) || bounded(snapshot.reason,500);
  }
  if (excerpt) add("Fragment treści",excerpt,500);
  return embed;
}

module.exports = { resolveDestination,buildNotice,normalizeChannelName,NotificationConfigurationError,notificationConfigurationDiagnostic };
