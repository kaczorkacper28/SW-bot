"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { once } = require("node:events");
const { spawnSync } = require("node:child_process");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-panel-test-"));
process.env.SW_DATA_DIR = dataDir;
process.env.MANAGEMENT_DATA_DIR = dataDir;
process.env.PANEL_DATA_DIR = dataDir;
process.env.OFFLINE = "1";
const guildId = "100000000000000700";
process.env.GUILD_ID = guildId;
delete process.env.TOKEN;
delete process.env.PANEL_PUBLIC_ORIGIN;
const dotenv = require("dotenv");
const originalDotenvConfig = dotenv.config;
let client;
try {
  dotenv.config = () => ({ parsed: {} });
  ({ client } = require("../index"));
} finally { dotenv.config = originalDotenvConfig; }
client.user = { id: "100000000000000701", tag: "Fixture#0001" };
// All lookups remain inside this fixture, including automatic change announcements.
client.guilds.cache.set(guildId, { id: guildId, channels: { cache: new Map(),
  fetch: async id => id ? client.channels.fetch(id) : new Map() } });
function publicationChannel(properties = {}) {
  return { id: "100000000000000799", guildId, type: 0, isTextBased: () => true,
    permissionsFor: () => ({ has: () => true }), ...properties };
}
const management = require("../services/management");
const { createPanelServer } = require("../panel/server");
let bridge, panel, cookie;
const password = crypto.randomBytes(24).toString("base64url");

function request(server, route, { method = "GET", body, raw, session = cookie, origin, headers = {} } = {}) {
  const port = server.address().port;
  const allHeaders = { "Content-Type": "application/json", ...headers };
  const payload = raw === undefined ? body === undefined ? undefined : JSON.stringify(body) : raw;
  if (payload !== undefined) allHeaders["Content-Length"] = Buffer.byteLength(payload);
  if (method !== "GET") allHeaders.Origin = origin === undefined ? `http://127.0.0.1:${port}` : origin;
  if (session) allHeaders.Cookie = session;
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: route, method, headers: allHeaders }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        try { resolve({ status: response.statusCode, data: text ? JSON.parse(text) : null, headers: response.headers }); }
        catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    req.end(payload);
  });
}

before(async () => {
  bridge = await management.startManagement({ client, port: 0 });
  panel = createPanelServer({ dataDir, bridgeDir: dataDir, bridgePort: bridge.address().port });
  panel.listen(0, "127.0.0.1");
  await once(panel, "listening");
});

