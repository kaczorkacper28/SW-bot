"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const readline = require("node:readline");
const dotenv = require("dotenv");

function fail(message) { throw new Error(message); }

function validateConfiguration(config, { requirePassword = true } = {}) {
  const token = String(config.token || "").trim();
  const clientId = String(config.clientId || "").trim();
  const guildId = String(config.guildId || "").trim();
  if (!token || token.length > 4096 || /\s|[\x00-\x1f\x7f]/.test(token)) fail("Token jest wymagany i nie może zawierać białych znaków.");
  if (!/^[0-9]{17,20}$/.test(clientId)) fail("CLIENT_ID musi zawierać od 17 do 20 cyfr.");
  if (!/^[0-9]{17,20}$/.test(guildId)) fail("GUILD_ID musi zawierać od 17 do 20 cyfr.");
  if (requirePassword) {
    if (!/^[a-zA-Z0-9_.@-]{3,64}$/.test(config.username || "")) fail("Nazwa konta: 3–64 litery, cyfry lub _.@-.");
    if (typeof config.password !== "string" || config.password.length < 12 || config.password.length > 1024) fail("Hasło musi mieć od 12 do 1024 znaków.");
    if (config.password !== config.passwordConfirmation) fail("Hasła nie są takie same. Wpisz je ponownie.");
  }
  return { ...config, token, clientId, guildId };
}

function quoteValue(value) {
  value = String(value);
  for (const quote of ["'", '"', "`"]) {
    if (!value.includes(quote)) {
      const encoded = `${quote}${value}${quote}`;
      if (dotenv.parse(`VALUE=${encoded}`).VALUE === value) return encoded;
    }
  }
  fail("Nie można bezpiecznie zapisać wartości w pliku .env.");
}

// Replace assignment values only. Keep comments, unrelated lines and line endings.
// Skipping entire quoted values prevents matching apparent assignments inside them.
function mergeEnv(source, updates) {
  const before = dotenv.parse(source);
  const wanted = new Map(Object.entries(updates));
  for (const key of wanted.keys()) if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) fail("Nieprawidłowa nazwa zmiennej.");
  const found = new Set();
  const edits = [];
  const assignments = /^[ \t]*(?:export[ \t]+)?([\w.-]+)(?:[ \t]*=[ \t]*|:[ \t]+)/gm;
  let match;
  while ((match = assignments.exec(source))) {
    const start = assignments.lastIndex;
    let end = start;
    const quote = source[start];
    if (["'", '"', "`"].includes(quote)) {
      end++;
      while (end < source.length) {
        if (source[end] === quote) {
          let slashes = 0;
          for (let i = end - 1; i > start && source[i] === "\\"; i--) slashes++;
          if (slashes % 2 === 0) break;
        }
        end++;
      }
      if (end >= source.length) fail("Plik .env zawiera niedomkniętą wartość. Zachowano go bez zmian.");
      end++;
    } else {
      while (end < source.length && !["\r", "\n", "#"].includes(source[end])) end++;
      while (end > start && /[ \t]/.test(source[end - 1])) end--;
    }
    const nextLine = source.indexOf("\n", end);
    assignments.lastIndex = nextLine < 0 ? source.length : nextLine + 1;
    if (wanted.has(match[1])) {
      found.add(match[1]);
      edits.push({ start, end, value: quoteValue(wanted.get(match[1])) });
    }
  }
  let result = source;
  for (const edit of edits.reverse()) result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  for (const [key, value] of wanted) if (!found.has(key)) {
    if (result && !result.endsWith("\n")) result += newline;
    result += `${key}=${quoteValue(value)}${newline}`;
  }
  const after = dotenv.parse(result);
  for (const [key, value] of wanted) if (after[key] !== String(value)) fail("Nie udało się bezpiecznie scalić pliku .env. Zachowano go bez zmian.");
  for (const [key, value] of Object.entries(before)) if (!wanted.has(key) && after[key] !== value) fail("Scalanie zmieniłoby inne ustawienia. Zachowano plik .env bez zmian.");
  return result;
}

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--reset-admin") options.resetAdmin = true;
    else if (["--help", "-h"].includes(args[i])) options.help = true;
    else if (["--client-id", "--guild-id"].includes(args[i])) {
      const key = args[i] === "--client-id" ? "clientId" : "guildId";
      const value = args[++i];
      if (!/^[0-9]{17,20}$/.test(value || "")) fail("Identyfikator podany w opcji musi zawierać 17–20 cyfr.");
      options[key] = value;
    } else fail("Nieznana opcja. Pomoc: npm run configure -- --help.");
  }
  return options;
}

