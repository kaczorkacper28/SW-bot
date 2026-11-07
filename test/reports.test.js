"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { EventEmitter } = require("node:events");
const { Collection } = require("discord.js");

// Import only management after choosing fixture data. No checkout credentials,
// real Discord client, or external network connection is used by this suite.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-structured-reports-"));
const guildId = "100000000000000901";
const channelId = "100000000000000902";
const authorId = "100000000000000903";
process.env.SW_DATA_DIR = dataDir;
process.env.MANAGEMENT_DATA_DIR = dataDir;
process.env.GUILD_ID = guildId;
process.env.REPORT_CHANNEL_ID = channelId;
process.env.PANEL_REPORTS_CHANNEL_ID = channelId;
process.env.OFFLINE = "1";
delete process.env.TOKEN;
const management = require("../services/management");

const writes = [];
const client = new EventEmitter();
client.isReady = () => true;
client.user = { id: "100000000000000904", tag: "Fixture#0001" };
const guild = { id: guildId, channels: { cache: new Collection() } };
const channel = { id: channelId, guildId, guild, type: 0, name: "📜・raporty-służbowe",
  isTextBased: () => true, permissionsFor: () => ({ has: () => true }),
  async send(payload) {
    const value = JSON.parse(JSON.stringify(payload));
    writes.push(value);
    return { id: String(100000000000001000n + BigInt(writes.length)) };
  } };
guild.channels.cache.set(channelId, channel);
client.guilds = { cache: new Collection([[guildId, guild]]) };
client.channels = { fetch: async () => channel };
let server, bridgeKey;

before(async () => {
  server = await management.startManagement({ client, port: 0 });
  bridgeKey = fs.readFileSync(path.join(dataDir, "panel-bridge.key"), "utf8").trim();
});
after(async () => {
  await management.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function request(method, route, body) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const headers = { Authorization: `Bearer ${bridgeKey}`, "Content-Type": "application/json", "X-Panel-User": "report.operator" };
    if (payload !== undefined) headers["Content-Length"] = Buffer.byteLength(payload);
    const req = http.request({ hostname: "127.0.0.1", port: server.address().port, method, path: route, headers }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => {
        try { resolve({ status: response.statusCode, data: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); }
        catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    req.end(payload);
  });
}
function report(overrides = {}) {
  return { author: "Anna Testowa", authorId, date: "2026-08-22", hours: "20:00–22:30",
    place: "Sąd Okręgowy w Warszawie", serviceType: "Konwój", content: "Wykonano konwój do sądu i powrót do zakładu karnego bez incydentów.", ...overrides };
}
const create = body => request("POST", "/api/reports", body);
const publication = id => request("POST", "/api/actions/publish", { resource: "reports", id });
function stored(id) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, "panel-records.json"), "utf8")).reports.find(item => item.id === id);
}

// These cases exercise the stored domain fields rather than mirroring renderer code.
test("structured reports normalize dates, persist service data and retain it through partial edits", async () => {
  const created = await create(report({ title: "Stary ogólny tytuł" }));
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const item = created.data.record;
  assert.equal(item.title, "Konwój");
  assert.equal(item.serviceType, "Konwój");
  assert.equal(item.date, "22.08.2026");
  assert.equal(item.hours, "20:00–22:30");
  assert.equal(item.authorId, authorId);
  assert.equal(item.place, "Sąd Okręgowy w Warszawie");
  assert.equal(created.data.notification.status, "sent");
  assert.equal(item.discordMessageId, undefined, "A short automatic notice must not mark the full report as published");
  assert.equal(item.publishState, undefined);
  const changed = await request("PATCH", `/api/reports/${item.id}`, { serviceType: "Patrol", date: "23.08.2026" });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal(changed.data.record.title, "Patrol");
  assert.equal(changed.data.record.date, "23.08.2026");
  const statusOnly = await request("PATCH", `/api/reports/${item.id}`, { status: "zatwierdzony" });
  assert.equal(statusOnly.status, 200);
  const disk = stored(item.id);
  assert.equal(disk.serviceType, "Patrol");
  assert.equal(disk.title, "Patrol");
  assert.equal(disk.author, "Anna Testowa");
  assert.equal(disk.authorId, authorId);
  assert.equal(disk.hours, "20:00–22:30");
  assert.equal(disk.place, item.place);
  assert.equal(disk.content, item.content);
  assert.equal(disk.createdAt, item.createdAt);
  assert.equal(disk.status, "zatwierdzony");
  const state = await request("GET", "/api/state");
  assert.deepEqual(state.data.collections.reports.find(entry => entry.id === item.id), disk);
  const outbox = JSON.parse(fs.readFileSync(path.join(dataDir, "resource-notifications.json"), "utf8"));
  const snapshot = outbox.events.find(event => event.recordId === item.id && event.action === "create").snapshot;
  for (const key of ["authorId", "date", "hours", "place", "serviceType"]) assert.equal(snapshot[key], item[key], key);
});

test("report dates are real calendar dates, including leap years, and hours accept a time or a range", async () => {
  for (const date of ["31.02.2026", "29.02.2025", "2026-04-31", "2026-13-01", "22/08/2026", ""]) {
    const result = await create(report({ date }));
    assert.equal(result.status, 400, `${date}: ${JSON.stringify(result.data)}`);
  }
  for (const [date, expected, hours] of [["2024-02-29", "29.02.2024", "20:00"], ["29.02.2024", "29.02.2024", "08:00 - 10:30"]]) {
    const result = await create(report({ date, hours }));
    assert.equal(result.status, 201, JSON.stringify(result.data));
    assert.equal(result.data.record.date, expected);
    assert.equal(result.data.record.hours, hours);
  }
});

