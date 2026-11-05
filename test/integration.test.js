const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { once } = require("node:events");
const { spawnSync } = require("node:child_process");
const { Collection, GatewayIntentBits, Partials } = require("discord.js");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-integration-"));
process.env.SW_DATA_DIR = dataDir;
process.env.MANAGEMENT_DATA_DIR = dataDir;
process.env.OFFLINE = "1";
process.env.GUILD_ID = "100000000000000001";
process.env.CLIENT_ID = "100000000000000002";
process.env.ROLE_ID = "100000000000000003";
delete process.env.TOKEN;
delete process.env.UNB_API_TOKEN;
delete process.env.MAIN_GUILD_ID;
delete process.env.LOG_CHANNEL_ID;

const { client, commands } = require("../index");
const management = require("../services/management");
client.channels.fetch = async () => null;
const originalFetch = global.fetch;
global.fetch = async () => { throw new Error("Unexpected network request in offline integration test"); };

function serialize(payload) {
  if (payload && typeof payload === "object") {
    for (const key of ["embeds", "components"]) {
      for (const item of payload[key] || []) if (typeof item.toJSON === "function") item.toJSON();
    }
  }
  return payload;
}

function interaction(commandName, { admin = false, values = {}, type = "command", customId } = {}) {
  const replies = [], sent = [], modals = [];
  const user = { id: "100000000000000010", bot: false, toString() { return `<@${this.id}>`; } };
  const channel = {
    id: "100000000000000020", type: 0, name: "┃propozycje",
    isTextBased: () => true,
    async send(payload) {
      sent.push(serialize(payload));
      return { id: "100000000000000030", channelId: channel.id, react: async () => {} };
    }
  };
  const item = {
    commandName, customId, guildId: process.env.GUILD_ID, user,
    memberPermissions: { has: () => admin },
    member: { roles: { cache: new Collection() } },
    channel,
    guild: {
      id: process.env.GUILD_ID,
      channels: { cache: new Collection([[channel.id, channel]]), fetch: async () => channel }
    },
    isChatInputCommand: () => type === "command",
    isButton: () => type === "button",
    isModalSubmit: () => type === "modal",
    isStringSelectMenu: () => type === "select",
    options: {
      getUser: key => values[key] || null,
      getString: key => values[key] || null,
      getInteger: key => values[key] ?? null,
      getChannel: key => values[key] || null
    },
    fields: { getTextInputValue: key => values[key] || "Przykładowa propozycja rozwoju służby" },
    async reply(payload) { replies.push(serialize(payload)); item.replied = true; },
    async deferReply() { item.deferred = true; },
    async editReply(payload) { replies.push(serialize(payload)); },
    async update(payload) { replies.push(serialize(payload)); item.replied = true; },
    async fetchReply() { return { id: "100000000000000030", channelId: channel.id }; },
    async showModal(modal) { modals.push(modal.toJSON()); },
    replies, sent, modals
  };
  return item;
}

async function dispatch(item) {
  for (const handler of client.listeners("interactionCreate")) await handler(item);
  return item;
}

