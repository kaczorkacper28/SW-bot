"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { Collection } = require("discord.js");
const { resolveDestination } = require("../services/notification-content");
const { createResourceNotifications } = require("../services/resource-notifications");

const guildId = "100000000000000801";
const channelId = "100000000000000802";
const record = Object.freeze({ id: "100000000000000803", userId: "100000000000000803", name: "Funkcjonariusz Testowy", number: 8, rank: "Kapral" });

function fixture(t, { resolver } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-notification-diagnostics-"));
  const filename = path.join(dataDir, "resource-notifications.json");
  const env = { GUILD_ID: guildId };
  const state = { fallback: undefined, missing: new Set(), writes: [], sendError: undefined };
  const client = new EventEmitter();
  client.ready = true;
  client.isReady = () => client.ready;
  client.user = { id: "100000000000000804" };
  const channels = new Collection();
  const guild = { id: guildId, channels: { cache: channels, fetch: async id => id ? channels.get(id) : channels } };
  client.guilds = { cache: new Collection([[guildId, guild]]), fetch: async id => id === guildId ? guild : undefined };
  const channel = { id: channelId, name: "📋・kadry", type: 0, guildId, guild, isTextBased: () => true,
    permissionsFor: () => ({ has: permissions => permissions.every(permission => !state.missing.has(permission)) }),
    async send(payload) {
      state.writes.push(payload);
      if (state.sendError) throw state.sendError;
      return { id: String(100000000000000810n + BigInt(state.writes.length)) };
    },
  };
  const options = { client, dataDir, responseWaitMs: 20, getFallbackChannelId: () => state.fallback,
    resolveDestination: resolver || ((current, resource, extra) => resolveDestination(current, resource, { ...extra, env })) };
  let queue = createResourceNotifications(options);
  t.after(async () => { await queue.stop(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  return { client, guild, channels, channel, env, state, filename,
    get queue() { return queue; },
    addChannel() { channels.set(channel.id, channel); },
    saved() { return JSON.parse(fs.readFileSync(filename, "utf8")); },
    async restart() { await queue.stop(); queue = createResourceNotifications(options); },
  };
}

function diagnostic(code, setting = "PANEL_MEMBERS_CHANNEL_ID") {
  return { code, setting, resource: "members" };
}

function noDiagnostic(result) {
  assert.equal(result.diagnostic, undefined);
}

test("missing members channel produces a durable actionable diagnosis and succeeds after configuration", async t => {
  const f = fixture(t), original = JSON.stringify(record);
  const failed = await f.queue.enqueue("members", "create", record, "diagnostics.operator");
  assert.equal(failed.status, "failed");
  assert.equal(failed.canRetry, true);
  assert.deepEqual(failed.diagnostic, diagnostic("CHANNEL_MISSING"));
  assert.match(failed.message, /kadry/);
  assert.match(failed.message, /funkcjonariusze/);
  assert.match(failed.message, /\/sw-ustaw-logi/);
  assert.equal(f.state.writes.length, 0);
  assert.ok(fs.readFileSync(f.filename, "utf8").includes("CHANNEL_MISSING"));
  await f.restart();
  assert.deepEqual(f.queue.list()[0].diagnostic, failed.diagnostic);
  assert.equal(f.queue.list()[0].message, failed.message);
  f.addChannel();
  const sent = await f.queue.retry(failed.id);
  assert.equal(sent.status, "sent");
  assert.equal(sent.id, failed.id);
  assert.equal(sent.recordId, record.id);
  noDiagnostic(sent);
  assert.equal(f.state.writes.length, 1);
  assert.deepEqual(f.state.writes[0].allowedMentions, { parse: [] });
  assert.equal(JSON.stringify(record), original);
});

test("permission diagnosis names the missing embed permission and clears before a later Discord rejection", async t => {
  const f = fixture(t);
  f.addChannel(); f.state.missing.add("EmbedLinks");
  const denied = await f.queue.enqueue("members", "update", record, "diagnostics.operator");
  assert.equal(denied.status, "failed");
  assert.deepEqual(denied.diagnostic, diagnostic("MISSING_PERMISSIONS"));
  assert.match(denied.message, /Osadzanie linków/);
  assert.doesNotMatch(denied.message, /Wyświetlanie kanału|Wysyłanie wiadomości/);
  assert.equal(f.state.writes.length, 0);
  f.state.missing.clear();
  f.state.sendError = Object.assign(new Error("Fixture rejected HTTP write"), { status: 403, code: 50013 });
  const rejected = await f.queue.retry(denied.id);
  assert.equal(rejected.status, "failed");
  assert.equal(rejected.canRetry, true);
  noDiagnostic(rejected);
  assert.equal(f.state.writes.length, 1);
  const nonce = f.state.writes[0].nonce;
  f.state.sendError = undefined;
  const sent = await f.queue.retry(denied.id);
  assert.equal(sent.status, "sent"); noDiagnostic(sent);
  assert.equal(f.state.writes.length, 2);
  assert.equal(f.state.writes[1].nonce, nonce);
  assert.equal(f.state.writes[1].enforceNonce, true);
  await f.queue.retry(denied.id);
  assert.equal(f.state.writes.length, 2);
});

test("an explicit invalid setting cannot fall back silently or expose its value", async t => {
  const f = fixture(t), privateValue = "FAKE_PRIVATE_VALUE_MUST_NOT_BE_SHOWN";
  f.addChannel(); f.channel.name = "📜・logi"; f.state.fallback = channelId;
  f.env.PANEL_MEMBERS_CHANNEL_ID = privateValue;
  const failed = await f.queue.enqueue("members", "update", record, "diagnostics.operator");
  assert.deepEqual(failed.diagnostic, diagnostic("INVALID_CHANNEL_ID"));
  assert.match(failed.message, /PANEL_MEMBERS_CHANNEL_ID/);
  assert.doesNotMatch(failed.message, /\/sw-ustaw-logi/);
  assert.ok(!failed.message.includes(privateValue));
  assert.ok(!fs.readFileSync(f.filename, "utf8").includes(privateValue));
  assert.equal(f.state.writes.length, 0);
  delete f.env.PANEL_MEMBERS_CHANNEL_ID;
  assert.equal((await f.queue.retry(failed.id)).status, "sent");
  assert.equal(f.state.writes.length, 1, "the saved module log channel is used without a matching name alias");
});

test("an untrusted error with diagnostic-looking properties never exposes SDK text or claims a trusted diagnosis", async t => {
  const privateValue = "FAKE_SDK_PRIVATE_TEXT_MUST_NOT_ESCAPE";
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args.join(" ")));
  const error = Object.assign(new Error(privateValue), { code: "MISSING_PERMISSIONS", setting: "PANEL_MEMBERS_CHANNEL_ID", resource: "members" });
  const f = fixture(t, { resolver: async () => { throw error; } });
  const failed = await f.queue.enqueue("members", "create", record, "diagnostics.operator");
  assert.equal(failed.status, "failed"); assert.equal(failed.canRetry, true);
  noDiagnostic(failed);
  assert.ok(!JSON.stringify(failed).includes(privateValue));
  assert.ok(!fs.readFileSync(f.filename, "utf8").includes(privateValue));
  assert.ok(!logs.join("\n").includes(privateValue));
  assert.equal(f.state.writes.length, 0);
});

test("raw guild API failures are wrapped into a safe configuration diagnosis", async t => {
  const f = fixture(t), privateValue = "FAKE_GUILD_SDK_SECRET_TEXT";
  f.client.guilds.cache.clear();
  f.client.guilds.fetch = async () => { throw new Error(privateValue); };
  const failed = await f.queue.enqueue("members", "create", record, "diagnostics.operator");
  assert.deepEqual(failed.diagnostic, diagnostic("GUILD_UNAVAILABLE", "GUILD_ID"));
  assert.match(failed.message, /GUILD_ID/);
  assert.ok(!JSON.stringify(failed).includes(privateValue));
  assert.ok(!fs.readFileSync(f.filename, "utf8").includes(privateValue));
  assert.equal(f.state.writes.length, 0);
});

test("retry removes stale configuration details in pending and uncertain states without replaying a possible POST", async t => {
  const f = fixture(t);
  const failed = await f.queue.enqueue("members", "update", record, "diagnostics.operator");
  assert.deepEqual(failed.diagnostic, diagnostic("CHANNEL_MISSING"));
  f.addChannel(); f.client.ready = false;
  const pending = await f.queue.retry(failed.id);
  assert.equal(pending.status, "pending"); noDiagnostic(pending);
  f.client.ready = true;
  f.state.sendError = Object.assign(new Error("FAKE_TRANSPORT_PRIVATE_TEXT"), { code: "ECONNRESET" });
  const uncertain = await f.queue.retry(failed.id);
  assert.equal(uncertain.status, "failed"); assert.equal(uncertain.canRetry, false);
  noDiagnostic(uncertain);
  assert.equal(f.saved().events[0].state, "uncertain");
  assert.equal(f.state.writes.length, 1);
  assert.ok(!fs.readFileSync(f.filename, "utf8").includes("FAKE_TRANSPORT_PRIVATE_TEXT"));
  await f.restart();
  noDiagnostic(f.queue.list()[0]);
  await assert.rejects(f.queue.retry(failed.id), { status: 409 });
  f.queue.start(); await new Promise(setImmediate);
  assert.equal(f.state.writes.length, 1);
});
