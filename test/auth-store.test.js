"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { createAuthStore } = require("../panel/auth-store");

const password = "Temporary fixture password 123!";
const changedPassword = "Different fixture password 456!";

function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-auth-store-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  return { dataDir, store: createAuthStore({ dataDir }) };
}

function stored(dataDir) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, "panel-users.json"), "utf8"));
}

function assertPublic(user) {
  assert.deepEqual(Object.keys(user).sort(), ["active", "createdAt", "id", "role", "updatedAt", "username"].sort());
  assert.equal(typeof user.id, "string");
  assert.equal(typeof user.createdAt, "string");
  assert.equal(typeof user.updatedAt, "string");
}

function conflict(operation) {
  assert.throws(operation, error => error.status === 409);
}

test("legacy administrator migrates once without changing its password hash or source file", async t => {
  const { dataDir, store } = fixture(t);
  const salt = crypto.randomBytes(32).toString("hex");
  const passwordHash = crypto.scryptSync(password, salt, 32).toString("hex");
  const original = JSON.stringify({ username: "LegacyAdmin", salt, passwordHash, updatedAt: "2026-01-01T00:00:00.000Z" }, null, 2);
  fs.writeFileSync(path.join(dataDir, "panel-admin.json"), original);

  assert.equal(store.hasUsers(), true);
  const users = store.listUsers();
  assert.equal(users.length, 1);
  assertPublic(users[0]);
  assert.equal(users[0].username, "LegacyAdmin");
  assert.equal(users[0].role, "admin");
  assert.equal(users[0].active, true);
  const saved = stored(dataDir);
  assert.equal(saved.schemaVersion, 1);
  assert.equal(saved.users[0].salt, salt);
  assert.equal(saved.users[0].passwordHash, passwordHash);
  assert.equal(fs.readFileSync(path.join(dataDir, "panel-admin.json"), "utf8"), original);
  assert.equal(fs.statSync(path.join(dataDir, "panel-users.json")).mode & 0o777, 0o600);
  const login = await store.authenticate("legacyadmin", password);
  assert.equal(login.id, users[0].id);
  assert.equal(typeof login.version, "number");
  assert.equal(Object.hasOwn(login, "salt"), false);
  assert.equal(Object.hasOwn(login, "passwordHash"), false);
});

test("authoritative user store prevents a stale legacy password or account from being used", async t => {
  const { dataDir, store } = fixture(t);
  const legacySalt = crypto.randomBytes(32).toString("hex");
  const legacy = { username: "first-admin", salt: legacySalt, passwordHash: crypto.scryptSync(password, legacySalt, 32).toString("hex") };
  const legacyPath = path.join(dataDir, "panel-admin.json");
  fs.writeFileSync(legacyPath, JSON.stringify(legacy));
  const admin = store.listUsers()[0];
  store.updateUser(admin.id, { password: changedPassword });
  assert.equal(await store.authenticate(admin.username, password), null);
  assert.ok(await store.authenticate(admin.username, changedPassword));
  fs.writeFileSync(legacyPath, JSON.stringify({ ...legacy, username: "stale-fallback" }));
  const restarted = createAuthStore({ dataDir });
  assert.equal(await restarted.authenticate("stale-fallback", password), null);
  assert.equal(restarted.listUsers().length, 1);
  assert.equal(restarted.listUsers()[0].username, "first-admin");
});

test("individual account creation validates roles and usernames and never exposes password material", async t => {
  const { dataDir, store } = fixture(t);
  store.upsertAdmin({ username: "admin", password });
  const operator = store.createUser({ username: "Operator", password });
  const viewer = store.createUser({ username: "viewer", password, role: "viewer" });
  assertPublic(operator);
  assertPublic(viewer);
  assert.equal(operator.role, "operator");
  assert.equal(viewer.role, "viewer");
  assert.equal(operator.active, true);
  conflict(() => store.createUser({ username: "operator", password }));
  for (const input of [
    { username: "a", password },
    { username: "bad name", password },
    { username: "short-password", password: "short" },
    { username: "invalid-role", password, role: "owner" }
  ]) assert.throws(() => store.createUser(input), error => error.status === 400);
  const json = JSON.stringify(store.listUsers());
  assert.equal(json.includes(password), false);
  assert.equal(json.includes("passwordHash"), false);
  assert.equal(json.includes("salt"), false);
  const saved = stored(dataDir);
  assert.equal(saved.users.length, 3);
  assert.equal(JSON.stringify(saved).includes(password), false);
  const salts = saved.users.map(user => user.salt);
  assert.equal(new Set(salts).size, salts.length);
  assert.equal((await store.authenticate("OPERATOR", password)).id, operator.id);
  assert.equal(await store.authenticate("does-not-exist", password), null);
  assert.equal(await store.authenticate("Operator", "incorrect"), null);
});

test("password reset, role change, deactivation and deletion invalidate existing sessions", async t => {
  const { store } = fixture(t);
  store.upsertAdmin({ username: "admin", password });
  const user = store.createUser({ username: "employee", password });
  let authenticated = await store.authenticate(user.username, password);
  const initialSession = { userId: authenticated.id, version: authenticated.version };
  assert.equal(store.getSessionUser(initialSession).role, "operator");

  store.updateUser(user.id, { password: changedPassword });
  assert.equal(store.getSessionUser(initialSession), null);
  assert.equal(await store.authenticate(user.username, password), null);
  authenticated = await store.authenticate(user.username, changedPassword);
  const passwordSession = { userId: authenticated.id, version: authenticated.version };
  store.updateUser(user.id, { role: "viewer" });
  assert.equal(store.getSessionUser(passwordSession), null);
  authenticated = await store.authenticate(user.username, changedPassword);
  const viewerSession = { userId: authenticated.id, version: authenticated.version };
  assert.equal(store.getSessionUser(viewerSession).role, "viewer");
  store.updateUser(user.id, { active: false });
  assert.equal(store.getSessionUser(viewerSession), null);
  assert.equal(await store.authenticate(user.username, changedPassword), null);
  store.updateUser(user.id, { active: true });
  assert.equal(store.getSessionUser(viewerSession), null);
  authenticated = await store.authenticate(user.username, changedPassword);
  store.deleteUser(user.id);
  assert.equal(store.getSessionUser({ userId: authenticated.id, version: authenticated.version }), null);
});

