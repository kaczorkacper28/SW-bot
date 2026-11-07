"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { EventEmitter } = require("node:events");
const { Collection, EmbedBuilder } = require("discord.js");
const { createPrisonerNotifications } = require("../services/discord-notifications");

function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-notifications-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const records = new Map();
  const writes = [];
  const messages = new Map();
  const client = new EventEmitter();
  client.ready = true;
  client.isReady = () => client.ready;
  client.user = { id: "100000000000000001" };
  const guild = { id: "100000000000000002", channels: { cache: new Collection() } };
  const channel = {
    id: "100000000000000003", guildId: guild.id, guild, type: 0, name: "📍・osądzeni", isTextBased: () => true,
    permissionsFor: () => ({ has: () => true }),
    messages: { async fetch(id) {
      if (!messages.has(id)) throw Object.assign(new Error("Unknown message"), { code: 10008 });
      return messages.get(id);
    } },
    async send(payload) {
      writes.push({ method: "send", payload });
      if (channel.error) throw channel.error;
      const id = String(100000000000000010n + BigInt(messages.size));
      const message = { id, async edit(edit) { writes.push({ method: "edit", id, payload: edit }); return message; } };
      messages.set(id, message);
      return message;
    },
  };
  guild.channels.cache.set(channel.id, channel);
  client.guilds = { cache: new Collection([[guild.id, guild]]) };
  client.channels = { fetch: async id => guild.channels.cache.get(id) };
  const options = { client, dataDir, guildId: () => guild.id, channelId: () => "", responseWaitMs: 25,
    getRecord: id => records.get(id), saveReference: (id, ref) => { if (records.has(id)) Object.assign(records.get(id), ref); },
    buildCard: record => new EmbedBuilder().setTitle(`Karta ${record.id}`).setDescription(record.imie), buildButtons: () => ({ type: 1, components: [] }) };
  let queue = createPrisonerNotifications(options);
  t.after(() => queue.stop());
  const prisoner = (id = "O-001") => ({ id, imie: "Jan Testowy", cela: "4", paragraf: "Art. 1", poczatek: "12:00", koniec: "12:30" });
  return { dataDir, records, writes, messages, client, guild, channel, options, prisoner, get queue() { return queue; },
    async restart() { await queue.stop(); queue = createPrisonerNotifications(options); return queue; } };
}

test("offline create, edit and removal survive restart and share exactly one card", async t => {
  const f = fixture(t);
  f.client.ready = false;
  const record = f.prisoner();
  f.records.set(record.id, record);
  const created = await f.queue.enqueue("create", record, "operator-test");
  record.cela = "5";
  await f.queue.enqueue("update", record, "operator-test");
  f.records.delete(record.id);
  await f.queue.enqueue("remove", record, "admin-test");
  assert.equal(created.status, "pending");
  assert.equal(f.writes.length, 0);
  await f.restart();
  f.queue.start();
  f.client.ready = true;
  f.client.emit("ready");
  await new Promise(setImmediate);
  assert.deepEqual(f.queue.list().map(item => item.status), ["sent", "sent", "sent"]);
  assert.equal(f.writes.filter(item => item.method === "send").length, 3);
  assert.equal(f.writes.filter(item => item.method === "edit").length, 2);
  assert.equal(new Set(f.writes.filter(item => item.method === "edit").map(item => item.id)).size, 1);
  for (const write of f.writes) {
    assert.deepEqual(write.payload.allowedMentions, { parse: [] });
    if (write.method === "send") { assert.equal(write.payload.enforceNonce, true); assert.match(write.payload.nonce, /^[a-f0-9]{25}$/); }
  }
  assert.equal(new Set(f.writes.filter(item => item.method === "send").map(item => item.payload.nonce)).size, 3);
  f.client.emit("shardResume", 0, 2);
  await new Promise(setImmediate);
  assert.equal(f.writes.filter(item => item.method === "send").length, 3);
  assert.deepEqual(f.writes.filter(item => item.method === "edit").at(-1).payload.components, []);
  const saved = JSON.parse(fs.readFileSync(path.join(f.dataDir, "prisoner-notifications.json")));
  assert.ok(saved.refs[record.id].messageId);
});

