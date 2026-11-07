"use strict";
// The panel stays available when Discord startup fails. It reports an unavailable
// management service itself; the supervisor never starts a second data manager.
const { spawn } = require("node:child_process");
const path = require("node:path");

function startAll({
  directory = path.resolve(__dirname, ".."),
  botScript = "index.js",
  panelScript = "panel/server.js",
  environment = process.env,
  offline = false,
  shutdownTimeout = 5000,
  output = process.stderr,
} = {}) {
  const env = { ...environment };
  if (offline) env.OFFLINE = "1";
  const children = [];
  let stopping = false;
  let exitCode = 0;
  let deadline;
  let resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const statusCode = code => Number.isInteger(code) ? code : 1;
  const statusText = (code, signal) => signal ? `sygnał ${signal}` : `kod ${code ?? 1}`;

  function finish() {
    if (children.length !== 2 || !children.every(item => item.closed)) return;
    clearTimeout(deadline);
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    process.exitCode = exitCode;
    resolveDone(exitCode);
  }

  function stop(code = 0) {
    // A later user shutdown must preserve an earlier bot failure.
    if (code) exitCode = code;
    if (stopping) return;
    stopping = true;
    for (const item of children) if (!item.closed) item.process.kill("SIGTERM");
    deadline = setTimeout(() => {
      for (const item of children) if (!item.closed) item.process.kill("SIGKILL");
    }, shutdownTimeout);
    deadline.unref();
    finish();
  }
  function onSignal() { stop(); }

  for (const [name, script] of [["bot", botScript], ["panel", panelScript]]) {
    const child = spawn(process.execPath, [script], { cwd: directory, env, stdio: "inherit" });
    const item = { name, process: child, closed: false, spawnError: false };
    children.push(item);
    child.on("error", error => {
      item.spawnError = true;
      output.write(`Nie udało się uruchomić ${name === "bot" ? "bota SW" : "panelu SW"}: ${error.message}\n`);
    });
    child.on("close", (code, signal) => {
      item.closed = true;
      const failureCode = item.spawnError ? 1 : statusCode(code);
      if (!stopping) {
        if (name === "bot") {
          if (failureCode) exitCode = failureCode;
          output.write(`Bot SW został zatrzymany (${statusText(code, signal)}). Panel pozostaje uruchomiony. Sprawdź komunikat błędu bota powyżej; po poprawieniu konfiguracji uruchom ponownie npm run dev.\n`);
        } else {
          output.write(`Panel SW został zatrzymany (${statusText(code, signal)}). Zatrzymuję pozostałe procesy.\n`);
          stop(failureCode);
        }
      }
      finish();
    });
  }
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  return { children: children.map(item => item.process), stop, done };
}

if (require.main === module) startAll({ offline: process.argv.includes("--offline") });
module.exports = { startAll };
