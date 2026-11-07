"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const dotenv = require("dotenv");
const { mergeEnv, validateConfiguration, parseArgs, runSetup } = require("../scripts/configure");

const clientId = "100000000000000001";
const guildId = "100000000000000002";
const token = "fixture.private_token_value_for_setup_only";
const password = "Fixture password for setup only!";

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sw-configure-"));
  return { directory, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}
function outputCapture() {
  let text = "";
  return { write(value) { text += value; }, get text() { return text; } };
}
function answers(values, prompts = []) {
  return async prompt => {
    prompts.push(prompt);
    assert.ok(values.length, "Unexpected extra prompt");
    return values.shift();
  };
}
function adminFixture() {
  const salt = crypto.randomBytes(32).toString("hex");
  return JSON.stringify({ username: "existing-admin", salt, passwordHash: crypto.scryptSync(password, salt, 32).toString("hex"), updatedAt: "2026-01-01T00:00:00.000Z" });
}

test("env merge retains comments, CRLF and unrelated multiline secrets while replacing duplicate targets", () => {
  const source = "# ważne ustawienia\r\nexport TOKEN = 'old-token' # keep token comment\r\nOTHER=`first\r\nTOKEN=inside-multiline\r\nlast`\r\nEMPTY=\r\nTOKEN: old-duplicate # duplicate comment\r\nCUSTOM='secret#value'\r\n";
  const merged = mergeEnv(source, { TOKEN: token, CLIENT_ID: clientId });
  assert.equal(dotenv.parse(merged).TOKEN, token);
  assert.equal(dotenv.parse(merged).OTHER, dotenv.parse(source).OTHER);
  assert.ok(merged.includes("# keep token comment\r\n"));
  assert.ok(merged.includes("# duplicate comment\r\n"));
  assert.ok(merged.includes("CUSTOM='secret#value'\r\n"));
  assert.ok(merged.includes("TOKEN=inside-multiline\r\n"));
  assert.equal(merged.replaceAll("\r\n", "").includes("\n"), false);
  assert.equal(mergeEnv(source, {}), source);
});

test("configuration validates IDs and matching long passwords without exposing submitted values", () => {
  assert.equal(validateConfiguration({ token, clientId, guildId, username: "admin", password, passwordConfirmation: password }).token, token);
  for (const update of [{ clientId: "abc" }, { guildId: "123" }, { token: "bad token" }, { username: "a" }, { password: "short" }, { passwordConfirmation: "mismatch" }]) {
    assert.throws(() => validateConfiguration({ token, clientId, guildId, username: "admin", password, passwordConfirmation: password, ...update }), error => !error.message.includes(token) && !error.message.includes(password));
  }
  assert.deepEqual(parseArgs(["--client-id", clientId, "--guild-id", guildId, "--reset-admin"]), { clientId, guildId, resetAdmin: true });
  assert.throws(() => parseArgs(["--token", token]), error => !error.message.includes(token));
});