test("last active administrator and caller's own account cannot be removed or deactivated", t => {
  const { store } = fixture(t);
  const first = store.upsertAdmin({ username: "first-admin", password });
  conflict(() => store.updateUser(first.id, { role: "viewer" }));
  conflict(() => store.updateUser(first.id, { active: false }));
  conflict(() => store.deleteUser(first.id));
  const second = store.createUser({ username: "second-admin", password, role: "admin" });
  conflict(() => store.updateUser(first.id, { active: false }, { actorId: first.id }));
  conflict(() => store.deleteUser(first.id, { actorId: first.id }));
  store.updateUser(first.id, { role: "operator" }, { actorId: second.id });
  assert.equal(store.listUsers().find(user => user.id === first.id).role, "operator");
  conflict(() => store.updateUser(second.id, { active: false }, { actorId: first.id }));
  store.deleteUser(first.id, { actorId: second.id });
  assert.deepEqual(store.listUsers().map(user => user.username), ["second-admin"]);
});

test("a password reset during an in-flight login does not issue a stale authenticated session", async t => {
  const { store } = fixture(t);
  store.upsertAdmin({ username: "admin", password });
  const user = store.createUser({ username: "in-flight-user", password });
  const pendingLogin = store.authenticate(user.username, password);
  store.updateUser(user.id, { password: changedPassword });
  assert.equal(await pendingLogin, null);
  assert.ok(await store.authenticate(user.username, changedPassword));
});

test("CLI administrator upsert and prehashed setup preserve other users", async t => {
  const { dataDir, store } = fixture(t);
  const admin = store.upsertAdmin({ username: "admin", password });
  const operator = store.createUser({ username: "operator", password });
  const viewer = store.createUser({ username: "viewer", password, role: "viewer" });
  const previous = stored(dataDir).users.filter(user => user.id !== admin.id);
  const reset = store.upsertAdmin({ username: "ADMIN", password: changedPassword });
  assert.equal(reset.id, admin.id);
  assert.equal(reset.role, "admin");
  assert.equal(await store.authenticate("admin", password), null);
  assert.ok(await store.authenticate("admin", changedPassword));
  const salt = crypto.randomBytes(32).toString("hex");
  const passwordHash = crypto.scryptSync(password, salt, 32).toString("hex");
  const extra = store.upsertAdminHash({ username: "recovery-admin", salt, passwordHash });
  assert.equal(extra.role, "admin");
  assert.ok(await store.authenticate("recovery-admin", password));
  assert.deepEqual(stored(dataDir).users.filter(user => [operator.id, viewer.id].includes(user.id)), previous);
  assert.equal(store.listUsers().length, 4);
  assert.equal(fs.readdirSync(dataDir).some(name => name.endsWith(".tmp")), false);
});

test("corrupt user stores fail without overwriting data or falling back to a legacy administrator", t => {
  const { dataDir } = fixture(t);
  const salt = crypto.randomBytes(32).toString("hex");
  const legacy = { username: "legacy-admin", salt, passwordHash: crypto.scryptSync(password, salt, 32).toString("hex") };
  fs.writeFileSync(path.join(dataDir, "panel-admin.json"), JSON.stringify(legacy));
  const filename = path.join(dataDir, "panel-users.json");
  for (const content of ["{broken", "[]", JSON.stringify({ schemaVersion: 1, users: {} }), JSON.stringify({ schemaVersion: 1, users: [{ id: "bad", username: "admin", role: "owner" }] })]) {
    fs.writeFileSync(filename, content);
    assert.throws(() => createAuthStore({ dataDir }).listUsers());
    assert.equal(fs.readFileSync(filename, "utf8"), content);
  }
});

test("an account write preserves an intervening process update instead of overwriting its users", t => {
  const { dataDir, store } = fixture(t);
  store.upsertAdmin({ username: "admin", password });
  const filename = path.join(dataDir, "panel-users.json");
  const originalScrypt = crypto.scryptSync;
  let intervened = false;
  crypto.scryptSync = function (...args) {
    if (!intervened) {
      intervened = true;
      const saved = stored(dataDir);
      const now = new Date().toISOString();
      saved.users.push({
        ...saved.users[0], id:crypto.randomUUID(), username:"concurrent-viewer", role:"viewer", version:1,
        createdAt:now, updatedAt:now
      });
      fs.writeFileSync(filename, JSON.stringify(saved, null, 2));
    }
    return originalScrypt.apply(this, args);
  };
  try {
    assert.throws(() => store.createUser({ username:"stale-worker", password }), error =>
      error.status === 409 && /zmien|ponownie|równoleg/i.test(error.message));
  } finally {
    crypto.scryptSync = originalScrypt;
  }
  assert.equal(intervened, true);
  assert.deepEqual(stored(dataDir).users.map(user => user.username), ["admin", "concurrent-viewer"]);
  assert.equal(fs.readdirSync(dataDir).some(name => name.endsWith(".tmp")), false);
});
