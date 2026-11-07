"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { EventEmitter } = require("node:events");
const { Collection } = require("discord.js");

const RESOURCES = ["members", "ranks", "reports", "calls", "documents", "proposals", "payouts"];
const GUILD_ID = "100000000000000201";
const CHANNEL_ID = "100000000000000202";
const DATA_FILE = "resource-notifications.json";

function record(resource, id = "shared-record") {
  const rows = {
    members: { userId: "100000000000000203", name: "Anna Testowa", number: 12, rank: "Rekrut", corps: "Szeregowi", plus: 1, minus: 0, reprimands: 0 },
    ranks: { userId: "100000000000000203", section: "rekruci", number: 12 },
    reports: { title: "Raport testowy", author: "Testowy autor", content: "Treść raportu", status: "nowy" },
    calls: { title: "Wezwanie testowe", target: "Testowy funkcjonariusz", reason: "Powód wezwania", status: "nowy" },
    documents: { title: "Dokument testowy", kind: "Notatka", content: "Treść dokumentu", status: "nowy" },
    proposals: { title: "Propozycja testowa", author: "Testowy autor", content: "Treść propozycji", status: "nowy" },
    payouts: { title: "Wypłata testowa", recipient: "Testowy odbiorca", amount: 125, reason: "Powód wypłaty", status: "zatwierdzony" },
  };
  return { id, ...rows[resource] };
}

