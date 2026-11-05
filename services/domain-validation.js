"use strict";
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function text(value, label, max = 500, required = true) {
  if (typeof value !== "string" || (required && !value.trim()) || value.length > max) fail(`Nieprawidłowe pole: ${label}.`);
  return value.trim();
}
function integer(value, label, min = 0, max = 1000000000) {
  if (typeof value === "string" && /^\d+$/.test(value)) value = Number(value);
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`Nieprawidłowe pole: ${label}.`);
  return value;
}
function snowflake(value) { value = text(value, "Discord ID", 20); if (!/^\d{17,20}$/.test(value)) fail("Discord ID musi mieć 17–20 cyfr."); return value; }
function present(value, message = "Nie znaleziono wpisu.") { if (!value) fail(message, 404); return value; }
module.exports = { fail, text, integer, snowflake, present };