test("new structured reports reject missing data, invalid identities and oversized fields without queuing notices", async () => {
  const beforeWrites = writes.length;
  for (const key of ["authorId", "date", "hours", "place", "serviceType", "content"]) {
    const body = report();
    delete body[key];
    const result = await create(body);
    assert.equal(result.status, 400, `${key}: ${JSON.stringify(result.data)}`);
  }
  for (const author of ["not-an-id", "1000000000000009", "100000000000000000000", `<@${authorId}>`]) {
    assert.equal((await create(report({ authorId: author }))).status, 400, author);
  }
  for (const [key, value] of [["author", "x".repeat(101)], ["hours", "x".repeat(101)], ["place", "x".repeat(201)], ["serviceType", "x".repeat(101)], ["content", "x".repeat(4001)]]) {
    assert.equal((await create(report({ [key]: value }))).status, 400, key);
  }
  assert.equal(writes.length, beforeWrites);
  const noDisplayName = report();
  delete noDisplayName.author;
  const accepted = await create(noDisplayName);
  assert.equal(accepted.status, 201, "A valid Discord identity is sufficient even when a non-OAuth client has no display name");
});

test("invalid partial report updates leave the saved service data and notification history unchanged", async () => {
  const created = await create(report());
  assert.equal(created.status, 201);
  const id = created.data.record.id;
  const original = stored(id);
  const beforeWrites = writes.length;
  for (const patch of [{ date: "31.02.2026" }, { authorId: "not-an-id" }, { hours: "" }, { place: "" }, { serviceType: "" }, { content: "x".repeat(4001) }]) {
    const result = await request("PATCH", `/api/reports/${id}`, patch);
    assert.equal(result.status, 400, JSON.stringify(patch));
    assert.deepEqual(stored(id), original);
  }
  assert.equal(writes.length, beforeWrites);
});

test("legacy generic reports and native Discord journals remain editable without losing service data", async () => {
  const legacy = await create({ title: "Dawny raport", author: "Dawny autor", content: "Dawna treść" });
  assert.equal(legacy.status, 201);
  const legacyEdit = await request("PATCH", `/api/reports/${legacy.data.record.id}`, { content: "Uzupełniona dawna treść" });
  assert.equal(legacyEdit.status, 200);
  assert.equal(legacyEdit.data.record.title, "Dawny raport");
  assert.equal(legacyEdit.data.record.content, "Uzupełniona dawna treść");
  const legacyTitleOnly = await create({ title: "Zachowana zgodność API" });
  assert.equal(legacyTitleOnly.status, 201);
  const native = management.recordDiscord("reports", { id: "native-discord-report", authorId, author: `<@${authorId}>`, date: "22.08.2026", hours: "20:00", place: "Sąd", title: "Konwój", content: "Natywny raport", discordMessageId: "100000000000001199", status: "nowy" });
  const journalEdit = await request("PATCH", `/api/reports/${native.id}`, { status: "zatwierdzony" });
  assert.equal(journalEdit.status, 200);
  const saved = journalEdit.data.record;
  for (const key of ["authorId", "author", "date", "hours", "place", "title", "content", "discordMessageId", "createdAt"]) assert.equal(saved[key], native[key], key);
  assert.equal((await publication(native.id)).status, 409, "Already published native reports must not be republished from the panel");
});

test("full report publication matches the native green report and remains separate from the automatic change announcement", async () => {
  const created = await create(report());
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.record.id;
  assert.equal(created.data.notification.status, "sent");
  assert.equal(stored(id).discordMessageId, undefined);
  const beforeFull = writes.length;
  const results = await Promise.all([publication(id), publication(id)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(writes.length, beforeFull + 1, "Two publish requests must produce exactly one full report");
  const message = writes.at(-1);
  assert.deepEqual(message.allowedMentions, { parse: [] });
  assert.match(message.content, /Nowy raport służbowy/);
  const embed = message.embeds[0];
  assert.equal(embed.title, "📋 NOWY RAPORT SŁUŻBOWY");
  assert.equal(embed.color, 0x19a85b);
  assert.equal(embed.footer.text, "Służba Więzienna • System Raportów");
  const allText = JSON.stringify(message);
  assert.match(allText, /Funkcjonariusz/);
  assert.ok(allText.includes(authorId));
  for (const [label, value] of [["Data służby", "22.08.2026"], ["Godziny służby", "20:00–22:30"], ["Miejsce służby", "Sąd Okręgowy w Warszawie"], ["Rodzaj służby", "Konwój"], ["Przebieg służby", report().content]]) {
    const field = embed.fields.find(entry => entry.name.includes(label));
    assert.ok(field, label);
    assert.equal(field.value, value);
    assert.notEqual(field.inline, true, label);
  }
  assert.equal(stored(id).publishState, "published");
  assert.ok(stored(id).discordMessageId);
  assert.equal((await publication(id)).status, 409);
});

test("full report publication refuses a channel from a different guild without sending or marking the report", async () => {
  const created = await create(report());
  assert.equal(created.status, 201);
  const originalFetch = client.channels.fetch;
  const beforeWrites = writes.length;
  try {
    client.channels.fetch = async () => ({ ...channel, guildId: "100000000000001999" });
    const result = await publication(created.data.record.id);
    assert.equal(result.status, 503);
    assert.equal(writes.length, beforeWrites);
    assert.equal(stored(created.data.record.id).publishState, undefined);
  } finally { client.channels.fetch = originalFetch; }
});
