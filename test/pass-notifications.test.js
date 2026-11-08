"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { Collection } = require("discord.js");
const { createPassNotifications, resolvePassDestination } = require("../services/pass-notifications");
const { buildPassEmbed, buildPassButtons } = require("../services/pass-content");
const storage = require("../services/storage");

function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-pass-notifications-"));
  const records = new Map(), messages = new Map(), writes = [], refreshed = [];
  const client = new EventEmitter();
  client.ready = true; client.isReady = () => client.ready; client.user = { id: "100000000000000701" };
  const guild = { id: "100000000000000702", channels: { cache: new Collection() } };
  let nextMessage = 100000000000000710n;
  const makeMessage = id => ({ id, async edit(payload) {
    writes.push({ method: "edit", id, payload });
    if (channel.editError) throw channel.editError;
    return messages.get(id);
  } });
  const channel = { id: "100000000000000703", guildId: guild.id, guild, type: 0, name: "🎫・przepustki",
    isTextBased: () => true, permissionsFor: () => ({ has: () => true }),
    messages: { async fetch(id) {
      if (!messages.has(id)) throw Object.assign(new Error("Unknown message"), { code: 10008 });
      return messages.get(id);
    } },
    async send(payload) {
      writes.push({ method: "send", payload });
      if (channel.sendError) throw channel.sendError;
      if (channel.sendHook) return channel.sendHook(payload);
      const id = String(nextMessage++), message = makeMessage(id); messages.set(id, message); return message;
    },
  };
  guild.channels.cache.set(channel.id, channel);
  client.guilds = { cache: new Collection([[guild.id, guild]]) };
  const options = { client, dataDir, getRecord: id => records.get(id),
    saveReference(id, reference) { if (records.has(id)) Object.assign(records.get(id), reference); },
    buildCard: buildPassEmbed, buildButtons: buildPassButtons, refreshPrisoner: id => { refreshed.push(id); },
    guildId: () => guild.id, channelId: () => "", responseWaitMs: 20 };
  let queue = createPassNotifications(options);
  t.after(async () => { await queue.stop(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const pass = (id = "P-001") => ({ id, osadzonyId: "O-001", osadzony: "Jan Testowy", od: "12:00", do: "13:00",
    powod: "Wniosek testowy", miejsce: "Miejsce testowe", status: "oczekuje", zlozyl: "operator.test", utworzono: "2026-11-08T08:00:00Z" });
  return { dataDir, records, messages, writes, refreshed, client, guild, channel, options, pass, makeMessage,
    get queue() { return queue; },
    saved: () => JSON.parse(fs.readFileSync(path.join(dataDir, "pass-notifications.json"), "utf8")),
    async restart() { await queue.stop(); queue = createPassNotifications(options); } };
}
async function until(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) { if (Date.now() >= deadline) assert.fail("The pass fixture worker did not finish."); await new Promise(resolve => setTimeout(resolve, 5)); }
}

test("offline create and decision survive restart and publish one final reviewed card without stale buttons", async t => {
  const f = fixture(t); f.client.ready = false;
  const record = f.pass(); f.records.set(record.id, record);
  const created = await f.queue.enqueue("create", record, "operator.test");
  Object.assign(record, { status: "zatwierdzona", rozpatrzyl: "admin.test", rozpatrzono: "2026-11-08T08:01:00Z" });
  await f.queue.enqueue("update", record, "admin.test");
  assert.equal(created.resource, "passes"); assert.equal(created.status, "pending"); assert.equal(f.writes.length, 0);
  await f.restart(); f.queue.start(); f.client.ready = true; f.client.emit("ready");
  await until(() => f.queue.list().every(item => item.status === "sent"));
  assert.equal(f.writes.filter(item => item.method === "send").length, 1);
  assert.equal(f.writes.filter(item => item.method === "edit").length, 1);
  for (const write of f.writes) {
    assert.deepEqual(write.payload.components, []); assert.deepEqual(write.payload.allowedMentions, { parse: [] });
    assert.equal(write.payload.embeds[0].toJSON().title, "✅ PRZEPUSTKA ZATWIERDZONA");
  }
  const send = f.writes[0]; assert.equal(send.payload.enforceNonce, true); assert.match(send.payload.nonce, /^[a-f0-9]{25}$/);
  assert.ok(record.messageId); assert.equal(f.saved().refs[record.id].messageId, record.messageId);
  assert.deepEqual(f.refreshed, ["O-001", "O-001"]);
  f.client.emit("shardResume", 0, 0); await new Promise(setImmediate); assert.equal(f.writes.length, 2);
});

test("a panel request has native review buttons and a decision edits the same stored card", async t => {
  const f = fixture(t), record = f.pass(); f.records.set(record.id, record);
  assert.equal((await f.queue.enqueue("create", record, "operator")).status, "sent");
  const original = record.messageId;
  const buttons = f.writes[0].payload.components[0].toJSON().components;
  assert.deepEqual(buttons.map(item => item.custom_id), ["przepustka_zgoda_P-001", "przepustka_odmowa_P-001"]);
  Object.assign(record, { status: "odrzucona", rozpatrzyl: "reviewer" });
  assert.equal((await f.queue.enqueue("update", record, "reviewer")).status, "sent");
  assert.equal(f.writes.at(-1).id, original); assert.deepEqual(f.writes.at(-1).payload.components, []);
  assert.equal(f.writes.filter(item => item.method === "send").length, 1); assert.deepEqual(f.refreshed, []);
});

test("an offline request removed with its prisoner renders a cancelled card without actions", async t => {
  const f = fixture(t), record = f.pass(); f.records.set(record.id, record); f.client.ready = false;
  await f.queue.enqueue("create", record, "operator"); f.records.delete(record.id);
  f.queue.start(); f.client.ready = true; f.client.emit("shardResume", 0, 0);
  await until(() => f.queue.list()[0].status === "sent");
  assert.deepEqual(f.writes[0].payload.components, []);
  assert.match(f.writes[0].payload.embeds[0].toJSON().title, /ANULOWANA/);
  assert.equal(f.saved().events[0].snapshot.status, "oczekuje");
});

test("deletion during an in-flight send is reconciled to a cancelled card with one POST", async t => {
  const f = fixture(t), record = f.pass(); f.records.set(record.id, record);
  let finish;
  f.channel.sendHook = () => new Promise(resolve => { finish = resolve; });
  const pending = await f.queue.enqueue("create", record, "operator"); assert.equal(pending.status, "pending");
  f.records.delete(record.id);
  const message = f.makeMessage("100000000000000794"); f.messages.set(message.id, message);
  finish(message);
  await until(() => f.queue.list()[0].status === "sent");
  assert.equal(f.writes.filter(write => write.method === "send").length, 1);
  const corrected = f.writes.at(-1);
  assert.equal(corrected.method, "edit"); assert.deepEqual(corrected.payload.components, []);
  assert.match(corrected.payload.embeds[0].toJSON().title, /ANULOWANA/);
  const event = f.saved().events[0];
  assert.equal(event.steps["card-create"].result.renderedStatus, "oczekuje");
  assert.equal(event.steps["card-reconcile-0"].result.renderedStatus, "anulowana");
  assert.deepEqual(f.saved().refs[record.id], { channelId: f.channel.id, messageId: message.id });
  await f.restart(); f.queue.start(); await new Promise(setImmediate);
  assert.equal(f.writes.filter(write => write.method === "send").length, 1);
});

test("a decision during an in-flight edit is reconciled before the event reports sent", async t => {
  const f = fixture(t), record = f.pass(); f.records.set(record.id, record);
  await f.queue.enqueue("create", record, "operator");
  const message = f.messages.get(record.messageId), edit = message.edit;
  let finish, first = true;
  message.edit = async outgoing => {
    if (first) { first = false; await new Promise(resolve => { finish = resolve; }); }
    return edit.call(message, outgoing);
  };
  const pending = await f.queue.enqueue("update", record, "operator"); assert.equal(pending.status, "pending");
  record.status = "odrzucona"; finish();
  await until(() => f.queue.list().find(item => item.id === pending.id).status === "sent");
  assert.equal(f.writes.filter(write => write.method === "send").length, 1);
  assert.deepEqual(f.writes.at(-1).payload.components, []);
  assert.match(f.writes.at(-1).payload.embeds[0].toJSON().title, /ODRZUCONA/);
});

test("restart retains a checkpointed corrective edit without replaying the initial card or correction", async t => {
  const f = fixture(t), record = f.pass(); f.records.set(record.id, record); f.client.ready = false;
  const pending = await f.queue.enqueue("create", record, "operator"), saved = f.saved();
  const reference = { channelId: f.channel.id, messageId: "100000000000000793" };
  saved.events[0].state = "sending";
  saved.events[0].steps["card-create"] = { state: "sent", result: { ...reference, renderedStatus: "oczekuje" } };
  saved.events[0].steps["card-reconcile-0"] = { state: "sent", result: { ...reference, renderedStatus: "anulowana" } };
  fs.writeFileSync(path.join(f.dataDir, "pass-notifications.json"), JSON.stringify(saved));
  f.records.delete(record.id); await f.restart(); f.client.ready = true;
  assert.equal((await f.queue.retry(pending.id)).status, "sent");
  assert.equal(f.writes.length, 0); assert.deepEqual(f.saved().refs[record.id], reference);
});

test("an in-flight native card lock makes a queued decision reuse the native message reference", async t => {
  const f = fixture(t), record = f.pass(); f.records.set(record.id, record);
  let release;
  const native = f.queue.withRecordLock(record.id, () => new Promise(resolve => { release = resolve; }));
  await new Promise(setImmediate);
  record.status = "zatwierdzona";
  const pending = await f.queue.enqueue("update", record, "reviewer"); assert.equal(pending.status, "pending");
  record.channelId = f.channel.id; record.messageId = "100000000000000795";
  f.messages.set(record.messageId, f.makeMessage(record.messageId));
  release(); await native; await until(() => f.queue.list()[0].status === "sent");
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].method, "edit");
  assert.deepEqual(f.writes[0].payload.components, []);
});