test("definitive notice failure can be retried without repeating a completed card edit", async t => {
  const f = fixture(t);
  const record = f.prisoner();
  f.records.set(record.id, record);
  await f.queue.enqueue("create", record, "creator");
  f.channel.error = Object.assign(new Error("Missing permissions"), { status: 403, code: 50013 });
  const failed = await f.queue.enqueue("update", record, "editor");
  assert.equal(failed.status, "failed");
  assert.equal(failed.canRetry, true);
  assert.equal(f.writes.filter(item => item.method === "edit").length, 1);
  f.messages.delete(record.messageId); // Completed card step must not be replayed.
  delete f.channel.error;
  assert.equal((await f.queue.retry(failed.id)).status, "sent");
  assert.equal(f.writes.filter(item => item.method === "edit").length, 1);
  assert.equal(f.writes.filter(item => item.method === "send").length, 3); // card, rejected notice, accepted notice
});

test("a slow Discord request returns saved/pending promptly and later completes in the background", async t => {
  const f = fixture(t);
  const record = f.prisoner();
  f.records.set(record.id, record);
  const send = f.channel.send;
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  f.channel.send = async payload => { await blocked; return send(payload); };
  const result = await f.queue.enqueue("create", record, "operator");
  assert.equal(result.status, "pending");
  assert.equal(result.canRetry, false);
  assert.match(result.message, /jest wysyłane/);
  assert.equal(f.writes.length, 0);
  release();
  await new Promise(setImmediate);
  assert.equal(f.queue.list()[0].status, "sent");
  assert.equal(f.writes.length, 1);
});

test("an unconfirmed message identifier is uncertain and cannot be resent", async t => {
  const f = fixture(t);
  const record = f.prisoner();
  f.records.set(record.id, record);
  f.channel.send = async () => ({});
  const result = await f.queue.enqueue("create", record, "operator");
  assert.equal(result.status, "failed");
  assert.equal(result.canRetry, false);
  await assert.rejects(f.queue.retry(result.id), { status: 409 });
});

test("work waiting behind a timer lock remains pending if Discord disconnects", async t => {
  const f = fixture(t);
  const record = f.prisoner();
  f.records.set(record.id, record);
  let release;
  const lock = f.queue.withRecordLock(record.id, () => new Promise(resolve => { release = resolve; }));
  const enqueued = f.queue.enqueue("create", record, "operator");
  await new Promise(setImmediate);
  f.client.ready = false;
  release();
  await lock;
  assert.equal((await enqueued).status, "pending");
  assert.equal(f.writes.length, 0);
});

test("ambiguous send stays blocked across restart and blocks later card creation", async t => {
  const f = fixture(t);
  const record = f.prisoner();
  f.records.set(record.id, record);
  f.channel.error = Object.assign(new Error("Connection lost after send"), { code: "ECONNRESET" });
  const failed = await f.queue.enqueue("create", record, "creator");
  assert.equal(failed.status, "failed");
  assert.equal(failed.canRetry, false);
  delete f.channel.error;
  await f.restart();
  const waiting = await f.queue.enqueue("update", record, "editor");
  assert.equal(waiting.status, "pending");
  assert.match(waiting.message, /wcześniejszej/);
  await assert.rejects(f.queue.retry(failed.id), { status: 409 });
  assert.equal(f.writes.length, 1);
});

test("crash after a checkpointed card resumes only missing notice; interrupted send is uncertain", async t => {
  const f = fixture(t);
  const record = f.prisoner();
  f.records.set(record.id, record);
  f.client.ready = false;
  const event = await f.queue.enqueue("update", record, "operator");
  const file = path.join(f.dataDir, "prisoner-notifications.json");
  const saved = JSON.parse(fs.readFileSync(file));
  const existing = await f.channel.send({});
  saved.events[0].state = "sending";
  saved.events[0].steps["card-create"] = { state: "sent", result: { channelId: f.channel.id, messageId: existing.id } };
  fs.writeFileSync(file, JSON.stringify(saved));
  await f.restart();
  f.client.ready = true;
  assert.equal((await f.queue.retry(event.id)).status, "sent");
  assert.equal(f.writes.filter(item => item.method === "send").length, 2);
  assert.equal(record.messageId, existing.id);
  const interrupted = JSON.parse(fs.readFileSync(file));
  interrupted.events[0].state = "sending";
  interrupted.events[0].steps.notice = { state: "sending" };
  fs.writeFileSync(file, JSON.stringify(interrupted));
  await f.restart();
  await assert.rejects(f.queue.retry(event.id), { status: 409 });
  assert.equal(f.writes.length, 2);
});