after(async () => {
  global.fetch = originalFetch;
  await management.stop();
  await client.destroy();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("one client registers every SW module without duplicate slash commands", () => {
  const names = commands.map(command => command.name);
  assert.equal(names.length, new Set(names).size);
  for (const name of [
    "sw-dodaj", "sw-awans", "sw-kadra", "sw-plus", "sw-minus", "sw-nagana",
    "osadzony-dodaj", "osadzeni", "przepustka", "przepustki", "wezwanie",
    "raport-panel", "stopnie-dodaj", "stopnie-lista", "setup-dokumenty",
    "panel-propozycje", "sw-wyplata"
  ]) assert.ok(names.includes(name), `Missing command ${name}`);
  assert.ok(client.options.intents.has(GatewayIntentBits.Guilds));
  assert.ok(client.options.intents.has(GatewayIntentBits.GuildMessageReactions));
  for (const partial of [Partials.Message, Partials.Channel, Partials.Reaction])
    assert.ok(client.options.partials.includes(partial));
  assert.ok(client.listeners("interactionCreate").length >= 8);
  assert.equal(client.isReady(), false);
});

test("all modules ignore interactions belonging to another module", async () => {
  for (const type of ["command", "button", "modal", "select"]) {
    const result = await dispatch(interaction("unrelated-command", { type, customId: "unrelated-control" }));
    assert.equal(result.replies.length, 0, `${type} was intercepted`);
    assert.equal(result.sent.length, 0);
    assert.equal(result.modals.length, 0);
  }
});

test("sensitive commands each reject an unauthorized user exactly once", async () => {
  for (const name of ["sw-dodaj", "sw-awans", "stopnie-dodaj", "osadzony-dodaj", "raport-panel", "setup-dokumenty", "panel-propozycje", "wezwanie"]) {
    const result = await dispatch(interaction(name));
    assert.equal(result.replies.length, 1, name);
    assert.match(result.replies[0].content, /uprawni|dostępu/i, name);
    assert.equal(result.sent.length, 0, name);
  }
});

test("report command builds a valid panel and opens the report form", async () => {
  const panel = await dispatch(interaction("raport-panel", { admin: true }));
  assert.equal(panel.sent.length, 1);
  assert.equal(panel.replies.length, 1);
  assert.equal(panel.sent[0].embeds[0].data.title, "📋 RAPORTY SŁUŻBOWE");
  const form = await dispatch(interaction(undefined, { type: "button", customId: "zloz_raport" }));
  assert.equal(form.modals.length, 1);
  assert.equal(form.modals[0].custom_id, "formularz_raportu");
});

test("personnel add and promotion persist in the shared data directory", async () => {
  const target = { id: "100000000000000100", toString() { return `<@${this.id}>`; } };
  const added = await dispatch(interaction("sw-dodaj", { admin: true, values: { osoba: target, numer: 12, ranga: "Rekrut" } }));
  assert.equal(added.replies.length, 1);
  assert.ok(added.replies[0].embeds, "Personnel creation did not succeed");
  const promoted = await dispatch(interaction("sw-awans", { admin: true, values: { osoba: target, powod: "Test integracyjny" } }));
  assert.equal(promoted.replies.length, 1);
  const stored = JSON.parse(fs.readFileSync(path.join(dataDir, "sw-data.json"), "utf8"));
  assert.equal(stored.members[target.id].rank, "Szeregowy");
  assert.equal(stored.members[target.id].number, 12);
});

test("prisoner registry validates time and persists a new prisoner", async () => {
  const values = { imie: "Jan Testowy", paragraf: "Art. 1", wyrok: "30 minut", poczatek: "12:00", koniec: "12:30", cela: "1" };
  const invalid = await dispatch(interaction("osadzony-dodaj", { admin: true, values: { ...values, poczatek: "25:00" } }));
  assert.match(invalid.replies[0].content, /Nieprawidłowy początek/);
  const added = await dispatch(interaction("osadzony-dodaj", { admin: true, values }));
  assert.equal(added.replies.length, 1);
  assert.ok(added.replies[0].embeds);
  const stored = JSON.parse(fs.readFileSync(path.join(dataDir, "osadzeni.json"), "utf8"));
  assert.equal(stored.osadzeni.length, 1);
  assert.equal(stored.osadzeni[0].imie, values.imie);
  assert.equal(stored.osadzeni[0].remainingSeconds, 1800);
});

test("employee can pause a prisoner timer but cannot change its duration", async () => {
  const pause = interaction(undefined, { type: "button", customId: "kara_pause_O-001" });
  pause.member.roles.cache.set("employee", { name: "Pracownik SW" });
  await dispatch(pause);
  assert.equal(pause.replies.length, 1);
  assert.ok(pause.replies[0].embeds);
  const stored = JSON.parse(fs.readFileSync(path.join(dataDir, "osadzeni.json"), "utf8"));
  assert.equal(stored.osadzeni[0].paused, true);
  const change = interaction(undefined, { type: "button", customId: "kara_add_O-001" });
  change.member.roles.cache.set("employee", { name: "Pracownik SW" });
  await dispatch(change);
  assert.equal(change.replies.length, 1);
  assert.match(change.replies[0].content, /uprawnień/);
  assert.equal(change.modals.length, 0);
});

test("rank list uses its own commands and durable store", async () => {
  const target = { id: "100000000000000200", toString() { return `<@${this.id}>`; } };
  const added = await dispatch(interaction("stopnie-dodaj", { admin: true, values: { osoba: target, dzial: "pracownicy", numer: 15 } }));
  assert.equal(added.replies.length, 1);
  assert.match(added.replies[0].content, /Dodano/);
  const stored = JSON.parse(fs.readFileSync(path.join(dataDir, "sw-stopnie.json"), "utf8"));
  assert.deepEqual(stored.sections.pracownicy, [{ userId: target.id, number: 15 }]);
  const list = await dispatch(interaction("stopnie-lista", { admin: true }));
  assert.equal(list.replies.length, 1);
  assert.ok(list.replies[0].embeds);
});

test("proposal form posts a valid proposal and initializes voting", async () => {
  const form = await dispatch(interaction(undefined, { type: "button", customId: "sw_proposal_create" }));
  assert.equal(form.modals.length, 1);
  const created = await dispatch(interaction(undefined, { type: "modal", customId: "sw_proposal_modal" }));
  assert.equal(created.sent.length, 1);
  assert.equal(created.sent[0].embeds[0].data.title, "💡 Nowa propozycja");
  assert.deepEqual(created.sent[0].allowedMentions, { parse: [] });
  assert.match(created.replies[0].content, /została dodana/);
});

test("proposal voting removes earlier votes only on this bot's proposal messages", async () => {
  const removed = [];
  const botId = "100000000000000500";
  Object.defineProperty(client, "user", { configurable: true, value: { id: botId } });
  const message = {
    guild: {}, author: { id: botId }, embeds: [{ title: "💡 Nowa propozycja" }],
    reactions: { cache: new Collection(["🟢", "🟡", "🔴"].map(emoji => [emoji, {
      emoji: { name: emoji }, users: { remove: async userId => removed.push([emoji, userId]) }
    }])) }
  };
  const reaction = { emoji: { name: "🟡" }, message };
  const handler = client.listeners("messageReactionAdd")[0];
  await handler(reaction, { id: "voter", bot: false });
  assert.deepEqual(removed, [["🟢", "voter"], ["🔴", "voter"]]);
  removed.length = 0;
  await handler({ ...reaction, message: { ...message, author: { id: "another-bot" } } }, { id: "voter", bot: false });
  await handler({ ...reaction, message: { ...message, embeds: [{ title: "Unrelated message" }] } }, { id: "voter", bot: false });
  await handler(reaction, { id: "bot-voter", bot: true });
  assert.equal(removed.length, 0);
});

test("payout rejects another server and missing economy configuration before calling its API", async () => {
  const wrongGuild = interaction("sw-wyplata", { admin: true });
  wrongGuild.guildId = "another-guild";
  await dispatch(wrongGuild);
  assert.equal(wrongGuild.replies.length, 1);
  assert.match(wrongGuild.replies[0].content, /tylko na serwerze SW/);
  const missing = await dispatch(interaction("sw-wyplata", { admin: true }));
  assert.equal(missing.replies.length, 1);
  assert.match(missing.replies[0].content, /Brakuje konfiguracji/);
});

test("management API authenticates requests and edits the bot's live data with validation", async () => {
  const server = await management.startManagement({ client, port: 0 });
  if (!server.listening) await once(server, "listening");
  const key = fs.readFileSync(path.join(dataDir, "panel-bridge.key"), "utf8").trim();
  const request = (method, route, body, authenticated = true) => new Promise((resolve, reject) => {
    const headers = { "Content-Type": "application/json" };
    if (authenticated) headers.Authorization = `Bearer ${key}`;
    const req = http.request({ host: "127.0.0.1", port: server.address().port, path: route, method, headers }, res => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { text += chunk; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(text) }); }
        catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  try {
    assert.equal((await request("GET", "/api/state", undefined, false)).status, 401);
    const initial = await request("GET", "/api/state");
    assert.equal(initial.status, 200);
    assert.ok(initial.data.collections.members.some(member => member.number === 12));
    assert.equal(initial.data.collections.prisoners[0].imie, "Jan Testowy");

    const userId = "100000000000000901";
    const member = await request("POST", "/api/members", { userId, number: 51, name: "Panel Test", rank: "Rekrut" });
    assert.equal(member.status, 201);
    assert.equal(member.data.record.id, userId);
    assert.equal((await request("POST", "/api/members", { userId: "100000000000000902", number: 51 })).status, 409);
    assert.equal((await request("PATCH", `/api/members/${userId}`, { rank: "Invented rank" })).status, 400);
    assert.equal((await request("PATCH", `/api/members/${userId}`, { rank: "Kapral", plus: 5 })).status, 200);
    const storedMember = JSON.parse(fs.readFileSync(path.join(dataDir, "sw-data.json"), "utf8")).members[userId];
    assert.equal(storedMember.rank, "Kapral");
    assert.equal(storedMember.plus, 5);
    const memberInfo = await dispatch(interaction("sw-info", {
      admin: true, values: { osoba: { id: userId, toString() { return `<@${this.id}>`; } } }
    }));
    assert.equal(memberInfo.replies.length, 1);
    assert.match(JSON.stringify(memberInfo.replies[0].embeds[0].toJSON()), /Kapral/);

    assert.equal((await request("POST", "/api/ranks", { userId, section: "rekruci", number: 51 })).status, 201);
    assert.equal((await request("PATCH", `/api/ranks/${userId}`, { section: "szefostwo" })).status, 200);
    assert.equal((await request("PATCH", `/api/ranks/${userId}`, { section: "unknown" })).status, 400);
    const storedRanks = JSON.parse(fs.readFileSync(path.join(dataDir, "sw-stopnie.json"), "utf8"));
    assert.ok(storedRanks.sections.szefostwo.some(item => item.userId === userId));
    const rankList = await dispatch(interaction("stopnie-lista", { admin: true }));
    assert.ok(JSON.stringify(rankList.replies[0].embeds[0].toJSON()).includes(userId));

    const prisoner = await request("POST", "/api/prisoners", { imie: "Panel Osadzony", paragraf: "Art. 2", cela: "3", poczatek: "23:50", koniec: "00:20" });
    assert.equal(prisoner.status, 201);
    const prisonerId = prisoner.data.record.id;
    assert.equal(prisoner.data.record.remainingSeconds, 1800);
    assert.equal((await request("PATCH", `/api/prisoners/${prisonerId}`, { cela: "4", paused: true })).status, 200);
    assert.equal((await request("PATCH", `/api/prisoners/${prisonerId}`, { poczatek: "99:00" })).status, 400);
    const final = await request("GET", "/api/state");
    assert.equal(final.data.collections.prisoners.find(item => item.id === prisonerId).cela, "4");
    assert.equal(final.data.collections.prisoners.find(item => item.id === prisonerId).paused, true);
    const prisonerInfo = await dispatch(interaction("osadzony-info", { admin: true, values: { id: prisonerId } }));
    assert.match(JSON.stringify(prisonerInfo.replies[0].embeds[0].toJSON()), /Panel Osadzony/);
    assert.ok(final.data.collections.audit.length > 0);
    assert.equal((await request("DELETE", `/api/members/${userId}`)).status, 200);
    assert.equal((await request("DELETE", `/api/members/${userId}`)).status, 404);
  } finally {
    await management.stop();
  }
});

test("startup preserves corrupt databases and fails with a useful error", () => {
  for (const [filename, content] of [
    ["sw-data.json", "{broken"],
    ["osadzeni.json", JSON.stringify({ osadzeni: {}, przepustki: [], nextId: 1 })],
    ["sw-stopnie.json", "{broken"]
  ]) {
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "sw-corrupt-"));
    const target = path.join(isolated, filename);
    fs.writeFileSync(target, content);
    try {
      const result = spawnSync(process.execPath, ["-e", "require('./index')"], {
        cwd: path.join(__dirname, ".."), encoding: "utf8",
        env: { ...process.env, SW_DATA_DIR: isolated, MANAGEMENT_DATA_DIR: isolated }
      });
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0, filename);
      assert.ok(result.stderr.includes(filename), `Missing database name in error for ${filename}`);
      assert.match(result.stderr, /zachowano bez zmian/);
      assert.equal(fs.readFileSync(target, "utf8"), content);
    } finally {
      fs.rmSync(isolated, { recursive: true, force: true });
    }
  }
});