test("existing native message references are edited and a definitively deleted card is replaced safely", async t => {
  const f = fixture(t), record = { ...f.pass(), channelId: f.channel.id, messageId: "100000000000000799" };
  f.records.set(record.id, record); f.messages.set(record.messageId, f.makeMessage(record.messageId));
  record.status = "zatwierdzona";
  assert.equal((await f.queue.enqueue("update", record, "reviewer")).status, "sent");
  assert.equal(f.writes[0].method, "edit"); assert.equal(f.writes.length, 1);
  f.messages.delete(record.messageId);
  assert.equal((await f.queue.enqueue("update", record, "reviewer")).status, "sent");
  assert.equal(f.writes.at(-1).method, "send"); assert.notEqual(record.messageId, "100000000000000799");
  assert.deepEqual(f.writes.at(-1).payload.components, []);
});

test("definitive failures retry the same nonce and concurrent retry cannot duplicate a request", async t => {
  const f = fixture(t), record = f.pass(); f.records.set(record.id, record);
  f.channel.sendError = Object.assign(new Error("Forbidden"), { status: 403, code: 50013 });
  const failed = await f.queue.enqueue("create", record, "operator"); assert.equal(failed.status, "failed"); assert.equal(failed.canRetry, true);
  delete f.channel.sendError;
  const results = await Promise.allSettled([f.queue.retry(failed.id), f.queue.retry(failed.id)]);
  assert.ok(results.some(result => result.status === "fulfilled" && result.value.status === "sent"));
  assert.equal(f.writes.length, 2); assert.equal(f.writes[0].payload.nonce, f.writes[1].payload.nonce);
});