function createPrompter({ input = process.stdin, output = process.stderr } = {}) {
  return ({ label, secret = false, maxLength = secret ? 4096 : 256 }) => {
    if (!input.isTTY || typeof input.setRawMode !== "function") fail("Otwórz terminal Termux i uruchom npm run configure bez przekierowania wejścia.");
    return new Promise((resolve, reject) => {
      const wasRaw = Boolean(input.isRaw);
      let value = "";
      let finished = false;
      const finish = (error) => {
        if (finished) return;
        finished = true;
        input.removeListener("keypress", onKey);
        input.removeListener("end", onEnd);
        input.removeListener("error", onError);
        process.removeListener("SIGINT", onSignal);
        process.removeListener("SIGTERM", onSignal);
        input.setRawMode(wasRaw);
        input.pause();
        output.write("\n");
        if (error) reject(error); else resolve(value);
      };
      const onSignal = () => finish(Object.assign(new Error("Przerwano konfigurację. Nie zapisano zmian."), { code: "CANCELLED" }));
      const onEnd = onSignal;
      const onError = () => finish(new Error("Nie można odczytać danych z terminala."));
      const onKey = (text, key = {}) => {
        if (key.ctrl && ["c", "d"].includes(key.name)) return onSignal();
        if (["return", "enter"].includes(key.name)) return finish();
        if (key.name === "backspace") {
          if (value) { value = Array.from(value).slice(0, -1).join(""); if (!secret) output.write("\b \b"); }
        } else if (key.ctrl && key.name === "u") {
          if (!secret) output.write("\b \b".repeat(Array.from(value).length));
          value = "";
        } else if (!key.ctrl && !key.meta && text && !/[\x00-\x1f\x7f-\x9f]/.test(text)) {
          if (value.length + text.length > maxLength) return finish(new Error("Wpisana wartość jest za długa. Nie zapisano zmian."));
          value += text;
          if (!secret) output.write(text);
        }
      };
      readline.emitKeypressEvents(input);
      input.on("keypress", onKey);
      input.once("end", onEnd);
      input.once("error", onError);
      process.once("SIGINT", onSignal);
      process.once("SIGTERM", onSignal);
      input.setRawMode(true);
      input.resume();
      output.write(label);
    });
  };
}

