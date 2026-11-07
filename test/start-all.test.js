"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");
const supervisorPath = path.resolve(__dirname, "../scripts/start-all.js");

function fixture(t, { botFailure, panelFailure } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sw-supervisor-"));
  fs.writeFileSync(path.join(directory, "bot.js"), `
    console.log('BOT_READY');
    const hold = setInterval(() => {}, 1000);
    process.on('SIGTERM', () => { console.log('BOT_TERM'); clearInterval(hold); process.exit(0); });
    ${botFailure ? `setTimeout(() => process.exit(${botFailure}), 150);` : ""}
  `);
  fs.writeFileSync(path.join(directory, "panel.js"), `
    const http = require('node:http');
    const server = http.createServer((request, response) => {
      response.statusCode = request.url === '/api/state' ? 503 : 200;
      response.end(request.url === '/api/state' ? 'Bot unavailable' : 'Panel available');
    });
    server.listen(0, '127.0.0.1', () => console.log('PANEL_PORT:' + server.address().port));
    process.on('SIGTERM', () => { console.log('PANEL_TERM'); server.close(() => process.exit(0)); });
    ${panelFailure ? `setTimeout(() => process.exit(${panelFailure}), 150);` : ""}
  `);
  const child = spawn(process.execPath, ["-e", `require(${JSON.stringify(supervisorPath)}).startAll({directory:${JSON.stringify(directory)},botScript:'bot.js',panelScript:'panel.js',shutdownTimeout:1000})`], {
    cwd: directory, env: { ...process.env, TOKEN: "", CLIENT_ID: "", GUILD_ID: "" }, stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  const waiters = new Set();
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
    output += chunk;
    for (const notify of [...waiters]) notify();
  });
  let closed = false;
  const completion = new Promise(resolve => child.once("close", (code, signal) => { closed = true; resolve({ code, signal }); }));
  function waitFor(pattern) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { waiters.delete(check); reject(new Error(`Supervisor output did not match ${pattern}: ${output}`)); }, 4000);
      function check() {
        const match = output.match(pattern);
        if (match) { clearTimeout(timeout); waiters.delete(check); resolve(match); }
      }
      waiters.add(check); check();
    });
  }
  t.after(async () => {
    if (!closed) { child.kill("SIGTERM"); await completion; }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { child, waitFor, completion, output: () => output };
}

function get(port, route) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port, path: route, agent: false }, response => {
      response.resume(); response.on("end", () => resolve(response.statusCode));
    });
    request.on("error", reject);
  });
}

test("importing the supervisor starts no child processes", () => {
  const result = spawnSync(process.execPath, ["-e", `require(${JSON.stringify(supervisorPath)}); console.log('IMPORTED')`], { encoding: "utf8", timeout: 2000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "IMPORTED");
});

test("bot startup failure keeps the panel reachable and preserves its failure status on shutdown", { timeout: 7000 }, async t => {
  const run = fixture(t, { botFailure: 7 });
  const [, port] = await run.waitFor(/PANEL_PORT:(\d+)/);
  await run.waitFor(/Bot SW został zatrzymany \(kod 7\).*Panel pozostaje uruchomiony/);
  assert.equal(await get(Number(port), "/"), 200);
  assert.equal(await get(Number(port), "/api/state"), 503);
  run.child.kill("SIGTERM");
  assert.deepEqual(await run.completion, { code: 7, signal: null });
  assert.match(run.output(), /PANEL_TERM/);
});

test("panel failure stops the remaining bot and preserves the panel failure status", { timeout: 7000 }, async t => {
  const run = fixture(t, { panelFailure: 9 });
  await run.waitFor(/BOT_READY/);
  assert.deepEqual(await run.completion, { code: 9, signal: null });
  assert.match(run.output(), /Panel SW został zatrzymany \(kod 9\)/);
  assert.match(run.output(), /BOT_TERM/);
});

for (const signal of ["SIGINT", "SIGTERM"]) test(`${signal} gracefully stops both healthy processes`, { timeout: 7000 }, async t => {
  const run = fixture(t);
  await Promise.all([run.waitFor(/BOT_READY/), run.waitFor(/PANEL_PORT:/)]);
  run.child.kill(signal);
  assert.deepEqual(await run.completion, { code: 0, signal: null });
  assert.match(run.output(), /BOT_TERM/);
  assert.match(run.output(), /PANEL_TERM/);
});
