"use strict";

require("dotenv").config({ quiet: true });

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const readline = require("node:readline");

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
  process.stderr.write("Hasło administratora (minimum 12 znaków, niewidoczne): ");
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const listener = (text, key = {}) => {
      if (key.name === "return" || key.name === "enter" || (key.ctrl && key.name === "c")) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("keypress", listener);
        process.stderr.write("\n");
        if (key.ctrl) reject(new Error("Przerwano konfigurację.")); else resolve(value);
      } else if (key.name === "backspace") value = value.slice(0, -1);
      else if (!key.ctrl && !key.meta && text && value.length < 1024) value += text;
    };
    process.stdin.on("keypress", listener);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const position = args.indexOf("--username");
  const username = position >= 0 ? args[position + 1] : process.env.PANEL_ADMIN_USERNAME;
  if (!username || !/^[a-zA-Z0-9_.@-]{3,64}$/.test(username)) throw new Error("Podaj --username NAZWA (3–64 litery, cyfry lub _.@-).");
  const password = await readPassword();
  if (password.length < 12 || password.length > 1024) throw new Error("Hasło musi mieć od 12 do 1024 znaków.");
  const salt = crypto.randomBytes(32).toString("hex");
  const passwordHash = crypto.scryptSync(password, salt, 32).toString("hex");
  const directory = process.env.PANEL_DATA_DIR || process.env.SW_DATA_DIR || path.join(__dirname, "..", "data");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, "panel-admin.json");
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ username, salt, passwordHash, updatedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, target);
  console.log("Zapisano konto administratora. Hasło nie jest zapisywane w postaci jawnej.");
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { main };
