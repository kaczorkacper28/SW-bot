"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { once } = require("node:events");
const { createPanelServer } = require("../panel/server");
const { createAuthStore } = require("../panel/auth-store");

const publicOrigin = "https://origin-fixture.trycloudflare.com";
const password = "Local origin regression fixture password!";

async function fixture(t, options = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-panel-origin-"));
  const server = createPanelServer({ dataDir, bridgeDir: dataDir, publicOrigin, ...options });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  return { server, dataDir, localOrigin: `http://127.0.0.1:${server.address().port}` };
}

function request(server, target = "/", { method = "GET", headers = {}, origin, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const allHeaders = { ...headers };
    if (origin !== undefined) allHeaders.Origin = origin;
    if (payload !== undefined) {
      allHeaders["Content-Type"] = "application/json";
      allHeaders["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request({ hostname: "127.0.0.1", port: server.address().port, path: target, method, headers: allHeaders }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json;
        try { json = JSON.parse(text); } catch { /* Static documents and redirects need no JSON body. */ }
        resolve({ status: response.statusCode, headers: response.headers, text, json });
      });
    });
    req.on("error", reject);
    req.end(payload);
  });
}

function assertRedirect(result, location) {
  assert.ok(result.status >= 300 && result.status < 400, `Expected redirect, got ${result.status}`);
  assert.equal(result.headers.location, location);
  assert.match(result.headers["cache-control"], /no-store/);
  assert.equal(result.headers["set-cookie"], undefined);
}

test("local document navigation uses the configured HTTPS origin and preserves path/query", async t => {
  const f = await fixture(t);
  for (const host of [`127.0.0.1:${f.server.address().port}`, `localhost:${f.server.address().port}`]) {
    for (const method of ["GET", "HEAD"]) {
      for (const target of ["/", "/index.html?view=reports&filter=new"]) {
        const result = await request(f.server, target, { method, headers: { Host: host } });
        assertRedirect(result, publicOrigin + target);
        if (method === "HEAD") assert.equal(result.text, "");
      }
    }
  }
});

test("redirect destination cannot be changed by an absolute request URL or proxy headers", async t => {
  const f = await fixture(t);
  const result = await request(f.server, "https://outside.example/index.html?next=outside", {
    headers: { "X-Forwarded-Host": "outside.example", "X-Forwarded-Proto": "https" },
  });
  assertRedirect(result, publicOrigin + "/index.html?next=outside");
});

test("local readiness endpoint remains reachable while public document navigation redirects", async t => {
  const f = await fixture(t);
  const session = await request(f.server, "/api/session");
  assert.equal(session.status, 200);
  assert.deepEqual(session.json, { authenticated: false });
  assert.equal(session.headers.location, undefined);
  const asset = await request(f.server, "/app.js");
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.location, undefined);
  assertRedirect(await request(f.server), publicOrigin + "/");
});

test("public host serves the panel directly and unrecognized hosts are rejected", async t => {
  const f = await fixture(t);
  const document = await request(f.server, "/", { headers: { Host: new URL(publicOrigin).host } });
  assert.equal(document.status, 200);
  assert.match(document.text, /<!doctype html>/i);
  assert.equal(document.headers.location, undefined);
  const hostile = await request(f.server, "/", { headers: { Host: "outside.example", "CF-Connecting-IP": "203.0.113.7" } });
  assert.equal(hostile.status, 400);
  assert.equal(hostile.headers.location, undefined);
});

test("only explicitly trusted Cloudflare loopback requests bypass local document redirects", async t => {
  const trusted = await fixture(t, { trustCloudflareProxy: true });
  const forwarded = await request(trusted.server, "/", { headers: { "CF-Connecting-IP": "203.0.113.7" } });
  assert.equal(forwarded.status, 200);
  assert.equal(forwarded.headers.location, undefined);
  for (const address of [undefined, "malformed", "203.0.113.7, 203.0.113.8"]) {
    const headers = address === undefined ? {} : { "CF-Connecting-IP": address };
    assertRedirect(await request(trusted.server, "/", { headers }), publicOrigin + "/");
  }
  const untrusted = await fixture(t, { trustCloudflareProxy: false });
  assertRedirect(await request(untrusted.server, "/", { headers: { "CF-Connecting-IP": "203.0.113.7" } }), publicOrigin + "/");
});

test("local and foreign POST origins are rejected without redirecting or issuing sessions", async t => {
  const f = await fixture(t, { trustCloudflareProxy: true });
  createAuthStore({ dataDir: f.dataDir }).upsertAdmin({ username: "owner", password });
  for (const origin of [undefined, "null", "https://outside.example", f.localOrigin]) {
    const response = await request(f.server, "/api/login", {
      method: "POST", origin, body: { username: "owner", password }, headers: { "CF-Connecting-IP": "203.0.113.7" },
    });
    assert.equal(response.status, 403, String(origin));
    assert.equal(response.headers.location, undefined);
    assert.equal(response.headers["set-cookie"], undefined);
  }
  for (const headers of [{ Host: new URL(publicOrigin).host }, { "CF-Connecting-IP": "203.0.113.7" }]) {
    const response = await request(f.server, "/api/login", {
      method: "POST", origin: publicOrigin, body: { username: "owner", password }, headers,
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.username, "owner");
    assert.match(response.headers["set-cookie"][0], /; Secure/);
  }
});

test("ordinary local development still serves and authenticates on its own HTTP origin", async t => {
  const f = await fixture(t, { publicOrigin: null });
  createAuthStore({ dataDir: f.dataDir }).upsertAdmin({ username: "owner", password });
  const document = await request(f.server);
  assert.equal(document.status, 200);
  assert.equal(document.headers.location, undefined);
  const response = await request(f.server, "/api/login", { method: "POST", origin: f.localOrigin, body: { username: "owner", password } });
  assert.equal(response.status, 200);
  assert.equal(response.json.authenticated, true);
  assert.ok(!response.headers["set-cookie"][0].includes("; Secure"));
});
