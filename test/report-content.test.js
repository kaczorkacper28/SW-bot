"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { buildReportEmbed, buildReportMessage } = require("../services/report-content");

const ID = "100000000000000321";
const timestamp = new Date("2026-08-23T01:09:00.000Z");
const sample = () => ({ authorId: ID, author: "Testowy funkcjonariusz", date: "2026-08-22", hours: "20:00",
  place: "Sąd Okręgowy w Warszawie", serviceType: "Konwój", content: "Przeprowadzono konwój i powrót do jednostki." });
const json = report => buildReportEmbed(report, { timestamp }).toJSON();

test("service report matches the shared Discord layout and all five duty sections", () => {
  const report = json(sample());
  assert.equal(report.title, "📋 NOWY RAPORT SŁUŻBOWY");
  assert.equal(report.color, 0x19a85b);
  assert.equal(report.description, `## 👤 Funkcjonariusz\n<@${ID}>\n\n🆔 **ID użytkownika:** \`${ID}\``);
  assert.deepEqual(report.fields, [
    { name: "📅 Data służby", value: "22.08.2026", inline: false },
    { name: "⏰ Godziny służby", value: "20:00", inline: false },
    { name: "📍 Miejsce służby", value: "Sąd Okręgowy w Warszawie", inline: false },
    { name: "🚓 Rodzaj służby", value: "Konwój", inline: false },
    { name: "📝 Przebieg służby", value: "Przeprowadzono konwój i powrót do jednostki.", inline: false },
  ]);
  assert.equal(report.footer.text, "Służba Więzienna • System Raportów");
  assert.equal(report.timestamp, timestamp.toISOString());
  const message = buildReportMessage(sample(), { timestamp });
  assert.equal(message.content, `📋 **Nowy raport służbowy** • <@${ID}>`);
  assert.deepEqual(message.allowedMentions, { parse: [] });
  assert.deepEqual(message.embeds[0].toJSON(), report);
});

test("legacy report title and native date survive without inventing missing duty information", () => {
  const report = json({ author: "Anna Testowa", title: "Patrol", date: "22.08.2026", content: "Treść starszego raportu" });
  assert.match(report.description, /Anna Testowa/);
  assert.match(report.description, /ID użytkownika:\*\* Brak danych/);
  assert.doesNotMatch(report.description, /<@/);
  assert.equal(report.fields[0].value, "22.08.2026");
  assert.equal(report.fields[1].value, "Brak danych");
  assert.equal(report.fields[2].value, "Brak danych");
  assert.equal(report.fields[3].value, "Patrol");
  assert.equal(report.fields[4].value, "Treść starszego raportu");
});

test("identity is inferred only from exact Discord mention or numeric ID", () => {
  for (const author of [ID, `<@${ID}>`, `<@!${ID}>`]) {
    assert.match(json({ author }).description, new RegExp(`<@${ID}>`));
  }
  for (const author of [`Osoba ${ID}`, `<@${ID}> i ktoś`, "@everyone"]) {
    assert.match(json({ author }).description, /ID użytkownika:\*\* Brak danych/);
  }
  assert.match(json({ authorId: "invalid", author: "Brak ID" }).description, /ID użytkownika:\*\* Brak danych/);
});

test("long narrative preserves every character across valid Discord fields, including a split emoji boundary", () => {
  const content = "a".repeat(1023) + "😀" + "z".repeat(2975);
  assert.equal(content.length, 4000);
  const report = json({ ...sample(), content });
  const narrative = report.fields.slice(4);
  assert.equal(narrative.length, 4);
  assert.equal(narrative.map(field => field.value).join(""), content);
  for (const field of narrative) {
    assert.ok(field.value.length <= 1024);
    assert.doesNotMatch(field.value, /[\uD800-\uDBFF]$/);
    assert.doesNotMatch(field.value, /^[\uDC00-\uDFFF]/);
  }
});

test("rendering uses known primitive fields and stays within Discord's total embed limit", () => {
  const hidden = "DO_NOT_RENDER_PRIVATE_SENTINEL";
  const report = json({ author: { toString() { throw new Error("must not coerce objects"); } }, authorId: "invalid",
    date: "d".repeat(1000), hours: "h".repeat(1000), place: "p".repeat(5000), serviceType: "t".repeat(5000),
    content: "c".repeat(10000), token: hidden, password: hidden, nested: { secret: hidden } });
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes(hidden));
  for (const field of report.fields) {
    assert.ok(field.name.length <= 256);
    assert.ok(field.value.length >= 1 && field.value.length <= 1024);
  }
  const total = [report.title, report.description, report.footer.text, ...report.fields.flatMap(field => [field.name, field.value])]
    .reduce((sum, value) => sum + value.length, 0);
  assert.ok(total <= 6000);
});

test("native Discord report submission uses the same message builder and preserves structured journal data", async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-native-report-"));
  const originalEnv = Object.fromEntries(["SW_DATA_DIR", "MANAGEMENT_DATA_DIR", "REPORT_CHANNEL_ID"].map(key => [key, process.env[key]]));
  process.env.SW_DATA_DIR = dataDir;
  process.env.MANAGEMENT_DATA_DIR = dataDir;
  process.env.REPORT_CHANNEL_ID = "100000000000000322";
  const management = require("../services/management");
  const previousRecord = management.recordDiscord;
  t.after(() => {
    management.recordDiscord = previousRecord;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  let sent, saved, reply;
  management.recordDiscord = (resource, record) => { saved = { resource, record }; };
  const client = new EventEmitter();
  const { registerRaportModule } = require("../modules/raport");
  registerRaportModule(client);
  const channel = { id: process.env.REPORT_CHANNEL_ID, async send(payload) { sent = payload; return { id: "100000000000000323" }; } };
  const values = { data_sluzby: "22.08.2026", godziny: "20:00", miejsce: "Sąd Okręgowy w Warszawie", rodzaj: "Konwój", przebieg: sample().content };
  const interaction = {
    isChatInputCommand: () => false, isButton: () => false, isModalSubmit: () => true,
    customId: "formularz_raportu", user: { id: ID, toString: () => `<@${ID}>` },
    fields: { getTextInputValue: key => values[key] }, guild: { channels: { cache: new Map([[channel.id, channel]]) } },
    async deferReply() {}, async editReply(payload) { reply = payload; },
  };
  for (const listener of client.listeners("interactionCreate")) await listener(interaction);
  assert.equal(saved.resource, "reports");
  assert.equal(saved.record.authorId, ID);
  assert.equal(saved.record.serviceType, "Konwój");
  assert.equal(saved.record.title, "Konwój");
  assert.equal(saved.record.date, "22.08.2026");
  assert.equal(saved.record.hours, "20:00");
  assert.equal(saved.record.place, "Sąd Okręgowy w Warszawie");
  assert.equal(saved.record.content, sample().content);
  assert.equal(saved.record.discordMessageId, "100000000000000323");
  assert.equal(sent.embeds[0].toJSON().title, "📋 NOWY RAPORT SŁUŻBOWY");
  assert.equal(sent.embeds[0].toJSON().fields[3].value, "Konwój");
  assert.deepEqual(sent.allowedMentions, { parse: [] });
  assert.match(reply.content, /Raport został wysłany/);
});
