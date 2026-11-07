"use strict";

const { EmbedBuilder } = require("discord.js");

const MISSING = "Brak danych";
const FOOTER = "Służba Więzienna • System Raportów";

function text(value, limit) {
  if (typeof value !== "string" && !(typeof value === "number" && Number.isFinite(value))) return "";
  const result = String(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim().slice(0, limit);
  return /[\uD800-\uDBFF]$/.test(result) ? result.slice(0, -1) : result;
}

function identity(report) {
  const explicit = text(report.authorId, 100);
  const author = text(report.author, 200);
  const fallback = /^(?:<@!?(\d{17,20})>|(\d{17,20}))$/.exec(author);
  const id = /^\d{17,20}$/.test(explicit) ? explicit : fallback?.[1] || fallback?.[2] || "";
  return { id, name: id ? `<@${id}>` : author || MISSING };
}

function displayDate(value) {
  const date = text(value, 50);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return iso ? `${iso[3]}.${iso[2]}.${iso[1]}` : date || MISSING;
}

// A report may contain 4,000 characters while each Discord field allows 1,024.
// Split only the narrative and preserve every character instead of truncating it.
function narrativeFields(value) {
  let remaining = text(value, 4000) || MISSING;
  const fields = [];
  while (remaining) {
    let end = Math.min(remaining.length, 1024);
    if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
    fields.push({ name: fields.length ? "📝 Przebieg służby (ciąg dalszy)" : "📝 Przebieg służby",
      value: remaining.slice(0, end), inline: false });
    remaining = remaining.slice(end);
  }
  return fields;
}

function buildReportEmbed(report = {}, { timestamp = new Date() } = {}) {
  const officer = identity(report);
  return new EmbedBuilder()
    .setColor(0x19a85b)
    .setTitle("📋 NOWY RAPORT SŁUŻBOWY")
    .setDescription(`## 👤 Funkcjonariusz\n${officer.name}\n\n🆔 **ID użytkownika:** ${officer.id ? `\`${officer.id}\`` : MISSING}`)
    .addFields(
      { name: "📅 Data służby", value: displayDate(report.date), inline: false },
      { name: "⏰ Godziny służby", value: text(report.hours, 100) || MISSING, inline: false },
      { name: "📍 Miejsce służby", value: text(report.place, 200) || MISSING, inline: false },
      { name: "🚓 Rodzaj służby", value: text(report.serviceType, 200) || text(report.title, 200) || MISSING, inline: false },
      ...narrativeFields(report.content),
    )
    .setFooter({ text: FOOTER })
    .setTimestamp(timestamp);
}

function buildReportMessage(report = {}, options = {}) {
  return { content: `📋 **Nowy raport służbowy** • ${identity(report).name}`,
    embeds: [buildReportEmbed(report, options)], allowedMentions: { parse: [] } };
}

module.exports = { buildReportEmbed, buildReportMessage };