function readOptional(filename) {
  try {
    if (fs.lstatSync(filename).isSymbolicLink()) fail("Plik konfiguracji jest dowiązaniem. Skonfiguruj go ręcznie, aby zachować jego cel.");
    return fs.readFileSync(filename, "utf8");
  } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

function writePrivate(filename, content) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`);
  try {
    fs.writeFileSync(temporary, content, { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, filename);
  } finally { fs.rmSync(temporary, { force: true }); }
}

async function runSetup({ directory = path.join(__dirname, ".."), argv = process.argv.slice(2), ask, output = process.stderr, environment = process.env } = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    output.write("Konfiguracja SW w Termux: npm run configure -- [--client-id ID] [--guild-id ID] [--reset-admin]\nToken i hasło są wpisywane bez wyświetlania. Enter przy tokenie zachowuje zapisany token.\n");
    return;
  }
  ask ||= createPrompter({ output });
  const envPath = path.join(directory, ".env");
  const original = readOptional(envPath);
  const existing = dotenv.parse(original || "");
  const dataDir = path.resolve(directory, environment.PANEL_DATA_DIR || existing.PANEL_DATA_DIR || environment.SW_DATA_DIR || existing.SW_DATA_DIR || "data");
  const adminPath = path.join(dataDir, "panel-admin.json");
  const originalAdmin = readOptional(adminPath);
  const hasAdmin = originalAdmin !== null;
  if (hasAdmin && !options.resetAdmin) {
    let admin;
    try { admin = JSON.parse(originalAdmin); } catch { fail("Plik konta panelu jest uszkodzony. Zachowano go. Aby utworzyć konto ponownie, użyj --reset-admin."); }
    if (!/^[a-zA-Z0-9_.@-]{3,64}$/.test(admin?.username || "") || !/^[a-f0-9]{64}$/.test(admin?.salt || "") || !/^[a-f0-9]{64}$/.test(admin?.passwordHash || "")) fail("Plik konta panelu jest nieprawidłowy. Zachowano go. Aby odtworzyć konto, użyj --reset-admin.");
  }
  output.write("Konfiguracja bota SW i panelu. Token oraz hasło pozostaną niewidoczne. Ctrl+C anuluje bez zapisu.\n");
  const tokenInput = await ask({ label: existing.TOKEN ? "Token bota (Enter zachowuje zapisany): " : "Token bota Discord: ", secret: true });
  const token = tokenInput.trim() || existing.TOKEN || "";
  const clientDefault = options.clientId || (/^[0-9]{17,20}$/.test(existing.CLIENT_ID || "") ? existing.CLIENT_ID : "");
  const guildDefault = options.guildId || (/^[0-9]{17,20}$/.test(existing.GUILD_ID || "") ? existing.GUILD_ID : "");
  const clientId = (await ask({ label: `CLIENT_ID aplikacji${clientDefault ? ` [${clientDefault}]` : ""}: ` })).trim() || clientDefault;
  const guildId = (await ask({ label: `GUILD_ID serwera${guildDefault ? ` [${guildDefault}]` : ""}: ` })).trim() || guildDefault;
  let config = validateConfiguration({ token, clientId, guildId }, { requirePassword: false });
  let newAdmin;
  if (!hasAdmin || options.resetAdmin) {
    const username = (await ask({ label: "Nazwa konta panelu [admin]: " })).trim() || "admin";
    const password = await ask({ label: "Hasło panelu (minimum 12 znaków): ", secret: true, maxLength: 1024 });
    const passwordConfirmation = await ask({ label: "Powtórz hasło panelu: ", secret: true, maxLength: 1024 });
    config = validateConfiguration({ ...config, username, password, passwordConfirmation });
    const salt = crypto.randomBytes(32).toString("hex");
    newAdmin = JSON.stringify({ username, salt, passwordHash: crypto.scryptSync(password, salt, 32).toString("hex"), updatedAt: new Date().toISOString() }, null, 2);
  } else output.write("Zachowano istniejące konto panelu. Reset hasła: npm run configure -- --reset-admin.\n");
  const updates = {};
  if (tokenInput.trim() || !existing.TOKEN) updates.TOKEN = config.token;
  if (existing.CLIENT_ID !== config.clientId) updates.CLIENT_ID = config.clientId;
  if (existing.GUILD_ID !== config.guildId) updates.GUILD_ID = config.guildId;
  const merged = mergeEnv(original || "", updates);
  // An overlapping setup must not silently overwrite settings entered meanwhile.
  if (readOptional(envPath) !== original || readOptional(adminPath) !== originalAdmin) fail("Konfiguracja zmieniła się w innym procesie. Uruchom konfigurację ponownie; nie nadpisano zmian.");
  if (merged !== original) writePrivate(envPath, merged); else fs.chmodSync(envPath, 0o600);
  if (newAdmin) writePrivate(adminPath, newAdmin); else fs.chmodSync(adminPath, 0o600);
  output.write("Konfiguracja zapisana. Uruchom bota i panel: npm run dev\n");
  return { envPath, adminPath, adminCreated: Boolean(newAdmin) };
}

if (require.main === module) runSetup().catch(error => {
  console.error(error.message);
  process.exitCode = error.code === "CANCELLED" ? 130 : 1;
});

module.exports = { mergeEnv, validateConfiguration, parseArgs, createPrompter, runSetup };