test("an ambiguous POST blocks only its pass across restart and cannot be resent", async t => {
  const f = fixture(t), record = f.pass(); f.records.set(record.id, record);
  f.channel.sendError = Object.assign(new Error("Connection lost"), { code: "ECONNRESET" });
  const failed = await f.queue.enqueue("create", record, "operator"); assert.equal(failed.canRetry, false);
  delete f.channel.sendError; await f.restart();
  const waiting = await f.queue.enqueue("update", record, "reviewer"); assert.equal(waiting.status, "pending"); assert.equal(waiting.canRetry, false);
  await assert.rejects(f.queue.retry(failed.id), { status: 409 });
  const other = f.pass("P-002"); f.records.set(other.id, other);
  assert.equal((await f.queue.enqueue("create", other, "operator")).status, "sent");
  assert.equal(f.writes.length, 2);
});

test("missing Discord message confirmation is uncertain and a slow POST returns pending promptly", async t => {
  const f = fixture(t), first = f.pass(); f.records.set(first.id, first);
  f.channel.sendHook = async () => ({});
  const failed = await f.queue.enqueue("create", first, "operator"); assert.equal(failed.canRetry, false);
  await assert.rejects(f.queue.retry(failed.id), { status: 409 });
  const other = f.pass("P-002"); f.records.set(other.id, other);
  let finish; f.channel.sendHook = () => new Promise(resolve => { finish = resolve; });
  const pending = await f.queue.enqueue("create", other, "operator"); assert.equal(pending.status, "pending"); assert.equal(pending.canRetry, false);
  finish({ id: "100000000000000798" }); await until(() => f.queue.list().find(item => item.id === pending.id).status === "sent");
});

test("a durable completed card checkpoint repairs references after restart without another send", async t => {
  const f = fixture(t), record = f.pass(); f.records.set(record.id, record); f.client.ready = false;
  const result = await f.queue.enqueue("create", record, "operator");
  const saved = f.saved(), reference = { channelId: f.channel.id, messageId: "100000000000000797" };
  saved.events[0].state = "sending"; saved.events[0].steps["card-create"] = { state: "sent", result: reference };
  fs.writeFileSync(path.join(f.dataDir, "pass-notifications.json"), JSON.stringify(saved));
  await f.restart(); f.client.ready = true;
  assert.equal((await f.queue.retry(result.id)).status, "sent"); assert.equal(f.writes.length, 0);
  assert.equal(record.messageId, reference.messageId); assert.deepEqual(f.saved().refs[record.id], reference);
});

