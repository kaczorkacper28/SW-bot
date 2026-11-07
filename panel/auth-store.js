"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const scrypt = promisify(crypto.scrypt);
const ROLES = ["admin", "operator", "viewer"];

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function validateUsername(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_.@-]{3,64}$/.test(value)) fail("Nazwa konta musi mieć 3–64 litery, cyfry lub _.@-.");
  return value;
}
function validatePassword(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 1024) fail("Hasło musi mieć od 12 do 1024 znaków.");
  return value;
}
function validateRole(role) { if (!ROLES.includes(role)) fail("Rola musi mieć wartość admin, operator lub viewer."); return role; }
function hashPassword(password) {
  validatePassword(password);
  const salt = crypto.randomBytes(32).toString("hex");
  return { salt, passwordHash: crypto.scryptSync(password, salt, 32).toString("hex") };
}
function publicUser(user) {
  return { id:user.id, username:user.username, role:user.role, active:user.active, createdAt:user.createdAt, updatedAt:user.updatedAt };
}
function validHash(user) { return /^[a-f0-9]{64}$/.test(user?.salt || "") && /^[a-f0-9]{64}$/.test(user?.passwordHash || ""); }

function createAuthStore({ dataDir = process.env.PANEL_DATA_DIR || process.env.SW_DATA_DIR || path.join(__dirname, "..", "data") } = {}) {
  const filename = path.join(dataDir, "panel-users.json");
  const legacyFile = path.join(dataDir, "panel-admin.json");
  const snapshots = new WeakMap();
  function readOptional(target) {
    try {
      if (fs.lstatSync(target).isSymbolicLink()) fail(`Plik kont ${target} jest dowiązaniem. Zachowano go bez zmian.`, 500);
      const raw = fs.readFileSync(target, "utf8");
      return { data:JSON.parse(raw), raw };
    } catch (error) {
      if (error.code === "ENOENT") return undefined;
      if (error.status) throw error;
      fail(`Nie można odczytać pliku kont ${target}. Zachowano go bez zmian.`, 500);
    }
  }
  function validateStore(data) {
    if (!data || data.schemaVersion !== 1 || !Array.isArray(data.users) || !data.users.length) fail(`Nieprawidłowa baza kont ${filename}. Zachowano ją bez zmian.`, 500);
    const names = new Set(), ids = new Set();
    for (const user of data.users) {
      if (!user || typeof user.id !== "string" || !user.id || !/^[a-zA-Z0-9_.@-]{3,64}$/.test(user.username || "") || !ROLES.includes(user.role) || typeof user.active !== "boolean" || !Number.isSafeInteger(user.version) || user.version < 1 || !validHash(user) || typeof user.createdAt !== "string" || typeof user.updatedAt !== "string" || names.has(user.username.toLowerCase()) || ids.has(user.id)) fail(`Nieprawidłowy wpis w bazie kont ${filename}. Zachowano ją bez zmian.`, 500);
      names.add(user.username.toLowerCase()); ids.add(user.id);
    }
    if (!data.users.some(user => user.active && user.role === "admin")) fail(`Baza kont ${filename} nie ma aktywnego administratora. Zachowano ją bez zmian.`, 500);
    return data;
  }
  function write(data) {
    validateStore(data);
    fs.mkdirSync(dataDir, { recursive:true, mode:0o700 });
    const temporary = `${filename}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`;
    try {
      const serialized = JSON.stringify(data, null, 2);
      fs.writeFileSync(temporary, serialized, { flag:"wx", mode:0o600 });
      // Password hashing can overlap another process's CLI update. Refuse a
      // stale snapshot rather than replacing accounts created in the meantime.
      if (readOptional(filename)?.raw !== snapshots.get(data)) fail("Baza kont zmieniła się w innym procesie. Odśwież dane i ponów zmianę.", 409);
      fs.renameSync(temporary, filename);
      snapshots.set(data, serialized);
    } finally { fs.rmSync(temporary, { force:true }); }
  }
  function load() {
    const saved = readOptional(filename);
    if (saved !== undefined) { const data = validateStore(saved.data); snapshots.set(data,saved.raw); return data; }
    // The legacy file is considered only before the authoritative store exists.
    const legacySaved = readOptional(legacyFile);
    if (legacySaved === undefined) { const data = { schemaVersion:1, users:[] }; snapshots.set(data,undefined); return data; }
    const legacy = legacySaved.data;
    if (!/^[a-zA-Z0-9_.@-]{3,64}$/.test(legacy?.username || "") || !validHash(legacy)) fail(`Nieprawidłowe konto w ${legacyFile}. Zachowano plik bez zmian.`, 500);
    const now = new Date().toISOString();
    const migrated = { schemaVersion:1, users:[{ id:crypto.randomUUID(), username:legacy.username, role:"admin", active:true, version:1, salt:legacy.salt, passwordHash:legacy.passwordHash, createdAt:legacy.updatedAt || now, updatedAt:legacy.updatedAt || now }] };
    snapshots.set(migrated,undefined);
    write(migrated);
    return migrated;
  }
  function protectLastAdmin(users) {
    if (!users.some(user => user.active && user.role === "admin")) fail("Nie można usunąć ani wyłączyć ostatniego aktywnego administratora.", 409);
  }
  function findUser(data, id) {
    const user = data.users.find(item => item.id === id);
    if (!user) fail("Nie znaleziono konta.", 404);
    return user;
  }
  function checkFields(input, allowed) {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) fail("Nieprawidłowe pola konta.");
  }
  function createUser(input) {
    checkFields(input, ["username", "password", "role", "active"]);
    const username = validateUsername(input.username);
    const role = validateRole(input.role || "operator");
    const active = input.active === undefined ? true : input.active;
    if (typeof active !== "boolean") fail("Pole active musi być wartością logiczną.");
    const data = load();
    if (data.users.some(user => user.username.toLowerCase() === username.toLowerCase())) fail("Ta nazwa konta jest już zajęta.", 409);
    const hash = hashPassword(input.password);
    const now = new Date().toISOString();
    const user = { id:crypto.randomUUID(), username, role, active, version:1, ...hash, createdAt:now, updatedAt:now };
    data.users.push(user); protectLastAdmin(data.users); write(data);
    return publicUser(user);
  }
  function updateUser(id, input, { actorId } = {}) {
    checkFields(input, ["role", "active", "password"]);
    if (!Object.keys(input).length) fail("Podaj zmianę roli, aktywności lub hasła.");
    const data = load();
    const user = findUser(data, id);
    if (input.role !== undefined) user.role = validateRole(input.role);
    if (input.active !== undefined) {
      if (typeof input.active !== "boolean") fail("Pole active musi być wartością logiczną.");
      if (!input.active && actorId === id) fail("Nie można wyłączyć własnego konta.", 409);
      user.active = input.active;
    }
    if (input.password !== undefined) Object.assign(user, hashPassword(input.password));
    protectLastAdmin(data.users);
    user.version++; user.updatedAt = new Date().toISOString(); write(data);
    return publicUser(user);
  }
  function deleteUser(id, { actorId } = {}) {
    const data = load();
    findUser(data,id);
    if (actorId === id) fail("Nie można usunąć własnego konta.", 409);
    data.users = data.users.filter(user => user.id !== id);
    protectLastAdmin(data.users); write(data);
  }
  function upsertAdminHash(input) {
    const username = validateUsername(input.username);
    if (!validHash(input)) fail("Nieprawidłowy skrót hasła administratora.");
    const data = load();
    const now = new Date().toISOString();
    let user = data.users.find(item => item.username.toLowerCase() === username.toLowerCase());
    if (user) Object.assign(user, { username, role:"admin", active:true, salt:input.salt, passwordHash:input.passwordHash, version:user.version + 1, updatedAt:now });
    else { user = { id:crypto.randomUUID(), username, role:"admin", active:true, version:1, salt:input.salt, passwordHash:input.passwordHash, createdAt:input.updatedAt || now, updatedAt:now }; data.users.push(user); }
    write(data); return publicUser(user);
  }
  async function authenticate(username, password) {
    if (typeof username !== "string" || typeof password !== "string" || password.length > 1024) return null;
    const data = load();
    const user = data.users.find(item => item.username.toLowerCase() === username.toLowerCase());
    const candidate = await scrypt(password, user?.salt || "0".repeat(64), 32);
    const expected = Buffer.from(user?.passwordHash || "0".repeat(64), "hex");
    const valid = crypto.timingSafeEqual(candidate, expected);
    // A reset/deactivation during scrypt must also invalidate an in-flight login.
    const current = user && load().users.find(item => item.id === user.id);
    if (!valid || !current?.active || current.version !== user.version || current.passwordHash !== user.passwordHash) return null;
    return { ...publicUser(current), version:current.version };
  }
  return {
    hasUsers:() => load().users.length > 0,
    listUsers:() => load().users.map(publicUser),
    getSessionUser({ userId, version }) { const user = load().users.find(item => item.id === userId); return user?.active && user.version === version ? publicUser(user) : null; },
    authenticate, createUser, updateUser, deleteUser, upsertAdminHash,
    upsertAdmin({ username, password }) { return upsertAdminHash({ username, ...hashPassword(password) }); }
  };
}

module.exports = { createAuthStore, hashPassword, publicUser, validateUsername, validatePassword, ROLES };
