"use strict";

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Collection, PermissionFlagsBits } = require("discord.js");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-log-channel-"));
const filename = path.join(dataDir, "sw-data.json");
const guildId = "100000000000000501";
const oldChannelId = "100000000000000502";
process.env.SW_DATA_DIR = dataDir;
process.env.MANAGEMENT_DATA_DIR = dataDir;
process.env.GUILD_ID = guildId;
process.env.OFFLINE = "1";
delete process.env.TOKEN;
delete process.env.PANEL_MEMBERS_CHANNEL_ID;
fs.writeFileSync(filename, JSON.stringify({ settings: { logChannelId: oldChannelId }, members: {} }, null, 2));

const management = require("../services/management");
const registerResource = management.registerResource;
const handlers = new Map();
management.registerResource = (name, resource) => { handlers.set(name, resource); return registerResource(name, resource); };
const dotenv = require("dotenv");
const configureDotenv = dotenv.config;
let client, commands;
try {
  dotenv.config = () => ({ parsed: {} });
  ({ client, commands } = require("../index"));
} finally { dotenv.config = configureDotenv; management.registerResource = registerResource; }
client.user = { id: "100000000000000503", tag: "Fixture#0001" };
const guild = { id: guildId, channels: { cache: new Collection() } };
guild.channels.fetch = async id => id ? guild.channels.cache.get(id) : guild.channels.cache;
client.guilds.cache.set(guildId, guild);
client.channels.fetch = async id => guild.channels.cache.get(id);
const sends = [];
const required = ["ViewChannel", "SendMessages", "EmbedLinks"];

function channel(id = "100000000000000504", options = {}) {
  const result = { id, guildId, guild, type: 0, name: "logi-testowe", isTextBased: () => true,
    allowed: new Set(required),
    permissionsFor(user) {
      assert.equal(user, client.user);
      return { has: permissions => (Array.isArray(permissions) ? permissions : [permissions]).every(permission => {
        const name = typeof permission === "bigint" ? required.find(key => PermissionFlagsBits[key] === permission) : permission;
        return result.allowed.has(name);
      }) };
    },
    async send(payload) { sends.push({ id, payload }); return { id: "100000000000000599" }; },
    toString() { return `<#${id}>`; }, ...options };
  return result;
}
const oldChannel = channel(oldChannelId);
guild.channels.cache.set(oldChannel.id, oldChannel);

async function dispatch(selected, { staff = true, currentGuildId = guildId, currentGuild = guild } = {}) {
  const replies = [];
  const interaction = {
    commandName: "sw-ustaw-logi", guildId: currentGuildId, guild: currentGuild,
    memberPermissions: { has: permission => staff && permission === PermissionFlagsBits.ManageGuild },
    isChatInputCommand: () => true, isButton: () => false, isModalSubmit: () => false, isStringSelectMenu: () => false,
    options: { getChannel: () => selected },
    async reply(payload) { replies.push(payload); interaction.replied = true; },
  };
  await Promise.all(client.listeners("interactionCreate").map(listener => listener(interaction)));
  assert.equal(replies.length, 1);
  return replies[0];
}
function baseline() { return { bytes: fs.readFileSync(filename, "utf8"), id: handlers.get("members").notificationChannelId(), writes: sends.length }; }
function unchanged(before) {
  assert.equal(fs.readFileSync(filename, "utf8"), before.bytes);
  assert.equal(handlers.get("members").notificationChannelId(), before.id);
  assert.equal(sends.length, before.writes);
}
async function denied(selected, options) {
  const before = baseline();
  const response = await dispatch(selected, options);
  assert.equal(response.ephemeral, true);
  assert.match(response.content, /^❌/);
  unchanged(before);
  return response;
}

