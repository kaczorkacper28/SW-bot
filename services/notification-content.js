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
function channelShape(channel, guildId) {
  return channel && String(channel.guildId || channel.guild?.id || "") === guildId &&
    [0,5].includes(channel.type) && channel.isTextBased?.() && typeof channel.send === "function";
}

async function resolveDestination(client, resource, { env = process.env, fallbackChannelId } = {}) {
  const info = resourceInfo(resource);
  const guildId = env.GUILD_ID;
  if (typeof guildId !== "string" || !/^[0-9]{17,20}$/.test(guildId)) throw new Error("Ustaw poprawne GUILD_ID serwera Discord.");
  let guild;
  try { guild = client.guilds?.cache?.get(guildId) || await client.guilds?.fetch?.(guildId); }
  catch { throw new Error("Bot nie ma dostępu do skonfigurowanego serwera GUILD_ID."); }
  if (!guild || String(guild.id) !== guildId) throw new Error("Bot nie ma dostępu do skonfigurowanego serwera GUILD_ID.");
  const explicit = env[info.variable];
  const legacy = info.legacy ? env[info.legacy] : undefined;
  const channelId = explicit || fallbackChannelId || legacy;
  let channel;
  if (channelId) {
    if (typeof channelId !== "string" || !/^[0-9]{17,20}$/.test(channelId)) throw new Error(`Ustaw poprawny kanał ${info.variable}.`);
    try { channel = guild.channels?.cache?.get(channelId) || await guild.channels?.fetch?.(channelId); }
    catch { throw new Error(`Nie można odczytać kanału modułu. Sprawdź ${info.variable} i dostęp bota.`); }
  } else {
    let channels;
    try { channels = guild.channels?.fetch ? await guild.channels.fetch() : guild.channels?.cache; }
    catch { throw new Error(`Nie można odczytać listy kanałów. Ustaw ${info.variable}.`); }
    const aliases = new Set(info.aliases.map(normalizeChannelName));
    const matches = [...(channels?.values?.() || [])].filter(item => channelShape(item,guildId) && aliases.has(normalizeChannelName(item.name)));
    if (matches.length > 1) throw new Error(`Kilka kanałów pasuje do modułu. Wybierz jeden przez ${info.variable}.`);
    [channel] = matches;
  }
  if (!channelShape(channel,guildId)) throw new Error(`Kanał musi być tekstowy i należeć do GUILD_ID. Sprawdź ${info.variable}.`);
  let permitted = false;
  try {
    const permissions = client.user && channel.permissionsFor?.(client.user);
    permitted = Boolean(permissions && permissions.has(["ViewChannel","SendMessages","EmbedLinks"]));
  } catch { /* A missing permission result does not establish access. */ }
  if (!permitted) throw new Error(`Bot potrzebuje uprawnień Wyświetlanie kanału, Wysyłanie wiadomości i Osadzanie linków. Sprawdź ${info.variable}.`);
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

module.exports = { resolveDestination,buildNotice,normalizeChannelName };
