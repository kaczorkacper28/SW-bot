"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { EventEmitter } = require("node:events");
const { Collection } = require("discord.js");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-prisoner-passes-"));
const guildId = "100000000000000601";
const channelId = "100000000000000602";
const databaseFile = path.join(dataDir, "osadzeni.json");
const outboxFile = path.join(dataDir, "prisoner-notifications.json");
const recordsFile = path.join(dataDir, "panel-records.json");
const values = { imie: "Osadzony Testowy", paragraf: "Art. 1", wyrok: "30 minut", cela: "A1", poczatek: "12:00", koniec: "12:30", paused: true };
const seed = id => ({ ...values, id, remainingSeconds: 720, czasKaryMinuty: 30, timerStartedAt: "2026-01-01T12:00:00.000Z" });
fs.writeFileSync(databaseFile, JSON.stringify({ nextId: 3,
  osadzeni: [{ ...seed("O-001"), imie: "Starsza udzielona", przepustka: true }, { ...seed("O-002"), imie: "Starsza bez pola" }],
  przepustki: [{ id: "P-001", osadzonyId: "O-002", osadzony: "Starsza bez pola", od: "12:00", do: "13:00", powod: "Wniosek testowy", miejsce: "Miejsce testowe", status: "oczekuje", zlozyl: "100000000000000603" }],
}), { mode: 0o600 });
process.env.SW_DATA_DIR = dataDir;
process.env.MANAGEMENT_DATA_DIR = dataDir;
process.env.GUILD_ID = guildId;
process.env.PRISONERS_CHANNEL_ID = channelId;
process.env.OFFLINE = "1";
delete process.env.TOKEN;

const client = new EventEmitter();
client.ready = true;
client.isReady = () => client.ready;
client.user = { id: "100000000000000604" };
const writes = [], messages = new Map();
let messageNumber = 100000000000000610n;
const guild = { id: guildId, channels: { cache: new Collection() } };
const channel = { id: channelId, guildId, guild, type: 0, name: "📍・osadzeni", isTextBased: () => true,
  permissionsFor: () => ({ has: () => true }),
  messages: { async fetch(id) {
    if (!messages.has(id)) throw Object.assign(new Error("Unknown message"), { code: 10008 });
    return messages.get(id);
  } },
  async send(payload) {
    const id = String(messageNumber++);
    writes.push({ method: "send", id, payload });
    const message = { id, async edit(update) { writes.push({ method: "edit", id, payload: update }); return message; } };
    messages.set(id, message);
    return message;
  },
};
guild.channels.cache.set(channelId, channel);
client.guilds = { cache: new Collection([[guildId, guild]]) };
client.channels = { fetch: async id => guild.channels.cache.get(id) };
let management, prisonerModule, server, key;
const read = filename => JSON.parse(fs.readFileSync(filename, "utf8"));
const prisoner = id => read(databaseFile).osadzeni.find(item => item.id === id);
const embed = write => write.payload.embeds[0].toJSON();
const passField = write => embed(write).fields.find(field => field.name.includes("Przepustka"))?.value;
const cardWrites = id => writes.filter(write => embed(write).title === `🔒 KARTA OSADZONEGO — ${id}`);

