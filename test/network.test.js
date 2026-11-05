"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

async function fixture() {
  const http = require("node:http");
  const https = require("node:https");
  const net = require("node:net");
  const { once } = require("node:events");
  const { REST } = require("discord.js");
  const { WebSocket, WebSocketServer } = require("ws");
  const { createTransport } = require("../services/network");
  const directory = process.env.SW_PROXY_FIXTURE_DIR;
  const destination = https.createServer({ key: fs.readFileSync(path.join(directory, "key.pem")), cert: fs.readFileSync(path.join(directory, "cert.pem")) }, (_, response) => {
    response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ throughProxy: true }));
  });
  const wss = new WebSocketServer({ server: destination });
  wss.on("connection", socket => socket.on("message", message => socket.send(message)));
  await new Promise(resolve => destination.listen(0, "127.0.0.1", resolve));
  const destinationPort = destination.address().port;
  const sockets = new Set();
  let connects = 0;
  const proxy = http.createServer();
  proxy.on("connect", (request, socket, head) => {
    assert.ok([`proxy-target.invalid:${destinationPort}`, `wrong-host.invalid:${destinationPort}`].includes(request.url));
    connects++;
    const upstream = net.connect(destinationPort, "127.0.0.1", () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      socket.pipe(upstream); upstream.pipe(socket);
    });
    sockets.add(socket); sockets.add(upstream);
    socket.on("close", () => { sockets.delete(socket); upstream.destroy(); });
    upstream.on("close", () => { sockets.delete(upstream); socket.destroy(); });
    upstream.on("error", () => socket.destroy());
  });
  await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
  const transport = createTransport(`http://127.0.0.1:${proxy.address().port}`);
  transport.activateGateway();
  const origin = `https://proxy-target.invalid:${destinationPort}`;
  try {
    const rest = transport.configureRest(new REST({ api: origin, version: "10" }));
    assert.deepEqual(await rest.get("/probe", { auth: false }), { throughProxy: true });
    const response = await transport.fetch(origin + "/balance");
    assert.deepEqual(await response.json(), { throughProxy: true });
    const socket = new WebSocket(`wss://proxy-target.invalid:${destinationPort}`);
    await once(socket, "open");
    const echo = once(socket, "message"); socket.send("gateway-proxy-ok");
    assert.equal((await echo)[0].toString(), "gateway-proxy-ok");
    socket.close(); await once(socket, "close");
    // The same trusted certificate must still fail hostname verification.
    await assert.rejects(transport.fetch(`https://wrong-host.invalid:${destinationPort}`), error => error.cause?.code === "ERR_TLS_CERT_ALTNAME_INVALID");
    const invalidSocket = new WebSocket(`wss://wrong-host.invalid:${destinationPort}`);
    await assert.rejects(once(invalidSocket, "open"), error => error.code === "ERR_TLS_CERT_ALTNAME_INVALID");
    assert.ok(connects >= 5);
  } finally {
    await transport.close();
    for (const socket of sockets) socket.destroy();
    wss.close();
    await Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => destination.close(resolve))]);
  }
}

if (process.env.SW_PROXY_FIXTURE_DIR) {
  fixture().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { test } = require("node:test");
  test("Discord REST, gateway WSS and economy fetch use CONNECT proxy with TLS validation", { timeout: 20000 }, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sw-proxy-"));
    try {
      const certificate = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(directory, "key.pem"), "-out", path.join(directory, "cert.pem"), "-days", "1", "-subj", "/CN=proxy-target.invalid", "-addext", "subjectAltName=DNS:proxy-target.invalid"], { encoding: "utf8" });
      assert.equal(certificate.status, 0, certificate.stderr);
      const child = spawnSync(process.execPath, [__filename], { encoding: "utf8", timeout: 15000, env: { ...process.env, NODE_EXTRA_CA_CERTS: path.join(directory, "cert.pem"), SW_PROXY_FIXTURE_DIR: directory } });
      assert.equal(child.error, undefined, (child.error?.message || "") + child.stdout + child.stderr);
      assert.equal(child.status, 0, child.stdout + child.stderr);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
}