after(async () => { await management.stop(); await client.destroy(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test("the existing setup command offers only text and announcement channels", () => {
  const command = commands.find(item => item.name === "sw-ustaw-logi");
  assert.deepEqual(command.options.find(option => option.name === "kanal").channel_types, [0, 5]);
  assert.equal(commands.length, 30);
  assert.equal(new Set(commands.map(item => item.name)).size, commands.length);
});

test("staff permission is required before channel setup", async () => {
  const response = await denied(channel(), { staff: false });
  assert.match(response.content, /Zarządzanie serwerem/);
});

test("invalid channels, voice channels and threads cannot replace the saved channel", async () => {
  for (const invalid of [null, channel("bad-id"), channel(undefined, { type: 2 }), channel(undefined, { type: 11 }),
    channel(undefined, { isTextBased: () => false }), channel(undefined, { send: undefined })]) {
    assert.match((await denied(invalid)).content, /tekstowy.*ogłoszeniowy/);
  }
});

test("both the selected channel and the interaction must belong to the configured guild", async () => {
  const foreign = "100000000000000598";
  await denied(channel(undefined, { guildId: foreign }));
  await denied(channel(), { currentGuildId: foreign, currentGuild: { id: foreign } });
  await denied(channel(), { currentGuildId: null, currentGuild: null });
  await denied(channel(undefined, { guildId: undefined, guild: { id: foreign } }));
});

test("each missing bot permission is named and cannot change the saved setting", async () => {
  const labels = { ViewChannel: "Wyświetlanie kanału", SendMessages: "Wysyłanie wiadomości", EmbedLinks: "Osadzanie linków" };
  for (const permission of required) {
    const selected = channel();
    selected.allowed.delete(permission);
    const response = await denied(selected);
    assert.ok(response.content.includes(labels[permission]));
    for (const allowed of required.filter(name => name !== permission)) assert.ok(!response.content.includes(labels[allowed]));
  }
});

test("unavailable or throwing permission information fails closed", async () => {
  for (const permissionsFor of [undefined, () => null, () => ({}), () => { throw new Error("Fixture lookup failed"); },
    () => ({ has() { throw new Error("Fixture permission failed"); } })]) {
    const response = await denied(channel(undefined, { permissionsFor }));
    for (const label of ["Wyświetlanie kanału", "Wysyłanie wiadomości", "Osadzanie linków"]) assert.ok(response.content.includes(label));
  }
  const originalUser = client.user;
  try { client.user = null; await denied(channel()); }
  finally { client.user = originalUser; }
});

test("valid text and announcement channels persist without posting a test message", async () => {
  for (const [id, type] of [["100000000000000505", 0], ["100000000000000506", 5]]) {
    const selected = channel(id, { type });
    const before = sends.length;
    const response = await dispatch(selected);
    assert.equal(response, `✅ Kanał logów ustawiony na ${selected}.`);
    assert.equal(JSON.parse(fs.readFileSync(filename)).settings.logChannelId, selected.id);
    assert.equal(handlers.get("members").notificationChannelId(), selected.id);
    assert.equal(sends.length, before);
  }
});

test("a failed disk write restores the previous in-memory and saved channel", async () => {
  const storage = require("../services/storage");
  const writeJson = storage.writeJson;
  const logError = console.error;
  const before = baseline();
  try {
    storage.writeJson = (file, value) => { if (file === filename) throw new Error("Fixture disk failure"); return writeJson(file, value); };
    console.error = () => {};
    assert.match((await dispatch(channel())).content, /błąd/);
  } finally { storage.writeJson = writeJson; console.error = logError; }
  unchanged(before);
});

test("queued personnel notifications use the updated setting when retried without restarting", async () => {
  await dispatch(oldChannel);
  oldChannel.allowed.delete("EmbedLinks");
  const ready = client.isReady;
  client.isReady = () => true;
  const { createResourceNotifications } = require("../services/resource-notifications");
  const queue = createResourceNotifications({ client, dataDir: path.join(dataDir, "queue-fixture"),
    getFallbackChannelId: resource => handlers.get(resource)?.notificationChannelId?.() });
  try {
    const pending = await queue.enqueue("members", "create", { id: "100000000000000507", name: "Fixture", rank: "Rekrut", number: 7 }, "fixture-admin");
    assert.equal(pending.status, "failed");
    const selected = channel("100000000000000508");
    guild.channels.cache.set(selected.id, selected);
    const before = sends.length;
    assert.match(await dispatch(selected), /✅/);
    assert.equal(sends.length, before, "Setup itself must never post a test message");
    assert.equal((await queue.retry(pending.id)).status, "sent");
    assert.equal(sends.length, before + 1);
    assert.equal(sends.at(-1).id, selected.id);
  } finally { await queue.stop(); client.isReady = ready; oldChannel.allowed.add("EmbedLinks"); }
});