async function start() {
  // Import only the actual prisoner module and management bridge: no .env read or Discord login.
  management = require("../services/management");
  prisonerModule = require("../osadzeni");
  prisonerModule.registerOsadzeniModule(client);
  server = await management.startManagement({ client, port: 0 });
  key = fs.readFileSync(path.join(dataDir, "panel-bridge.key"), "utf8").trim();
}
function request(method, route, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({ hostname: "127.0.0.1", port: server.address().port, path: route, method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Panel-User": "passes.operator" } }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, data: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
    });
    req.on("error", reject); req.end(payload);
  });
}
async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail("The local fixture notification worker did not finish.");
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
before(start);
after(async () => {
  prisonerModule?.stopTimers();
  await management?.stop();
  client.removeAllListeners();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("prisoner creation defaults to no pass and can create an explicitly granted pass", async () => {
  for (const granted of [undefined, false, true]) {
    const input = { ...values };
    if (granted !== undefined) input.przepustka = granted;
    const created = await request("POST", "/api/prisoners", input);
    assert.equal(created.status, 201);
    assert.equal(created.data.record.przepustka, granted === true);
    assert.equal(prisoner(created.data.record.id).przepustka, granted === true);
    assert.equal(created.data.notification.status, "sent");
    assert.equal(passField(cardWrites(created.data.record.id).at(-1)), granted === true ? "✅ Udzielona" : "❌ Brak");
  }
});

test("grant, ordinary edit and revoke preserve the independent timer and native requests", async () => {
  const created = await request("POST", "/api/prisoners", { ...values, remainingSeconds: 765, przepustka: false });
  const id = created.data.record.id;
  const requests = read(databaseFile).przepustki;
  for (const [body, expected] of [[{ przepustka: true }, true], [{ cela: "B2" }, true], [{ przepustka: false }, false]]) {
    const changed = await request("PATCH", `/api/prisoners/${id}`, body);
    assert.equal(changed.status, 200);
    assert.equal(changed.data.notification.status, "sent");
    assert.equal(changed.data.record.przepustka, expected);
    assert.equal(changed.data.record.paused, true);
    assert.equal(changed.data.record.remainingSeconds, 765);
    assert.equal(changed.data.record.poczatek, values.poczatek);
    assert.equal(changed.data.record.koniec, values.koniec);
    assert.equal(prisoner(id).przepustka, expected);
    assert.deepEqual(read(databaseFile).przepustki, requests);
    assert.equal(passField(cardWrites(id).at(-1)), expected ? "✅ Udzielona" : "❌ Brak");
    const notice = writes.filter(write => write.method === "send" && embed(write).title.includes("Zmieniono osadzonego")).at(-1);
    assert.equal(passField(notice), expected ? "✅ Udzielona" : "❌ Brak");
    assert.deepEqual(notice.payload.allowedMentions, { parse: [] });
  }
});

test("bad pass types fail without mutating the prisoner, timer, audit, queue or native requests", async () => {
  const created = await request("POST", "/api/prisoners", { ...values, przepustka: true });
  const id = created.data.record.id;
  const filenames = [databaseFile, recordsFile, outboxFile];
  for (const invalid of ["false", "true", "", 0, 1, null, [], {}]) {
    const before = filenames.map(filename => fs.readFileSync(filename, "utf8"));
    const sent = writes.length;
    assert.equal((await request("PATCH", `/api/prisoners/${id}`, { przepustka: invalid })).status, 400);
    assert.equal((await request("POST", "/api/prisoners", { ...values, przepustka: invalid })).status, 400);
    assert.deepEqual(filenames.map(filename => fs.readFileSync(filename, "utf8")), before);
    assert.equal(writes.length, sent);
  }
});

test("granting a pass does not pause or restart a running sentence timer", async () => {
  const startedAt = Date.now();
  const created = await request("POST", "/api/prisoners", { ...values, paused: false, remainingSeconds: 600, przepustka: false });
  const id = created.data.record.id;
  const granted = await request("PATCH", `/api/prisoners/${id}`, { przepustka: true });
  assert.equal(granted.status, 200);
  assert.equal(granted.data.record.paused, false);
  const elapsed = Math.ceil((Date.now() - startedAt) / 1000);
  assert.ok(granted.data.record.remainingSeconds >= 600 - elapsed);
  assert.ok(granted.data.record.remainingSeconds <= 600);
  assert.notEqual(granted.data.record.remainingSeconds, 1800, "The nominal thirty-minute sentence must not replace the remaining time.");
});

test("older granted and missing-flag records remain usable when editing other fields", async () => {
  const granted = await request("PATCH", "/api/prisoners/O-001", { uwagi: "Zachowano starą przepustkę" });
  assert.equal(granted.status, 200);
  assert.equal(granted.data.record.przepustka, true);
  assert.equal(granted.data.record.remainingSeconds, 720);
  assert.equal(passField(cardWrites("O-001").at(-1)), "✅ Udzielona");
  const missing = await request("PATCH", "/api/prisoners/O-002", { uwagi: "Zachowano starszy wpis" });
  assert.equal(missing.status, 200);
  assert.equal(missing.data.record.przepustka, false);
  assert.equal(passField(cardWrites("O-002").at(-1)), "❌ Brak");
});

test("native approval updates the shared flag and prisoner card without queuing another panel event", async () => {
  const queued = read(outboxFile).events.length;
  const updates = [];
  const user = { id: "100000000000000603", toString() { return `<@${this.id}>`; } };
  const interaction = { customId: "przepustka_zgoda_P-001", user, guild,
    isChatInputCommand: () => false, isButton: () => true, isModalSubmit: () => false,
    memberPermissions: { has: () => true }, member: { roles: { cache: new Collection() } },
    async update(payload) { updates.push(payload); }, async reply(payload) { updates.push(payload); },
  };
  for (const handler of client.listeners("interactionCreate")) await handler(interaction);
  assert.equal(prisoner("O-002").przepustka, true);
  assert.equal(read(databaseFile).przepustki.find(item => item.id === "P-001").status, "zatwierdzona");
  assert.equal(passField(cardWrites("O-002").at(-1)), "✅ Udzielona");
  assert.equal(updates.length, 1);
  assert.match(updates[0].embeds[0].toJSON().title, /PRZEPUSTKA ZATWIERDZONA/);
  assert.equal(read(outboxFile).events.length, queued);
});

test("an offline pass change survives reload and publishes the retained state on reconnect", async () => {
  client.ready = false;
  const changed = await request("PATCH", "/api/prisoners/O-001", { przepustka: false });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.notification.status, "pending");
  const eventId = changed.data.notification.id;
  assert.equal(read(outboxFile).events.find(item => item.id === eventId).snapshot.przepustka, false);
  prisonerModule.stopTimers();
  await management.stop();
  client.removeAllListeners("interactionCreate");
  client.removeAllListeners("ready");
  client.removeAllListeners("shardResume");
  for (const name of ["../osadzeni", "../services/management"]) delete require.cache[require.resolve(name)];
  await start();
  assert.equal(prisoner("O-001").przepustka, false);
  assert.equal(read(outboxFile).events.find(item => item.id === eventId).state, "pending");
  client.ready = true;
  client.emit("shardResume", 0, 0);
  await until(() => read(outboxFile).events.find(item => item.id === eventId).state === "sent");
  assert.equal(passField(cardWrites("O-001").at(-1)), "❌ Brak");
  const state = await request("GET", "/api/state");
  assert.equal(state.data.collections.prisoners.find(item => item.id === "O-001").przepustka, false);
  const event = state.data.notifications.find(item => item.id === eventId);
  assert.equal(event.status, "sent");
});
