"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { once, EventEmitter } = require("node:events");
const { Collection } = require("discord.js");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sw-passes-workflow-"));
const databaseFile = path.join(directory, "osadzeni.json");
const journalFile = path.join(directory, "panel-records.json");
const password = "Fixture formal pass workflow password!";
const guildId = "100000000000000801";
const prisonerChannelId = "100000000000000802";
const passChannelId = "100000000000000803";
const prisonerInput = { imie: "Testowy Osadzony", paragraf: "Art. 1", wyrok: "30 minut", cela: "A1", poczatek: "12:00", koniec: "12:30", paused: true };
const seedPrisoner = (id, przepustka) => ({ ...prisonerInput, id, przepustka, remainingSeconds: 900,
  czasKaryMinuty: 30, czasZWyrokuMinuty: 30, timerStartedAt: "2026-01-01T12:00:00.000Z" });
const oldPass = (id, status) => ({ id, osadzonyId: "O-001", osadzony: "Testowy Osadzony", od: "09:00", do: "10:00", powod: "Starszy wniosek", miejsce: "Miejsce testowe", status,
  zlozyl: "100000000000000804", utworzono: "2026-01-01T08:00:00.000Z" });
fs.writeFileSync(databaseFile, JSON.stringify({ nextId: 3,
  osadzeni: [seedPrisoner("O-001", false), seedPrisoner("O-002", true)],
  przepustki: [oldPass("P-001", "zatwierdzona"), oldPass("P-010", "oczekuje")],
}), { mode: 0o600 });
const journal = Object.fromEntries(["members", "prisoners", "ranks", "reports", "calls", "documents", "proposals", "payouts", "audit"].map(name => [name, []]));
journal.reports.push({ id: "legacy-report", title: "Zachowany raport", content: "Treść sprzed migracji" });
fs.writeFileSync(journalFile, JSON.stringify(journal), { mode: 0o600 });
process.env.SW_DATA_DIR = directory;
process.env.MANAGEMENT_DATA_DIR = directory;
process.env.PANEL_DATA_DIR = directory;
process.env.GUILD_ID = guildId;
process.env.PRISONERS_CHANNEL_ID = prisonerChannelId;
process.env.PASSES_CHANNEL_ID = passChannelId;
process.env.OFFLINE = "1";
delete process.env.TOKEN;
delete process.env.PANEL_PUBLIC_ORIGIN;

const client = new EventEmitter();
client.ready = true;
client.isReady = () => client.ready;
client.user = { id: "100000000000000805", tag: "PassFixture#0001" };
const writes = [], messages = new Map();
let nextMessage = 100000000000000820n;
const guild = { id: guildId, channels: { cache: new Collection() } };
function channel(id, name) {
  const item = { id, name, guild, guildId, type: 0, isTextBased: () => true,
    permissionsFor: () => ({ has: () => true }),
    messages: { async fetch(messageId) {
      if (!messages.has(messageId)) throw Object.assign(new Error("Unknown fixture message"), { code: 10008 });
      return messages.get(messageId);
    } },
    async send(payload) {
      const messageId = String(nextMessage++);
      const message = { id: messageId, channelId: id, latest: payload,
        async edit(update) { message.latest = update; writes.push({ method: "edit", channelId: id, id: messageId, payload: update }); return message; } };
      messages.set(messageId, message);
      writes.push({ method: "send", channelId: id, id: messageId, payload });
      return message;
    },
  };
  guild.channels.cache.set(id, item);
  return item;
}
channel(prisonerChannelId, "📍・osadzeni");
channel(passChannelId, "🎫・przepustki");
guild.channels.fetch = async id => id ? guild.channels.cache.get(id) : guild.channels.cache;
client.guilds = { cache: new Collection([[guildId, guild]]) };
client.channels = { fetch: async id => guild.channels.cache.get(id) };