test("an interrupted send checkpoint stays uncertain and corrupt queues are preserved", async t => {
  const f = fixture(t), record = f.pass(); f.records.set(record.id, record); f.client.ready = false;
  const result = await f.queue.enqueue("create", record, "operator"), saved = f.saved();
  saved.events[0].state = "sending"; saved.events[0].steps["card-create"] = { state: "sending" };
  const filename = path.join(f.dataDir, "pass-notifications.json"); fs.writeFileSync(filename, JSON.stringify(saved));
  await f.restart(); f.client.ready = true; await assert.rejects(f.queue.retry(result.id), { status: 409 }); assert.equal(f.writes.length, 0);
  const bytes = '{"version":1,"events":[{}],"refs":{}}'; fs.writeFileSync(filename, bytes);
  assert.throws(() => createPassNotifications(f.options), /struktur|odczyta/); assert.equal(fs.readFileSync(filename, "utf8"), bytes);
});

test("pre-send disk failure sends nothing and failed post-send checkpoint blocks duplicates", async t => {
  const f = fixture(t), record = f.pass(); f.records.set(record.id, record);
  const writeJson = storage.writeJson; t.after(() => { storage.writeJson = writeJson; });
  let phase = "before", triggered = false;
  storage.writeJson = (filename, value) => {
    const event = value.events?.at(-1);
    if (!triggered && filename.endsWith("pass-notifications.json") && event?.steps?.["card-create"]?.state === (phase === "before" ? "sending" : "sent")) {
      triggered = true; throw new Error("Fixture checkpoint failure");
    }
    return writeJson(filename, value);
  };
  const failed = await f.queue.enqueue("create", record, "operator"); assert.equal(failed.canRetry, true); assert.equal(f.writes.length, 0);
  storage.writeJson = writeJson; assert.equal((await f.queue.retry(failed.id)).status, "sent"); assert.equal(f.writes.length, 1);
  const other = f.pass("P-002"); f.records.set(other.id, other); phase = "after"; triggered = false;
  storage.writeJson = (filename, value) => {
    if (!triggered && filename.endsWith("pass-notifications.json") && value.events?.at(-1)?.steps?.["card-create"]?.state === "sent") {
      triggered = true; throw new Error("Fixture checkpoint failure");
    }
    return writeJson(filename, value);
  };
  const uncertain = await f.queue.enqueue("create", other, "operator"); storage.writeJson = writeJson;
  assert.equal(uncertain.canRetry, false); await assert.rejects(f.queue.retry(uncertain.id), { status: 409 }); assert.equal(f.writes.length, 2);
});

test("destination selection rejects ambiguity, foreign guilds and absent permission; explicit ID resolves ambiguity", async t => {
  const f = fixture(t), options = { guildId: f.guild.id };
  assert.equal(await resolvePassDestination(f.client, options), f.channel);
  const duplicate = { ...f.channel, id: "100000000000000704", name: "przepustki" };
  f.guild.channels.cache.set(duplicate.id, duplicate);
  await assert.rejects(resolvePassDestination(f.client, options), /Kilka/);
  assert.equal(await resolvePassDestination(f.client, { ...options, channelId: f.channel.id }), f.channel);
  f.channel.guildId = "100000000000000705";
  await assert.rejects(resolvePassDestination(f.client, { ...options, channelId: f.channel.id }), /GUILD_ID/);
  f.channel.guildId = f.guild.id; f.channel.permissionsFor = () => ({ has: () => false });
  await assert.rejects(resolvePassDestination(f.client, { ...options, channelId: f.channel.id }), /uprawnień/);
  f.channel.permissionsFor = () => null;
  await assert.rejects(resolvePassDestination(f.client, { ...options, channelId: f.channel.id }), /uprawnień/);
});

test("a saved card from another guild is rejected before fetch or edit", async t => {
  const f = fixture(t), foreign = { ...f.channel, id: "100000000000000706", guildId: "100000000000000707" };
  f.guild.channels.cache.set(foreign.id, foreign);
  const record = { ...f.pass(), messageId: "100000000000000796", channelId: foreign.id };
  f.records.set(record.id, record);
  const failed = await f.queue.enqueue("update", record, "reviewer"); assert.equal(failed.status, "failed"); assert.equal(f.writes.length, 0);
});