test("foreign guild and missing permission cannot publish; concurrent retry sends one card", async t => {
  const f = fixture(t);
  const record = f.prisoner();
  f.records.set(record.id, record);
  f.channel.guildId = "100000000000000099";
  const failed = await f.queue.enqueue("create", record, "operator");
  assert.equal(failed.status, "failed");
  assert.equal(f.writes.length, 0);
  f.channel.guildId = f.guild.id;
  f.channel.permissionsFor = () => ({ has: () => false });
  assert.equal((await f.queue.retry(failed.id)).status, "failed");
  assert.equal(f.writes.length, 0);
  f.channel.permissionsFor = () => ({ has: () => true });
  const results = await Promise.allSettled([f.queue.retry(failed.id), f.queue.retry(failed.id)]);
  assert.ok(results.some(result => result.status === "fulfilled" && result.value.status === "sent"));
  assert.equal(f.writes.length, 1);
});

test("restart reconciles a persisted card reference with the bot's live timer data", async t => {
  const f = fixture(t);
  const record = f.prisoner();
  f.records.set(record.id, record);
  f.client.ready = false;
  const event = await f.queue.enqueue("create", record, "operator");
  const message = await f.channel.send({});
  const file = path.join(f.dataDir, "prisoner-notifications.json");
  const saved = JSON.parse(fs.readFileSync(file));
  const ref = { channelId: f.channel.id, messageId: message.id };
  saved.events[0].state = "sending";
  saved.events[0].steps["card-create"] = { state: "sent", result: ref };
  saved.refs[record.id] = ref; // Crash occurred before osadzeni.json was updated.
  fs.writeFileSync(file, JSON.stringify(saved));
  await f.restart();
  f.client.ready = true;
  assert.equal((await f.queue.retry(event.id)).status, "sent");
  assert.equal(record.messageId, message.id);
  assert.equal(record.channelId, f.channel.id);
  assert.equal(f.writes.length, 1);
});

test("shard resume automatically flushes offline work and a deleted card is safely replaced", async t => {
  const f = fixture(t);
  const record = f.prisoner();
  f.records.set(record.id, record);
  f.queue.start();
  f.client.ready = false;
  await f.queue.enqueue("create", record, "operator");
  f.client.ready = true;
  f.client.emit("shardResume", 0, 2);
  await new Promise(setImmediate);
  assert.equal(f.queue.list()[0].status, "sent");
  const oldId = record.messageId;
  f.messages.delete(oldId);
  assert.equal((await f.queue.enqueue("update", record, "operator")).status, "sent");
  assert.ok(record.messageId);
  assert.equal(f.writes.filter(item => item.method === "send").length, 3); // original, replacement, change notice
});

test("invalid outbox is rejected without replacing its bytes", t => {
  const f = fixture(t);
  const file = path.join(f.dataDir, "prisoner-notifications.json");
  const corrupt = '{"version":1,"events":[{}],"refs":{}}';
  fs.writeFileSync(file, corrupt);
  assert.throws(() => createPrisonerNotifications(f.options), /struktur/);
  assert.equal(fs.readFileSync(file, "utf8"), corrupt);
  const arraySteps = JSON.stringify({ version: 1, refs: {}, events: [{ id: "x", recordId: "O-001", action: "create", state: "pending", snapshot: {}, steps: [] }] });
  fs.writeFileSync(file, arraySteps);
  assert.throws(() => createPrisonerNotifications(f.options), /struktur/);
  assert.equal(fs.readFileSync(file, "utf8"), arraySteps);
});

