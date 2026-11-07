"use strict";

const path = require("node:path");
const { createAuthStore } = require("./auth-store");
const { createPrompter } = require("../scripts/configure");

async function readPassword() {
  if (process.env.PANEL_ADMIN_PASSWORD) return process.env.PANEL_ADMIN_PASSWORD;
  if (!process.stdin.isTTY) {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 2048) throw new Error("Hasło jest za długie.");
    }
    return input.replace(/\r?\n$/, "");
  }
  return createPrompter()({ label:"Hasło administratora (minimum 12 znaków, niewidoczne): ", secret:true, maxLength:1024 });
}

async function main() {
  const args = process.argv.slice(2);
  const position = args.indexOf("--username");
  const username = position >= 0 ? args[position + 1] : process.env.PANEL_ADMIN_USERNAME;
  if (!username || !/^[a-zA-Z0-9_.@-]{3,64}$/.test(username)) throw new Error("Podaj --username NAZWA (3–64 litery, cyfry lub _.@-).");
  const password = await readPassword();
  if (password.length < 12 || password.length > 1024) throw new Error("Hasło musi mieć od 12 do 1024 znaków.");
  const directory = process.env.PANEL_DATA_DIR || process.env.SW_DATA_DIR || path.join(__dirname, "..", "data");
  const user = createAuthStore({ dataDir:directory }).upsertAdmin({ username,password });
  console.log("Zapisano konto administratora. Hasło nie jest zapisywane w postaci jawnej.");
  return user;
}

if (require.main === module) {
  if (!process.env.PANEL_DATA_DIR && !process.env.SW_DATA_DIR) require("dotenv").config({ quiet:true });
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { main };