test("first setup writes private dotenv and salted admin hash using ID flag defaults and parsed data directory", async () => {
  const setup = fixture();
  const output = outputCapture();
  const prompts = [];
  const original = "# zachowaj\nSW_DATA_DIR=private-data\nOTHER_SECRET='untouched'\n";
  fs.writeFileSync(path.join(setup.directory, ".env"), original);
  try {
    const result = await runSetup({ directory: setup.directory, argv: ["--client-id", clientId, "--guild-id", guildId], environment: {}, output,
      ask: answers([token, "", "", "", password, password], prompts) });
    assert.equal(result.adminPath, path.join(setup.directory, "private-data", "panel-admin.json"));
    assert.equal(result.adminCreated, true);
    const envText = fs.readFileSync(result.envPath, "utf8");
    assert.ok(envText.startsWith(original));
    assert.deepEqual(dotenv.parse(envText), { SW_DATA_DIR: "private-data", OTHER_SECRET: "untouched", TOKEN: token, CLIENT_ID: clientId, GUILD_ID: guildId });
    const adminText = fs.readFileSync(result.adminPath, "utf8");
    const admin = JSON.parse(adminText);
    assert.equal(admin.username, "admin");
    assert.equal(crypto.scryptSync(password, admin.salt, 32).toString("hex"), admin.passwordHash);
    assert.equal(adminText.includes(password), false);
    assert.equal(fs.statSync(result.envPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(result.adminPath).mode & 0o777, 0o600);
    assert.equal(prompts[0].secret, true);
    assert.equal(prompts[4].secret, true);
    assert.equal(prompts[5].secret, true);
    assert.ok(prompts[1].label.includes(clientId));
    assert.equal(output.text.includes(token), false);
    assert.equal(output.text.includes(password), false);
    assert.deepEqual(fs.readdirSync(setup.directory).sort(), [".env", "private-data"]);
  } finally { setup.cleanup(); }
});

test("blank token and default IDs retain exact existing secrets, comments and administrator hash", async () => {
  const setup = fixture();
  const original = `# user settings\r\nTOKEN = '${token}' # private\r\nCLIENT_ID=${clientId}\r\nGUILD_ID=${guildId}\r\nPANEL_DATA_DIR=panel-data\r\nUNRELATED='left alone'`;
  const adminText = adminFixture();
  fs.writeFileSync(path.join(setup.directory, ".env"), original);
  fs.mkdirSync(path.join(setup.directory, "panel-data"));
  fs.writeFileSync(path.join(setup.directory, "panel-data", "panel-admin.json"), adminText);
  try {
    const result = await runSetup({ directory: setup.directory, argv: [], environment: {}, output: outputCapture(), ask: answers(["", "", ""]) });
    assert.equal(result.adminCreated, false);
    assert.equal(fs.readFileSync(result.envPath, "utf8"), original);
    assert.equal(fs.readFileSync(result.adminPath, "utf8"), adminText);
  } finally { setup.cleanup(); }
});

test("explicit administrator reset replaces hash while preserving saved token", async () => {
  const setup = fixture();
  const original = `TOKEN=${token}\nCLIENT_ID=${clientId}\nGUILD_ID=${guildId}\n`;
  fs.writeFileSync(path.join(setup.directory, ".env"), original);
  fs.mkdirSync(path.join(setup.directory, "data"));
  const oldAdmin = adminFixture();
  fs.writeFileSync(path.join(setup.directory, "data", "panel-admin.json"), oldAdmin);
  try {
    const result = await runSetup({ directory: setup.directory, argv: ["--reset-admin"], environment: {}, output: outputCapture(), ask: answers(["", "", "", "new-admin", password, password]) });
    assert.equal(result.adminCreated, true);
    assert.equal(fs.readFileSync(result.envPath, "utf8"), original);
    const saved = fs.readFileSync(result.adminPath, "utf8");
    assert.notEqual(saved, oldAdmin);
    assert.equal(JSON.parse(saved).username, "new-admin");
  } finally { setup.cleanup(); }
});

test("cancellation and mismatched passwords do not write or replace any settings", async () => {
  for (const cancelled of [false, true]) {
    const setup = fixture();
    const original = "# untouched settings\nOTHER=private\n";
    fs.writeFileSync(path.join(setup.directory, ".env"), original);
    const respond = answers([token, clientId, guildId, "admin", password, "mismatch"]);
    try {
      await assert.rejects(runSetup({ directory: setup.directory, argv: [], environment: {}, output: outputCapture(), ask: cancelled ? async prompt => {
        if (prompt.label.startsWith("Hasło")) throw Object.assign(new Error("Cancelled"), { code: "CANCELLED" });
        return respond(prompt);
      } : respond }));
      assert.equal(fs.readFileSync(path.join(setup.directory, ".env"), "utf8"), original);
      assert.deepEqual(fs.readdirSync(setup.directory), [".env"]);
    } finally { setup.cleanup(); }
  }
});

test("concurrent configuration edits and symlinks are preserved instead of overwritten", async () => {
  const setup = fixture();
  try {
    const envPath = path.join(setup.directory, ".env");
    fs.writeFileSync(envPath, "OTHER=original\n");
    const respond = answers([token, clientId, guildId, "admin", password, password]);
    await assert.rejects(runSetup({ directory: setup.directory, argv: [], environment: {}, output: outputCapture(), ask: async prompt => {
      const value = await respond(prompt);
      if (prompt.label.startsWith("Powtórz")) fs.writeFileSync(envPath, "OTHER=concurrent-change\n");
      return value;
    } }), /innym procesie/);
    assert.equal(fs.readFileSync(envPath, "utf8"), "OTHER=concurrent-change\n");
    fs.renameSync(envPath, path.join(setup.directory, "shared"));
    fs.symlinkSync("shared", envPath);
    await assert.rejects(runSetup({ directory: setup.directory, argv: [], environment: {}, output: outputCapture(), ask: () => assert.fail("Must not prompt") }), /dowiązaniem/);
    assert.equal(fs.readFileSync(path.join(setup.directory, "shared"), "utf8"), "OTHER=concurrent-change\n");
  } finally { setup.cleanup(); }
});

test("setup preserves an existing multiuser store and its administrator without legacy file", async () => {
  const setup = fixture();
  try {
    fs.writeFileSync(path.join(setup.directory,".env"),`TOKEN=${token}\nCLIENT_ID=${clientId}\nGUILD_ID=${guildId}\n`);
    const dataDir=path.join(setup.directory,"data");const {createAuthStore}=require('../panel/auth-store');const store=createAuthStore({dataDir});store.upsertAdmin({username:'commander',password});store.createUser({username:'officer',password,role:'operator'});
    const filename=path.join(dataDir,'panel-users.json');const before=fs.readFileSync(filename,'utf8');
    const result=await runSetup({directory:setup.directory,argv:[],environment:{},output:outputCapture(),ask:answers(['','',''])});
    assert.equal(result.adminCreated,false);assert.equal(result.adminPath,filename);assert.equal(fs.readFileSync(filename,'utf8'),before);assert.equal(fs.existsSync(path.join(dataDir,'panel-admin.json')),false);
  } finally {setup.cleanup()}
});
test("wizard administrator reset updates the authoritative store and retains other users", async () => {
  const setup = fixture();
  try {
    fs.writeFileSync(path.join(setup.directory,".env"),`TOKEN=${token}\nCLIENT_ID=${clientId}\nGUILD_ID=${guildId}\n`);
    const dataDir=path.join(setup.directory,"data");const {createAuthStore}=require('../panel/auth-store');const store=createAuthStore({dataDir});store.upsertAdmin({username:'commander',password});const officer=store.createUser({username:'officer',password,role:'operator'});
    const replacement='A different fixture password!';await runSetup({directory:setup.directory,argv:['--reset-admin'],environment:{},output:outputCapture(),ask:answers(['','','','',replacement,replacement])});
    assert.equal(store.listUsers().length,2);assert.equal(store.listUsers().find(user=>user.id===officer.id).role,'operator');assert.ok(await store.authenticate('commander',replacement));assert.equal(await store.authenticate('commander',password),null);
  } finally {setup.cleanup()}
});