test("real prisoner API saves shared bot data, reports Discord results and never queues slash replies", async t => {
  const f = fixture(t);
  process.env.SW_DATA_DIR = f.dataDir;
  process.env.MANAGEMENT_DATA_DIR = f.dataDir;
  process.env.GUILD_ID = f.guild.id;
  delete process.env.PRISONERS_CHANNEL_ID;
  const management = require("../services/management");
  const osadzeni = require("../osadzeni");
  osadzeni.registerOsadzeniModule(f.client);
  const server = await management.startManagement({ client: f.client, port: 0 });
  t.after(async () => { osadzeni.stopTimers(); await management.stop(); });
  const key = fs.readFileSync(path.join(f.dataDir, "panel-bridge.key"), "utf8").trim();
  const request = (method, route, body) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: server.address().port, path: route, method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Panel-User": "test-operator" } }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, data: JSON.parse(Buffer.concat(chunks)) }));
    });
    req.on("error", reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const values = { imie: "Bot Osadzony", paragraf: "Art. 1", wyrok: "30 min", cela: "1", poczatek: "12:00", koniec: "12:30" };
  await f.client.listeners("interactionCreate")[0]({
    commandName: "osadzony-dodaj", isChatInputCommand: () => true, isButton: () => false, isModalSubmit: () => false,
    member: { permissions: { has: () => true }, roles: { cache: new Collection() } }, user: { id: "100000000000000004" },
    guild: f.guild, options: { getString: key => values[key] }, reply: async () => {},
    fetchReply: async () => ({ id: "100000000000000005", channelId: f.channel.id }),
  });
  assert.deepEqual((await request("GET", "/api/notifications")).data.notifications, []);
  const created = await request("POST", "/api/prisoners", { ...values, imie: "Panel Osadzony", uwagi: "x".repeat(2000) });
  assert.equal(created.status, 201);
  assert.equal(created.data.notification.status, "sent");
  assert.equal(created.data.notification.actor, "test-operator");
  const id = created.data.record.id;
  const database = () => JSON.parse(fs.readFileSync(path.join(f.dataDir, "osadzeni.json")));
  assert.ok(database().osadzeni.find(item => item.id === id).messageId);
  assert.equal(database().osadzeni.find(item => item.id === id).dodanyPrzez, "test-operator");
  const card = f.writes[0].payload.embeds[0].toJSON();
  assert.equal(card.fields.find(field => field.name.includes("Uwagi")).value.length, 1024);
  assert.equal(card.fields.find(field => field.name === "Dodano przez").value, "test-operator");
  assert.equal((await request("PATCH", `/api/prisoners/${id}`, { cela: "8" })).data.notification.status, "sent");
  assert.equal(database().osadzeni.find(item => item.id === id).cela, "8");
  f.channel.permissionsFor = () => ({ has: () => false });
  const removed = await request("DELETE", `/api/prisoners/${id}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.data.ok, true);
  assert.equal(removed.data.record.id, id);
  assert.equal(removed.data.notification.status, "failed");
  assert.equal(database().osadzeni.some(item => item.id === id), false);
  f.channel.permissionsFor = () => ({ has: () => true });
  const retried = await request("POST", `/api/notifications/${removed.data.notification.id}/retry`, {});
  assert.equal(retried.data.notification.status, "sent");
  assert.equal((await request("GET", "/api/state")).data.notifications.length, 3);
  const send = f.channel.send;
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  f.channel.send = async payload => { await blocked; return send(payload); };
  const waiting = await request("POST", "/api/prisoners", { ...values, imie: "Wolny Discord" });
  assert.equal(waiting.status, 201);
  assert.equal(waiting.data.notification.status, "pending");
  assert.ok(database().osadzeni.find(item => item.id === waiting.data.record.id));
  release();
  await new Promise(setImmediate);
  assert.equal((await request("GET", "/api/notifications")).data.notifications[0].status, "sent");
  const storage = require("../services/storage");
  const writeJson = storage.writeJson;
  const originalError = console.error;
  try {
    storage.writeJson = (filename, value) => {
      if (filename.endsWith("prisoner-notifications.json")) throw new Error("Simulated outbox disk failure");
      return writeJson(filename, value);
    };
    console.error = () => {};
    const saved = await request("POST", "/api/prisoners", { ...values, imie: "Zapis pomimo błędu kolejki" });
    assert.equal(saved.status, 201);
    assert.equal(saved.data.notification.status, "failed");
    assert.ok(database().osadzeni.find(item => item.id === saved.data.record.id));
  } finally { storage.writeJson = writeJson; console.error = originalError; }
  assert.equal((await request("GET", "/api/notifications")).data.notifications.length, 4);
});
