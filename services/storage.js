"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, filename);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}
function readJson(filename, defaults, validate) {
  if (!fs.existsSync(filename)) { writeJson(filename, defaults); return structuredClone(defaults); }
  let value;
  try { value = JSON.parse(fs.readFileSync(filename, "utf8")); }
  catch (error) { throw new Error(`Nie można odczytać bazy ${path.basename(filename)}. Plik zachowano bez zmian.`, { cause: error }); }
  if (!value || typeof value !== "object" || Array.isArray(value) || (validate && !validate(value))) {
    throw new Error(`Nieprawidłowa struktura bazy ${path.basename(filename)}. Plik zachowano bez zmian.`);
  }
  return value;
}
module.exports = { readJson, writeJson };