after(async () => {
  if (panel) await new Promise(resolve => panel.close(resolve));
  await management.stop();
  await client.destroy();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("panel has no default account and both APIs protect private state", async () => {
  assert.equal((await request(panel, "/api/state", { session: "" })).status, 401);
  assert.equal((await request(bridge, "/api/state", { session: "" })).status, 401);
  assert.deepEqual((await request(panel, "/api/session", { session: "" })).data, { authenticated: false });
  assert.equal((await request(panel, "/api/login", { method: "POST", body: { username: "test-admin", password } })).status, 503);
  const setup = spawnSync(process.execPath, ["panel/setup-admin.js", "--username", "test-admin"], {
    cwd: path.join(__dirname, ".."), env: { ...process.env, PANEL_ADMIN_PASSWORD: "" }, input: `${password}\n`, encoding: "utf8",
  });
  assert.equal(setup.status, 0, setup.stderr);
  assert.ok(!setup.stdout.includes(password));
  const saved = fs.readFileSync(path.join(dataDir, "panel-users.json"), "utf8");
  assert.ok(!saved.includes(password));
  assert.equal(fs.statSync(path.join(dataDir, "panel-users.json")).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(dataDir, "panel-bridge.key")).mode & 0o777, 0o600);
});

test("login checks passwords and uses a private same-site session cookie", async () => {
  assert.equal((await request(panel, "/api/login", { method: "POST", body: { username: "test-admin", password: "wrong" } })).status, 401);
  assert.equal((await request(panel, "/api/login", { method: "POST", body: { username: "wrong", password } })).status, 401);
  const login = await request(panel, "/api/login", { method: "POST", body: { username: "test-admin", password } });
  assert.equal(login.status, 200);
  const value = login.headers["set-cookie"][0];
  assert.match(value, /HttpOnly/);
  assert.match(value, /SameSite=Strict/);
  cookie = value.split(";")[0];
  const session = (await request(panel, "/api/session")).data;
  assert.equal(session.authenticated,true);
  assert.equal(session.username,"test-admin");
  assert.equal(session.role,"admin");
  assert.equal(typeof session.id,"string");
  const state = await request(panel, "/api/state");
  assert.equal(state.status, 200);
  assert.equal(state.data.status.mode, "offline");
  assert.equal(state.data.status.online, false);
});

test("mutation requests require same origin and reject hostile hosts", async () => {
  assert.equal((await request(panel, "/api/reports", { method: "POST", body: { title: "Test" }, origin: "https://outside.example" })).status, 403);
  assert.equal((await request(panel, "/api/reports", { method: "POST", body: { title: "Test" }, origin: "" })).status, 403);
  assert.equal((await request(panel, "/api/state", { headers: { Host: "outside.example" } })).status, 400);
});

test("panel edits the bot's personnel and prisoner stores and retains them on disk", async () => {
  const id = "100000000000000701";
  const created = await request(panel, "/api/members", { method: "POST", body: { userId: id, name: "Anna Testowa", number: 701, rank: "Rekrut" } });
  assert.equal(created.status, 201);
  assert.equal((await request(panel, `/api/members/${id}`, { method: "PATCH", body: { rank: "Kapral", plus: 3 } })).status, 200);
  const stored = JSON.parse(fs.readFileSync(path.join(dataDir, "sw-data.json"), "utf8"));
  assert.equal(stored.members[id].rank, "Kapral");
  assert.equal(stored.members[id].plus, 3);
  const prisoner = await request(panel, "/api/prisoners", { method: "POST", body: { imie: "Jan Testowy", paragraf: "Art. 1", cela: "4", poczatek: "12:00", koniec: "12:30" } });
  assert.equal(prisoner.status, 201);
  assert.equal((await request(panel, `/api/prisoners/${prisoner.data.record.id}`, { method: "PATCH", body: { paused: true, cela: "5" } })).status, 200);
  const prisoners = JSON.parse(fs.readFileSync(path.join(dataDir, "osadzeni.json"), "utf8"));
  assert.equal(prisoners.osadzeni[0].cela, "5");
  assert.equal(prisoners.osadzeni[0].paused, true);
  assert.equal((await request(panel, `/api/members/${id}`, { method: "DELETE", body: {} })).status, 200);
  assert.equal((await request(panel, `/api/members/${id}`, { method: "DELETE", body: {} })).status, 404);
});

test("journal CRUD is validated, audited and reloadable in a new process", async () => {
  assert.equal((await request(panel, "/api/reports", { method: "POST", body: { title: "" } })).status, 400);
  assert.equal((await request(panel, "/api/reports", { method: "POST", body: { title: "Test", unknown: true } })).status, 400);
  assert.equal((await request(panel, "/api/payouts", { method: "POST", body: { recipient: "Test", amount: -10, reason: "Test" } })).status, 400);
  const created = await request(panel, "/api/reports", { method: "POST", body: { title: "Test raportu", author: "Anna", content: "Treść raportu" } });
  assert.equal(created.status, 201);
  const id = created.data.record.id;
  assert.equal(created.data.record.status, "nowy");
  assert.equal((await request(panel, `/api/reports/${id}`, { method: "PATCH", body: { status: "invented" } })).status, 400);
  assert.equal((await request(panel, `/api/reports/${id}`, { method: "PATCH", body: { status: "zatwierdzony" } })).status, 200);
  const stored = JSON.parse(fs.readFileSync(path.join(dataDir, "panel-records.json"), "utf8"));
  assert.equal(stored.reports.find(item => item.id === id).status, "zatwierdzony");
  assert.ok(stored.audit.some(item => item.resource === "reports" && item.action === "update" && item.actor === "test-admin"));
  const restore = spawnSync(process.execPath, ["-e", `const m=require('./services/management'); m.startManagement({port:0}).then(async s=>{ const fs=require('fs'),http=require('http'); http.get({host:'127.0.0.1',port:s.address().port,path:'/api/state',headers:{Authorization:'Bearer '+fs.readFileSync(process.env.SW_DATA_DIR+'/panel-bridge.key','utf8').trim()}},r=>{let b='';r.on('data',c=>b+=c);r.on('end',async()=>{console.log('RESTORED:'+b);await m.stop()})}) })`], {
    cwd: path.join(__dirname, ".."), env: process.env, encoding: "utf8", timeout: 10000,
  });
  assert.equal(restore.status, 0, restore.stderr);
  const restored = JSON.parse(restore.stdout.split("RESTORED:")[1]);
  assert.equal(restored.collections.reports.find(item => item.id === id).status, "zatwierdzony");
  assert.equal((await request(panel, `/api/reports/${id}`, { method: "DELETE", body: {} })).status, 200);
});

test("malformed, non-JSON and oversized requests fail clearly", async () => {
  assert.equal((await request(panel, "/api/reports", { method: "POST", raw: "{" })).status, 400);
  assert.equal((await request(panel, "/api/reports", { method: "POST", raw: "[]" })).status, 400);
  assert.equal((await request(panel, "/api/reports", { method: "POST", raw: '{"__proto__":{}}' })).status, 400);
  assert.equal((await request(panel, "/api/reports", { method: "POST", body: {}, headers: { "Content-Type": "text/plain" } })).status, 415);
  assert.equal((await request(panel, "/api/reports", { method: "POST", body: { title: "x", content: "x".repeat(70000) } })).status, 413);
});

test("publishing requires online bot, sends once, and blocks uncertain retries", async () => {
  const first = management.record("reports", { title: "Raport do publikacji", content: "Treść" });
  assert.equal((await request(panel, "/api/actions/publish", { method: "POST", body: { resource: "reports", id: first.id } })).status, 503);
  const originalReady = client.isReady;
  const originalFetch = client.channels.fetch;
  let sends = 0;
  let payload;
  client.isReady = () => true;
  process.env.REPORT_CHANNEL_ID = "100000000000000800";
  client.channels.fetch = async () => publicationChannel({ async send(value) { sends++; payload = value; return { id: "100000000000000801" }; } });
  try {
    const results = await Promise.all([1, 2].map(() => request(panel, "/api/actions/publish", { method: "POST", body: { resource: "reports", id: first.id } })));
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    assert.equal(sends, 1);
    assert.deepEqual(payload.allowedMentions, { parse: [] });
    const reportEmbed = payload.embeds[0].toJSON();
    assert.equal(reportEmbed.title, "📋 NOWY RAPORT SŁUŻBOWY");
    assert.equal(reportEmbed.fields.find(field => field.name === "📝 Przebieg służby").value, "Treść");
    const stored = JSON.parse(fs.readFileSync(path.join(dataDir, "panel-records.json"), "utf8"));
    assert.equal(stored.reports.find(item => item.id === first.id).discordMessageId, "100000000000000801");
    const uncertain = management.record("reports", { title: "Brak potwierdzenia", content: "Treść" });
    client.channels.fetch = async () => publicationChannel({ async send() { sends++; throw new Error("Simulated uncertain delivery"); } });
    assert.equal((await request(panel, "/api/actions/publish", { method: "POST", body: { resource: "reports", id: uncertain.id } })).status, 502);
    assert.equal((await request(panel, "/api/actions/publish", { method: "POST", body: { resource: "reports", id: uncertain.id } })).status, 409);
    assert.equal(sends, 2);
    const disk = JSON.parse(fs.readFileSync(path.join(dataDir, "panel-records.json"), "utf8"));
    assert.equal(disk.reports.find(item => item.id === uncertain.id).publishState, "uncertain");
  } finally {
    client.isReady = originalReady;
    client.channels.fetch = originalFetch;
    delete process.env.REPORT_CHANNEL_ID;
  }
});

test("full publication rejects channels outside the configured server", async () => {
  const originalReady = client.isReady;
  const originalFetch = client.channels.fetch;
  const previousChannel = process.env.REPORT_CHANNEL_ID;
  let sends = 0;
  client.isReady = () => true;
  process.env.REPORT_CHANNEL_ID = "100000000000000805";
  client.channels.fetch = async () => publicationChannel({ guildId: "100000000000000999", async send() { sends++; } });
  try {
    const item = management.record("reports", { title: "Raport prywatnego serwera", content: "Dane testowe" });
    const result = await request(panel, "/api/actions/publish", { method: "POST", body: { resource: "reports", id: item.id } });
    assert.equal(result.status, 503);
    assert.match(result.data.error, /GUILD_ID/);
    assert.equal(sends, 0);
    const stored = JSON.parse(fs.readFileSync(path.join(dataDir, "panel-records.json"), "utf8")).reports.find(entry => entry.id === item.id);
    assert.equal(stored.publishState, undefined);
    assert.equal(stored.discordMessageId, undefined);
  } finally {
    client.isReady = originalReady;
    client.channels.fetch = originalFetch;
    if (previousChannel === undefined) delete process.env.REPORT_CHANNEL_ID; else process.env.REPORT_CHANNEL_ID = previousChannel;
  }
});

test("Discord journal updates preserve document content and creation date", () => {
  const first = management.record("documents", { id: "test-ticket", title: "Wniosek", content: "Treść", status: "nowy" });
  const second = management.record("documents", { id: "test-ticket", status: "zatwierdzony" });
  assert.equal(second.title, first.title);
  assert.equal(second.createdAt, first.createdAt);
  const disk = JSON.parse(fs.readFileSync(path.join(dataDir, "panel-records.json"), "utf8"));
  assert.equal(disk.documents.filter(item => item.id === "test-ticket").length, 1);
});

test("pending publication blocks edits and deletion until its confirmation is persisted", async () => {
  const originalReady = client.isReady;
  const originalFetch = client.channels.fetch;
  const originalChannel = process.env.REPORT_CHANNEL_ID;
  let started;
  let confirm;
  const sending = new Promise(resolve => { started = resolve; });
  const acknowledgement = new Promise(resolve => { confirm = resolve; });
  client.isReady = () => true;
  process.env.REPORT_CHANNEL_ID = "100000000000000820";
  const announcementIds = [];
  client.channels.fetch = async () => publicationChannel({ send(payload) {
    if (String(payload.embeds[0].data?.title || payload.embeds[0].title).startsWith("Panel SW •")) {
      const embed = payload.embeds[0].data || payload.embeds[0];
      announcementIds.push(embed.fields.find(field => field.name === "Identyfikator wpisu").value);
      return Promise.resolve({ id: "100000000000000822" });
    }
    started(); return acknowledgement;
  } });
  let publishing;
  try {
    const item = management.record("reports", { title: "Raport oczekujący", content: "Oryginalna treść" });
    publishing = request(panel, "/api/actions/publish", { method: "POST", body: { resource: "reports", id: item.id } });
    await sending;
    assert.equal((await request(panel, `/api/reports/${item.id}`, { method: "PATCH", body: { content: "Zmieniona treść" } })).status, 409);
    assert.equal((await request(panel, `/api/reports/${item.id}`, { method: "DELETE", body: {} })).status, 409);
    let stored = JSON.parse(fs.readFileSync(path.join(dataDir, "panel-records.json"), "utf8")).reports.find(entry => entry.id === item.id);
    assert.equal(stored.publishState, "pending");
    assert.equal(stored.content, "Oryginalna treść");
    confirm({ id: "100000000000000821" });
    assert.equal((await publishing).status, 200);
    stored = JSON.parse(fs.readFileSync(path.join(dataDir, "panel-records.json"), "utf8")).reports.find(entry => entry.id === item.id);
    assert.equal(stored.publishState, "published");
    assert.equal(stored.discordMessageId, "100000000000000821");
    assert.equal((await request(panel, `/api/reports/${item.id}`, { method: "PATCH", body: { status: "zatwierdzony" } })).status, 200);
    assert.equal(announcementIds.filter(id => id === item.id).length, 1);
  } finally {
    confirm({ id: "100000000000000821" });
    if (publishing) await publishing;
    client.isReady = originalReady;
    client.channels.fetch = originalFetch;
    if (originalChannel === undefined) delete process.env.REPORT_CHANNEL_ID; else process.env.REPORT_CHANNEL_ID = originalChannel;
  }
});

test("publication aborts when a record is edited or deleted during channel lookup", async () => {
  const originalReady = client.isReady;
  const originalFetch = client.channels.fetch;
  const originalChannel = process.env.REPORT_CHANNEL_ID;
  client.isReady = () => true;
  process.env.REPORT_CHANNEL_ID = "100000000000000830";
  let sends = 0;
  let announcements = 0;
  const channel = publicationChannel({ async send(payload) {
    if (String(payload.embeds[0].data?.title || payload.embeds[0].title).startsWith("Panel SW •")) announcements++;
    else sends++;
    return { id: "100000000000000831" };
  } });
  try {
    for (const method of ["PATCH", "DELETE"]) {
      let started;
      let finish;
      const fetching = new Promise(resolve => { started = resolve; });
      const lookup = new Promise(resolve => { finish = resolve; });
      client.channels.fetch = () => { started(); return lookup; };
      const item = management.record("reports", { title: `Raport ${method}`, content: "Oryginalna treść" });
      const publishing = request(panel, "/api/actions/publish", { method: "POST", body: { resource: "reports", id: item.id } });
      try {
        await fetching;
        assert.equal((await request(panel, `/api/reports/${item.id}`, { method, body: method === "PATCH" ? { content: "Zmieniona treść" } : {} })).status, 200);
      } finally { finish(channel); }
      assert.equal((await publishing).status, 409);
      const stored = JSON.parse(fs.readFileSync(path.join(dataDir, "panel-records.json"), "utf8")).reports.find(entry => entry.id === item.id);
      if (method === "PATCH") {
        assert.equal(stored.content, "Zmieniona treść");
        assert.equal(stored.publishState, undefined);
      } else assert.equal(stored, undefined);
    }
    assert.equal(sends, 0);
    assert.equal(announcements, 2);
  } finally {
    client.isReady = originalReady;
    client.channels.fetch = originalFetch;
    if (originalChannel === undefined) delete process.env.REPORT_CHANNEL_ID; else process.env.REPORT_CHANNEL_ID = originalChannel;
  }
});

test("published proposals retain the Discord voting contract", async () => {
  const originalReady = client.isReady;
  const originalFetch = client.channels.fetch;
  const reactions = [];
  let payload;
  client.isReady = () => true;
  process.env.PROPOSALS_CHANNEL_ID = "100000000000000810";
  client.channels.fetch = async () => publicationChannel({ async send(value) {
    payload = value;
    return { id: "100000000000000811", async react(emoji) { reactions.push(emoji); } };
  } });
  try {
    const proposal = management.record("proposals", { title: "Szkolenia", content: "Propozycja szkolenia kadry." });
    const result = await request(panel, "/api/actions/publish", { method: "POST", body: { resource: "proposals", id: proposal.id } });
    assert.equal(result.status, 200);
    assert.equal(result.data.record.votingState, "ready");
    assert.equal(payload.embeds[0].title, "💡 Nowa propozycja");
    assert.deepEqual(reactions, ["🟢", "🟡", "🔴"]);
  } finally {
    client.isReady = originalReady;
    client.channels.fetch = originalFetch;
    delete process.env.PROPOSALS_CHANNEL_ID;
  }
});

test("corrupt journals are preserved and stop startup", () => {
  for (const content of ["{broken", "[]", '{"reports":{}}']) {
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "sw-journal-corrupt-"));
    const filename = path.join(isolated, "panel-records.json");
    fs.writeFileSync(filename, content);
    try {
      const result = spawnSync(process.execPath, ["-e", "require('./services/management')"], {
        cwd: path.join(__dirname, ".."), env: { ...process.env, SW_DATA_DIR: isolated, MANAGEMENT_DATA_DIR: isolated }, encoding: "utf8",
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /panel-records.json/);
      assert.match(result.stderr, /zachowano bez zmian/);
      assert.equal(fs.readFileSync(filename, "utf8"), content);
    } finally { fs.rmSync(isolated, { recursive: true, force: true }); }
  }
});

test("logout invalidates the session and repeated failed logins are limited", async () => {
  assert.equal((await request(panel, "/api/logout", { method: "POST", body: {} })).status, 200);
  assert.deepEqual((await request(panel, "/api/session")).data, { authenticated: false });
  assert.equal((await request(panel, "/api/state")).status, 401);
  for (let index = 0; index < 10; index++) assert.equal((await request(panel, "/api/login", { method: "POST", body: { username: "test-admin", password: "wrong" } })).status, 401);
  assert.equal((await request(panel, "/api/login", { method: "POST", body: { username: "test-admin", password } })).status, 429);
});
