"use strict";

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const MISSING = "Brak danych";
const STATES = Object.freeze({
  oczekuje: { title: "🎫 WNIOSEK O PRZEPUSTKĘ", label: "Oczekuje na decyzję", field: "🟡 Status", color: 0xe0ab39 },
  zatwierdzona: { title: "✅ PRZEPUSTKA ZATWIERDZONA", label: "Zatwierdzona", field: "🟢 Status", color: 0x269563 },
  odrzucona: { title: "❌ PRZEPUSTKA ODRZUCONA", label: "Odrzucona", field: "🔴 Status", color: 0xb84444 },
  anulowana: { title: "🎫 PRZEPUSTKA ANULOWANA", label: "Anulowana", field: "⚪ Status", color: 0x667788 },
});
const dateFormat = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

function text(value, limit = 200) {
  if (typeof value !== "string" && !(typeof value === "number" && Number.isFinite(value))) return "";
  const result = String(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim().slice(0, limit);
  return /[\uD800-\uDBFF]$/.test(result) ? result.slice(0, -1) : result;
}

function actor(value) {
  const name = text(value, 128);
  return /^\d{17,20}$/.test(name) ? `<@${name}>` : name || MISSING;
}

function displayDate(value) {
  const source = text(value, 100);
  const date = /^\d{4}-\d{2}-\d{2}T/.test(source) ? new Date(source) : null;
  return date && Number.isFinite(date.getTime()) ? dateFormat.format(date) : source || MISSING;
}

function buildPassEmbed(record = {}, { timestamp } = {}) {
  record = record && typeof record === "object" && !Array.isArray(record) ? record : {};
  const state = typeof record.status === "string" && Object.hasOwn(STATES, record.status) ? STATES[record.status] : null;
  const embed = new EmbedBuilder()
    .setTitle(state?.title || "🎫 PRZEPUSTKA")
    .setColor(state?.color || 0x667788)
    .setDescription(`### 👤 ${text(record.osadzony, 150) || MISSING}\n**ID osadzonego:** ${text(record.osadzonyId, 80) || MISSING}`)
    .addFields(
      { name: "🎫 Numer wniosku", value: text(record.id, 80) || MISSING, inline: true },
      { name: "🕐 Od", value: text(record.od, 20) || MISSING, inline: true },
      { name: "🕐 Do", value: text(record.do, 20) || MISSING, inline: true },
      { name: "📍 Miejsce", value: text(record.miejsce, 200) || MISSING, inline: false },
      { name: "📝 Powód", value: text(record.powod, 1000) || MISSING, inline: false },
      { name: state?.field || "Status", value: state?.label || MISSING, inline: false },
      { name: "👮 Złożył", value: actor(record.zlozyl), inline: false },
    )
    .setFooter({ text: "Służba Więzienna • Rejestr przepustek" });
  if (record.utworzono) embed.addFields({ name: "📅 Złożono", value: displayDate(record.utworzono), inline: false });
  if (["zatwierdzona", "odrzucona"].includes(record.status)) {
    embed.addFields({ name: record.status === "zatwierdzona" ? "👮 Zatwierdził" : "👮 Odrzucił",
      value: actor(record.rozpatrzyl), inline: false });
    if (record.rozpatrzono) embed.addFields({ name: "📅 Data decyzji", value: displayDate(record.rozpatrzono), inline: false });
  }
  const sourceTimestamp = timestamp ?? record.rozpatrzono ?? record.utworzono;
  if (sourceTimestamp !== undefined && sourceTimestamp !== null) {
    const date = sourceTimestamp instanceof Date ? sourceTimestamp : typeof sourceTimestamp === "string" ? new Date(sourceTimestamp) : null;
    if (date && Number.isFinite(date.getTime())) embed.setTimestamp(date);
  }
  return embed;
}

// Return message components directly, including an empty list once reviewed.
function buildPassButtons(record = {}) {
  record = record && typeof record === "object" && !Array.isArray(record) ? record : {};
  const id = text(record.id, 81);
  if (record.status !== "oczekuje" || !/^P-\d{3,}$/.test(id) || id.length > 80) return [];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`przepustka_zgoda_${id}`).setLabel("Zatwierdź").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`przepustka_odmowa_${id}`).setLabel("Odrzuć").setEmoji("❌").setStyle(ButtonStyle.Danger),
  )];
}

module.exports = { buildPassEmbed, buildPassButtons };