// Import only the real resource and HTTP layers: never index, .env, or Discord login.
const management = require("../services/management");
const prisonerModule = require("../osadzeni");
const { createPanelServer } = require("../panel/server");
const { createAuthStore } = require("../panel/auth-store");
let bridge, panel, operatorPassId;
const cookies = {};
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const pass = id => read(databaseFile).przepustki.find(item => item.id === id);
const prisoner = id => read(databaseFile).osadzeni.find(item => item.id === id);
const json = value => value?.toJSON?.() || value;
const buttons = payload => (payload.components || []).flatMap(row => json(row).components || []);
const nativeUser = { id: "100000000000000806", toString() { return `<@${this.id}>`; } };
const requestBody = (extra = {}) => ({ osadzonyId: "O-001", od: "12:00", do: "13:00", powod: "Wniosek panelowy", miejsce: "Miejsce testowe", ...extra });

function request(server, route, { method = "GET", body, cookie, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const allHeaders = { "Content-Type": "application/json", ...headers };
    if (method !== "GET") allHeaders.Origin = `http://127.0.0.1:${server.address().port}`;
    if (cookie) allHeaders.Cookie = cookie;
    if (payload !== undefined) allHeaders["Content-Length"] = Buffer.byteLength(payload);
    const req = http.request({ host: "127.0.0.1", port: server.address().port, path: route, method, headers: allHeaders }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, data: JSON.parse(Buffer.concat(chunks).toString("utf8")), headers: response.headers }));
    });
    req.on("error", reject); req.end(payload);
  });
}
const api = (role, method, route, body, headers) => request(panel, route, { method, body, cookie: cookies[role], headers });
async function state() { const result = await api("viewer", "GET", "/api/state"); assert.equal(result.status, 200); return result.data; }
async function submit(extra, role = "operator") {
  const result = await api(role, "POST", "/api/passes", requestBody(extra));
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result;
}
function nativeInteraction({ commandName, customId, values = {}, permission = true, message } = {}) {
  const replies = [];
  const interaction = { commandName, customId, message, guild, guildId, user: nativeUser, replies,
    memberPermissions: { has: () => permission }, member: { roles: { cache: new Collection() } },
    options: { getString: key => values[key] ?? null },
    isChatInputCommand: () => Boolean(commandName), isButton: () => Boolean(customId), isModalSubmit: () => false,
    async reply(payload) { interaction.replied = true; replies.push(payload); },
    async deferReply() { interaction.deferred = true; }, async deferUpdate() { interaction.deferred = true; },
    async followUp(payload) { replies.push(payload); },
    async editReply(payload) { replies.push(payload); if (message) await message.edit(payload); },
    async update(payload) { interaction.replied = true; replies.push(payload); if (message) await message.edit(payload); },
  };
  return interaction;
}
async function dispatch(interaction) { for (const handler of client.listeners("interactionCreate")) await handler(interaction); return interaction; }
async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!await predicate()) { if (Date.now() > deadline) assert.fail("Fixture notification worker did not finish"); await new Promise(resolve => setTimeout(resolve, 5)); }
}