function fixture(t, overrides = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-resource-notices-"));
  const writes = [];
  const client = new EventEmitter();
  client.ready = true;
  client.isReady = () => client.ready;
  client.user = { id: "100000000000000204", tag: "Fixture#0001" };
  const guild = { id: GUILD_ID, channels: { cache: new Collection() } };
  const channel = {
    id: CHANNEL_ID, guildId: GUILD_ID, guild, type: 0, name: "powiadomienia-testowe",
    isTextBased: () => true, permissionsFor: () => ({ has: () => true }),
    async send(payload) {
      writes.push(payload);
      if (channel.error) throw channel.error;
      if (channel.sendHook) return channel.sendHook(payload);
      return { id: String(100000000000000300n + BigInt(writes.length)) };
    },
  };
  guild.channels.cache.set(channel.id, channel);
  client.guilds = { cache: new Collection([[guild.id, guild]]) };
  client.channels = { fetch: async id => guild.channels.cache.get(id) };
  const options = { client, dataDir, responseWaitMs: 25,
    getFallbackChannelId: () => null, resolveDestination: async () => channel, ...overrides };
  const { createResourceNotifications } = require("../services/resource-notifications");
  let queue = createResourceNotifications(options);
  t.after(async () => { await queue.stop(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  return { dataDir, writes, client, guild, channel, options,
    get queue() { return queue; },
    async restart() { await queue.stop(); queue = createResourceNotifications(options); },
    saved: () => JSON.parse(fs.readFileSync(path.join(dataDir, DATA_FILE), "utf8")) };
}

const serialize = payload => JSON.stringify(payload, (_, value) => value?.toJSON?.() || value);
async function until(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail("Notification worker did not finish the fixture within two seconds");
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

test("all seven resources publish create, update and removal notices without mutating their records", async t => {
  const f = fixture(t);
  for (const resource of RESOURCES) {
    const item = Object.freeze({ ...record(resource), discordMessageId: "semantic-message-must-stay", messageId: "semantic-card-must-stay" });
    const original = JSON.stringify(item);
    for (const action of ["create", "update", "remove"]) {
      const result = await f.queue.enqueue(resource, action, item, "operator-seven");
      assert.equal(result.status, "sent", `${resource} ${action}`);
      assert.equal(result.resource, resource);
      assert.equal(result.action, action);
      assert.equal(result.actor, "operator-seven");
      assert.equal(JSON.stringify(item), original);
      const payload = f.writes.at(-1);
      assert.deepEqual(payload.allowedMentions, { parse: [] });
      assert.equal(payload.enforceNonce, true);
      assert.match(payload.nonce, /^[a-f0-9]{25}$/);
      assert.match(serialize(payload), /operator-seven/);
    }
  }
  assert.equal(f.writes.length, 21);
  assert.equal(new Set(f.writes.map(payload => payload.nonce)).size, 21);
  assert.equal(f.saved().events.length, 21);
  assert.ok(f.saved().events.every(event => event.state === "sent" && event.discordMessageId && event.channelId));
});

test("offline notices survive restart and ready automatically publishes each once", async t => {
  const f = fixture(t);
  f.client.ready = false;
  const created = await f.queue.enqueue("reports", "create", record("reports"), "offline-operator");
  await f.queue.enqueue("reports", "update", record("reports"), "offline-operator");
  assert.equal(created.status, "pending");
  assert.equal(f.writes.length, 0);
  await f.restart();
  f.queue.start();
  f.client.ready = true;
  f.client.emit("ready");
  await until(() => f.queue.list().every(event => event.status === "sent"));
  assert.equal(f.writes.length, 2);
  f.client.emit("ready");
  f.client.emit("shardResume", 0, 0);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.writes.length, 2);
});

test("a definitive failure retries the same nonce and concurrent retry cannot publish twice", async t => {
  const f = fixture(t);
  f.channel.error = Object.assign(new Error("Missing permissions"), { status: 403, code: 50013 });
  const failed = await f.queue.enqueue("documents", "create", record("documents"), "operator");
  assert.equal(failed.status, "failed");
  assert.equal(failed.canRetry, true);
  const firstNonce = f.writes[0].nonce;
  delete f.channel.error;
  const results = await Promise.allSettled([f.queue.retry(failed.id), f.queue.retry(failed.id)]);
  assert.ok(results.some(result => result.status === "fulfilled" && result.value.status === "sent"));
  assert.equal(f.writes.length, 2);
  assert.equal(f.writes[1].nonce, firstNonce);
});

test("ambiguous writes block their record but identical IDs in other resources remain independent", async t => {
  const f = fixture(t);
  f.channel.error = Object.assign(new Error("Connection lost after POST"), { code: "ECONNRESET" });
  const uncertain = await f.queue.enqueue("reports", "create", record("reports"), "operator");
  assert.equal(uncertain.status, "failed");
  assert.equal(uncertain.canRetry, false);
  delete f.channel.error;
  await f.restart();
  const blocked = await f.queue.enqueue("reports", "update", record("reports"), "operator");
  assert.equal(blocked.status, "pending");
  const unrelated = await f.queue.enqueue("calls", "create", record("calls"), "operator");
  assert.equal(unrelated.status, "sent");
  await assert.rejects(f.queue.retry(uncertain.id), { status: 409 });
  assert.equal(f.writes.length, 2);
});

test("a crash with an in-flight POST never silently retries the uncertain write", async t => {
  const f = fixture(t);
  f.client.ready = false;
  const queued = await f.queue.enqueue("proposals", "create", record("proposals"), "operator");
  const saved = f.saved();
  saved.events[0].state = "sending";
  fs.writeFileSync(path.join(f.dataDir, DATA_FILE), JSON.stringify(saved));
  await f.restart();
  f.client.ready = true;
  f.queue.start();
  await assert.rejects(f.queue.retry(queued.id), { status: 409 });
  assert.equal(f.queue.list()[0].status, "failed");
  assert.equal(f.queue.list()[0].canRetry, false);
  assert.equal(f.writes.length, 0);
});

test("a missing Discord message ID is uncertain and cannot be retried", async t => {
  const f = fixture(t);
  f.channel.sendHook = async () => ({});
  const result = await f.queue.enqueue("calls", "create", record("calls"), "operator");
  assert.equal(result.status, "failed");
  assert.equal(result.canRetry, false);
  assert.equal(f.saved().events[0].state, "uncertain");
  await assert.rejects(f.queue.retry(result.id), { status: 409 });
  assert.equal(f.writes.length, 1);
});

test("disk checkpoint failures do not cause untracked or duplicate remote writes", async t => {
  const f = fixture(t);
  const rename = fs.renameSync;
  let rejectedState = "sending";
  try {
    fs.renameSync = (source, target) => {
      const value = JSON.parse(fs.readFileSync(source, "utf8"));
      if (target === path.join(f.dataDir, DATA_FILE) && value.events.at(-1)?.state === rejectedState) {
        throw new Error("Simulated fixture checkpoint failure");
      }
      return rename(source, target);
    };
    const notSent = await f.queue.enqueue("reports", "create", record("reports", "before-send"), "operator");
    assert.equal(notSent.status, "failed");
    assert.equal(notSent.canRetry, true);
    assert.equal(f.writes.length, 0);
    rejectedState = null;
    assert.equal((await f.queue.retry(notSent.id)).status, "sent");
    assert.equal(f.writes.length, 1);
    rejectedState = "sent";
    const sentButUnconfirmed = await f.queue.enqueue("reports", "create", record("reports", "after-send"), "operator");
    assert.equal(sentButUnconfirmed.status, "failed");
    assert.equal(sentButUnconfirmed.canRetry, false);
    assert.equal(f.writes.length, 2);
    rejectedState = null;
    await f.restart();
    await assert.rejects(f.queue.retry(sentButUnconfirmed.id), { status: 409 });
    assert.equal(f.writes.length, 2);
  } finally { fs.renameSync = rename; }
});

test("outbox snapshots and notices whitelist fields and bound Discord content", async t => {
  const f = fixture(t);
  const sentinel = "DO_NOT_COPY_FAKE_PRIVATE_VALUE";
  const item = { ...record("reports"), content: "x".repeat(10000), password: sentinel, token: sentinel,
    nestedPrivateState: { value: sentinel }, authorization: sentinel };
  const result = await f.queue.enqueue("reports", "create", item, "operator");
  assert.equal(result.status, "sent");
  assert.ok(!fs.readFileSync(path.join(f.dataDir, DATA_FILE), "utf8").includes(sentinel));
  assert.ok(!serialize(f.writes[0]).includes(sentinel));
  const embed = f.writes[0].embeds[0].toJSON?.() || f.writes[0].embeds[0];
  assert.ok((embed.title || "").length <= 256);
  assert.ok((embed.description || "").length <= 4096);
  for (const field of embed.fields || []) {
    assert.ok(field.name.length <= 256);
    assert.ok(field.value.length <= 1024);
  }
  const total = [embed.title, embed.description, embed.footer?.text, ...((embed.fields || []).flatMap(field => [field.name, field.value]))]
    .filter(Boolean).reduce((sum, value) => sum + value.length, 0);
  assert.ok(total <= 6000);
});

test("legacy Discord journal identities and content remain useful in change announcements", async t => {
  const f = fixture(t);
  const userId = "100000000000000206";
  const cases = [
    ["payouts", { id: "legacy-payout", userId, amount: 500, content: "Archiwalna wypłata Discord" }, [userId, "Archiwalna wypłata Discord"]],
    ["calls", { id: "legacy-call", name: "Jan Kowalski", userId, content: "Archiwalne wezwanie Discord", deadline: "Jutro 18:00" }, ["Jan Kowalski", "Archiwalne wezwanie Discord", "Jutro 18:00"]],
    ["reports", { id: "legacy-report", title: "Raport", authorId: userId, content: "Archiwalny raport Discord" }, [userId, "Archiwalny raport Discord"]],
    ["proposals", { id: "legacy-proposal", title: "Propozycja", authorId: userId, content: "Archiwalna propozycja Discord" }, [userId, "Archiwalna propozycja Discord"]],
  ];
  for (const [resource, item, excerpts] of cases) {
    assert.equal((await f.queue.enqueue(resource, "update", item, "legacy-operator")).status, "sent");
    const rendered = serialize(f.writes.at(-1));
    for (const excerpt of excerpts) assert.ok(rendered.includes(excerpt), `${resource} should retain ${excerpt}`);
  }
});

test("slow Discord remains a durable pending notification while API work can finish", async t => {
  const f = fixture(t);
  let release;
  f.channel.sendHook = () => new Promise(resolve => { release = resolve; });
  const start = Date.now();
  const pending = await f.queue.enqueue("payouts", "create", record("payouts"), "operator");
  assert.equal(pending.status, "pending");
  assert.ok(Date.now() - start < 1000);
  assert.equal(f.saved().events[0].state, "sending");
  release({ id: "100000000000000399" });
  await until(() => f.queue.list()[0].status === "sent");
  assert.equal(f.writes.length, 1);
});

test("invalid outbox is rejected without replacing existing bytes", async t => {
  const f = fixture(t);
  const filename = path.join(f.dataDir, DATA_FILE);
  const corrupt = '{"version":1,"events":[{}]}';
  fs.writeFileSync(filename, corrupt);
  const { createResourceNotifications } = require("../services/resource-notifications");
  assert.throws(() => createResourceNotifications(f.options), /struktur|odczyta|baz/i);
  assert.equal(fs.readFileSync(filename, "utf8"), corrupt);
});

test("real management HTTP publishes all seven CRUD resources once, keeps semantic IDs, and does not queue Discord journals", async t => {
  const f = fixture(t);
  process.env.SW_DATA_DIR = f.dataDir;
  process.env.MANAGEMENT_DATA_DIR = f.dataDir;
  process.env.OFFLINE = "1";
  process.env.GUILD_ID = GUILD_ID;
  for (const resource of RESOURCES) process.env[`PANEL_${resource.toUpperCase()}_CHANNEL_ID`] = CHANNEL_ID;
  delete process.env.TOKEN;
  delete process.env.CLIENT_ID;
  // index initializes real modules, but this test must never read a checkout's .env.
  const dotenv = require("dotenv");
  const configure = dotenv.config;
  let bot;
  try { dotenv.config = () => ({ parsed: {} }); bot = require("../index"); }
  finally { dotenv.config = configure; }
  const management = require("../services/management");
  const originalReady = bot.client.isReady;
  const originalFetch = bot.client.channels.fetch;
  bot.client.isReady = () => true;
  bot.client.guilds.cache.set(GUILD_ID, f.guild);
  bot.client.channels.fetch = async id => f.guild.channels.cache.get(id);
  bot.client.user = f.client.user;
  const server = await management.startManagement({ client: bot.client, port: 0 });
  t.after(async () => {
    await management.stop();
    bot.client.isReady = originalReady;
    bot.client.channels.fetch = originalFetch;
    await bot.client.destroy();
  });
  const key = fs.readFileSync(path.join(f.dataDir, "panel-bridge.key"), "utf8").trim();
  const request = (method, route, body) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: server.address().port, path: route, method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Panel-User": "http-operator" } }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, data: JSON.parse(Buffer.concat(chunks)) }));
    });
    req.on("error", reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  for (const resource of RESOURCES) {
    const body = record(resource);
    delete body.id;
    const created = await request("POST", `/api/${resource}`, body);
    assert.equal(created.status, 201, `${resource}: ${JSON.stringify(created.data)}`);
    assert.equal(created.data.notification.status, "sent", `${resource}: ${JSON.stringify(created.data.notification)}`);
    assert.equal(created.data.record.discordMessageId, undefined, resource);
    assert.equal(created.data.record.messageId, undefined, resource);
    assert.equal(created.data.record.publishState, undefined, resource);
    assert.equal(created.data.record.paid, undefined, resource);
    const id = created.data.record.id;
    const patch = resource === "members" ? { name: "Zmieniona Anna" } : resource === "ranks" ? { number: 13 } : { status: "w toku" };
    const updated = await request("PATCH", `/api/${resource}/${id}`, patch);
    assert.equal(updated.status, 200, resource);
    assert.equal(updated.data.notification.status, "sent", resource);
    const removed = await request("DELETE", `/api/${resource}/${id}`);
    assert.equal(removed.status, 200, resource);
    assert.equal(removed.data.notification.status, "sent", resource);
  }
  assert.equal(f.writes.length, 21);
  const state = await request("GET", "/api/state");
  assert.equal(state.data.collections.audit.length, 21);
  assert.equal(state.data.notifications.length, 21);
  assert.ok(state.data.collections.audit.every(entry => entry.actor === "http-operator"));
  const paid = management.recordDiscord("payouts", { id: "already-paid", recipient: "Odbiorca", amount: 500, reason: "Wypłata Discord", status: "zatwierdzony", paid: true, discordMessageId: "100000000000000499" });
  assert.equal(paid.paid, true);
  assert.equal(f.writes.length, 21);
  assert.equal((await request("GET", "/api/notifications")).data.notifications.length, 21);
  const edited = await request("PATCH", "/api/payouts/already-paid", { reason: "Poprawiony opis" });
  assert.equal(edited.data.notification.status, "sent");
  assert.equal(edited.data.record.paid, true);
  assert.equal(edited.data.record.discordMessageId, "100000000000000499");
  assert.equal(f.writes.length, 22);
  const journal = JSON.parse(fs.readFileSync(path.join(f.dataDir, "panel-records.json"), "utf8"));
  assert.equal(journal.payouts.find(item => item.id === "already-paid").discordMessageId, "100000000000000499");
});