before(async () => {
  const auth = createAuthStore({ dataDir: directory });
  auth.upsertAdmin({ username: "pass.owner", password });
  auth.createUser({ username: "pass.operator", password, role: "operator" });
  auth.createUser({ username: "pass.viewer", password, role: "viewer" });
  prisonerModule.registerOsadzeniModule(client);
  bridge = await management.startManagement({ client, port: 0 });
  panel = createPanelServer({ dataDir: directory, bridgeDir: directory, bridgePort: bridge.address().port });
  panel.listen(0, "127.0.0.1"); await once(panel, "listening");
  for (const [role, username] of [["admin", "pass.owner"], ["operator", "pass.operator"], ["viewer", "pass.viewer"]]) {
    const login = await request(panel, "/api/login", { method: "POST", body: { username, password } });
    assert.equal(login.status, 200);
    cookies[role] = login.headers["set-cookie"][0].split(";")[0];
  }
});
after(async () => {
  if (panel) await new Promise(resolve => panel.close(resolve));
  prisonerModule.stopTimers(); await management.stop(); client.removeAllListeners();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("legacy journals and canonical native pass records remain visible after migration", async () => {
  const snapshot = await state();
  assert.deepEqual(snapshot.collections.passes.map(item => item.id).sort(), ["P-001", "P-010"]);
  assert.equal(snapshot.collections.reports.find(item => item.id === "legacy-report").content, "Treść sprzed migracji");
  assert.equal(pass("P-001").status, "zatwierdzona");
  assert.equal(prisoner("O-001").remainingSeconds, 900);
});

test("operator submissions use one shared monotonic identity and a native actionable Discord card", async () => {
  const created = await api("operator", "POST", "/api/passes", requestBody(), { "X-Panel-Role": "admin", "X-Panel-User": "spoofed.owner" });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  operatorPassId = created.data.record.id;
  assert.equal(operatorPassId, "P-011");
  assert.equal(created.data.record.status, "oczekuje");
  assert.equal(created.data.record.zlozyl, "pass.operator");
  assert.ok(Number.isFinite(Date.parse(created.data.record.utworzono)));
  assert.equal(created.data.notification.resource, "passes");
  assert.equal(created.data.notification.status, "sent");
  const stored = pass(operatorPassId);
  assert.equal(stored.osadzony, "Testowy Osadzony");
  const message = messages.get(stored.messageId);
  assert.ok(message);
  assert.deepEqual(buttons(message.latest).map(item => item.custom_id), [`przepustka_zgoda_${operatorPassId}`, `przepustka_odmowa_${operatorPassId}`]);
  assert.deepEqual(message.latest.allowedMentions, { parse: [] });
  assert.equal(prisoner("O-001").przepustka, false, "A request alone must not grant a pass");
  assert.equal((await state()).collections.reports.find(item => item.id === "legacy-report").title, "Zachowany raport");
});

test("invalid requests and unauthorized decisions cannot alter requests or grant a pass", async () => {
  const invalid = [requestBody({ osadzonyId: "O-missing" }), requestBody({ od: "25:00" }), requestBody({ do: "12:00" }),
    requestBody({ powod: "" }), requestBody({ miejsce: "x".repeat(201) }), requestBody({ powod: "x".repeat(1001) }),
    requestBody({ status: "zatwierdzona" }), requestBody({ zlozyl: "spoofed.owner" }), requestBody({ messageId: "100000000000000999" })];
  for (const body of invalid) {
    const before = [databaseFile, journalFile].map(file => fs.readFileSync(file, "utf8"));
    const count = writes.length;
    const result = await api("operator", "POST", "/api/passes", body);
    assert.ok([400, 404].includes(result.status), JSON.stringify(result.data));
    assert.deepEqual([databaseFile, journalFile].map(file => fs.readFileSync(file, "utf8")), before);
    assert.equal(writes.length, count);
  }
  assert.equal((await api("viewer", "POST", "/api/passes", requestBody())).status, 403);
  for (const role of ["viewer", "operator"]) {
    const result = await api(role, "POST", `/api/passes/${operatorPassId}/decision`, { decision: "approve" }, { "X-Panel-Role": "admin" });
    assert.equal(result.status, 403);
  }
  assert.equal(pass(operatorPassId).status, "oczekuje");
  for (const method of ["PATCH", "DELETE"]) {
    assert.ok([404, 405].includes((await api("admin", method, `/api/passes/${operatorPassId}`, { status: "zatwierdzona" })).status));
  }
  for (const value of [true, false]) assert.equal((await api("operator", "PATCH", "/api/prisoners/O-001", { przepustka: value }, { "X-Panel-Role": "admin" })).status, 403);
  assert.equal((await api("operator", "POST", "/api/prisoners", { ...prisonerInput, przepustka: true })).status, 403);
  const ordinary = await api("operator", "POST", "/api/prisoners", { ...prisonerInput, przepustka: false });
  assert.equal(ordinary.status, 201);
  const manual = await api("admin", "PATCH", `/api/prisoners/${ordinary.data.record.id}`, { przepustka: true });
  assert.equal(manual.status, 200);
  assert.equal((await api("operator", "PATCH", `/api/prisoners/${ordinary.data.record.id}`, { cela: "B2" })).data.record.przepustka, true);
});

test("administrator approval updates the same card, preserves the timer, and cannot be repeated", async () => {
  const previous = prisoner("O-001");
  const decision = await api("admin", "POST", `/api/passes/${operatorPassId}/decision`, { decision: "approve" });
  assert.equal(decision.status, 200, JSON.stringify(decision.data));
  assert.equal(decision.data.record.status, "zatwierdzona");
  assert.equal(decision.data.record.rozpatrzyl, "pass.owner");
  assert.ok(Number.isFinite(Date.parse(decision.data.record.rozpatrzono)));
  assert.equal(prisoner("O-001").przepustka, true);
  for (const key of ["paused", "remainingSeconds", "timerStartedAt", "poczatek", "koniec"]) assert.equal(prisoner("O-001")[key], previous[key], key);
  const message = messages.get(pass(operatorPassId).messageId);
  assert.match(json(message.latest.embeds[0]).title, /PRZEPUSTKA ZATWIERDZONA/);
  assert.deepEqual(buttons(message.latest), []);
  const before = [databaseFile, journalFile].map(file => fs.readFileSync(file, "utf8"));
  const count = writes.length;
  assert.equal((await api("admin", "POST", `/api/passes/${operatorPassId}/decision`, { decision: "reject" })).status, 409);
  assert.deepEqual([databaseFile, journalFile].map(file => fs.readFileSync(file, "utf8")), before);
  assert.equal(writes.length, count);
});

test("rejection preserves another granted pass and pending lists exclude reviewed requests", async () => {
  const created = await submit({ osadzonyId: "O-002", od: "23:30", do: "00:15" });
  const decision = await api("admin", "POST", `/api/passes/${created.data.record.id}/decision`, { decision: "reject" });
  assert.equal(decision.status, 200);
  assert.equal(decision.data.record.status, "odrzucona");
  assert.equal(prisoner("O-002").przepustka, true);
  const listed = await dispatch(nativeInteraction({ commandName: "przepustki" }));
  const output = JSON.stringify(listed.replies);
  assert.match(output, /P-010/);
  assert.ok(!output.includes(operatorPassId));
  assert.ok(!output.includes(created.data.record.id));
});

test("native submissions and panel/native decisions share the canonical requests without competing outcomes", async () => {
  const submitted = await dispatch(nativeInteraction({ commandName: "przepustka", values: { id: "O-001", od: "16:00", do: "17:00", powod: "Wniosek z Discorda", miejsce: "Miejsce z Discorda" } }));
  assert.ok(submitted.replies.length);
  const native = read(databaseFile).przepustki.find(item => item.powod === "Wniosek z Discorda");
  assert.ok(native);
  assert.equal(native.zlozyl, nativeUser.id);
  assert.ok(Number(native.id.slice(2)) > 11);
  assert.ok((await state()).collections.passes.some(item => item.id === native.id));
  assert.equal((await api("admin", "POST", `/api/passes/${native.id}/decision`, { decision: "approve" })).status, 200);
  assert.deepEqual(buttons(messages.get(pass(native.id).messageId).latest), []);
  const created = await submit({ powod: "Wniosek do równoczesnej decyzji" });
  const id = created.data.record.id;
  const message = messages.get(pass(id).messageId);
  const beforeAudit = read(journalFile).audit.filter(item => item.resource === "passes" && item.recordId === id).length;
  const nativeDecision = nativeInteraction({ customId: `przepustka_odmowa_${id}`, message });
  const [panelDecision] = await Promise.all([
    api("admin", "POST", `/api/passes/${id}/decision`, { decision: "approve" }),
    dispatch(nativeDecision),
  ]);
  assert.ok([200, 409].includes(panelDecision.status));
  assert.ok(["zatwierdzona", "odrzucona"].includes(pass(id).status));
  assert.equal(read(journalFile).audit.filter(item => item.resource === "passes" && item.recordId === id).length, beforeAudit + 1);
  assert.deepEqual(buttons(message.latest), []);
  const ids = read(databaseFile).przepustki.map(item => item.id);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(read(databaseFile).nextPassId > Math.max(...ids.map(value => Number(value.slice(2)))));
});

test("native acknowledgement precedes mutation and a delayed loser cannot overwrite the panel decision", async () => {
  const created = await submit({ powod: "Decyzja podczas oczekiwania na potwierdzenie Discorda" });
  const id = created.data.record.id;
  const message = messages.get(pass(id).messageId);
  let acknowledged = false, releaseAcknowledgement;
  const acknowledgement = new Promise(resolve => { releaseAcknowledgement = resolve; });
  const nativeDecision = nativeInteraction({ customId: `przepustka_odmowa_${id}`, message });
  const followUps = [];
  let edits = 0, updates = 0;
  nativeDecision.deferUpdate = async () => { acknowledged = true; await acknowledgement; nativeDecision.deferred = true; };
  nativeDecision.followUp = async payload => { followUps.push(payload); };
  nativeDecision.editReply = async payload => { edits++; await message.edit(payload); };
  nativeDecision.update = async payload => { updates++; await message.edit(payload); };
  const nativeTask = dispatch(nativeDecision);
  try {
    await until(() => acknowledged);
    assert.equal(pass(id).status, "oczekuje", "The native interaction must be acknowledged before persisting a decision.");
    assert.equal(pass(id).rozpatrzyl, undefined);
    const approved = await api("admin", "POST", `/api/passes/${id}/decision`, { decision: "approve" });
    assert.equal(approved.status, 200);
    const winnerCard = JSON.stringify(message.latest);
    const winnerAudit = read(journalFile).audit.filter(item => item.resource === "passes" && item.recordId === id).length;
    releaseAcknowledgement();
    await nativeTask;
    assert.equal(pass(id).status, "zatwierdzona");
    assert.equal(pass(id).rozpatrzyl, "pass.owner");
    assert.equal(edits, 0);
    assert.equal(updates, 0);
    assert.equal(JSON.stringify(message.latest), winnerCard);
    assert.equal(followUps.length, 1);
    assert.equal(followUps[0].ephemeral, true);
    assert.match(followUps[0].content, /już rozpatrzony/);
    assert.equal(read(journalFile).audit.filter(item => item.resource === "passes" && item.recordId === id).length, winnerAudit);
  } finally { releaseAcknowledgement(); await nativeTask; }
});

test("offline submission and approval retain one reviewed request card when Discord reconnects", async () => {
  client.ready = false;
  const created = await submit({ powod: "Wniosek offline" });
  const id = created.data.record.id;
  assert.equal(created.data.notification.status, "pending");
  const decision = await api("admin", "POST", `/api/passes/${id}/decision`, { decision: "approve" });
  assert.equal(decision.status, 200);
  assert.equal(decision.data.notification.status, "pending");
  assert.equal(pass(id).status, "zatwierdzona");
  const before = writes.length;
  client.ready = true; client.emit("shardResume", 0, 0);
  await until(async () => {
    const events = (await state()).notifications.filter(item => item.resource === "passes" && item.recordId === id);
    return events.length === 2 && events.every(item => item.status === "sent");
  });
  const message = messages.get(pass(id).messageId);
  assert.match(json(message.latest.embeds[0]).title, /PRZEPUSTKA ZATWIERDZONA/);
  assert.deepEqual(buttons(message.latest), []);
  assert.equal(writes.slice(before).filter(write => write.channelId === passChannelId && write.method === "send").length, 1);
  const snapshot = await state();
  assert.ok(snapshot.notifications.filter(item => item.resource === "passes" && item.recordId === id).every(item => item.status === "sent"));
});
