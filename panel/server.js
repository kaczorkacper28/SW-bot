"use strict";

require("dotenv").config({ quiet: true });

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);
const MAX_BODY = 65536;
const SESSION_AGE = 8 * 60 * 60 * 1000;
const COOKIE = "sw_panel_session";
const RESOURCES = "members|prisoners|ranks|reports|calls|documents|proposals|payouts";

function send(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    let failed = false;
    const chunks = [];
    request.on("data", chunk => {
      bytes += chunk.length;
      if (bytes > MAX_BODY) {
        if (!failed) reject(Object.assign(new Error("Żądanie jest za duże."), { status: 413 }));
        failed = true;
      } else if (!failed) chunks.push(chunk);
    });
    request.on("end", () => { if (!failed) resolve(Buffer.concat(chunks)); });
    request.on("error", reject);
  });
}

function createPanelServer(options = {}) {
  const dataDir = options.dataDir || process.env.PANEL_DATA_DIR || process.env.SW_DATA_DIR || path.join(__dirname, "..", "data");
  const bridgeDir = options.bridgeDir || process.env.MANAGEMENT_DATA_DIR || process.env.SW_DATA_DIR || path.join(__dirname, "..", "data");
  const publicDir = options.publicDir || path.join(__dirname, "public");
  const bridgePort = options.bridgePort ?? Number(process.env.MANAGEMENT_PORT || 3210);
  const publicOrigin = options.publicOrigin || process.env.PANEL_PUBLIC_ORIGIN || null;
  if (publicOrigin && new URL(publicOrigin).origin !== publicOrigin) throw new Error("PANEL_PUBLIC_ORIGIN musi zawierać sam origin, bez ścieżki.");
  const sessions = new Map();
  const attempts = new Map();
  const mutation = new RegExp(`^/api/(${RESOURCES})(?:/[^/]+)?$`);

  const server = http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
    try {
      const port = server.address().port;
      const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
      if (publicOrigin) allowedHosts.add(new URL(publicOrigin).host);
      if (!allowedHosts.has(request.headers.host)) return send(response, 400, { error: "Nieprawidłowy adres panelu." });
      const origin = publicOrigin || `http://${request.headers.host}`;
      const url = new URL(request.url, origin);
      const isMutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
      if (isMutation && request.headers.origin !== origin) return send(response, 403, { error: "Żądanie musi pochodzić z panelu." });
      if (isMutation && !String(request.headers["content-type"] || "").startsWith("application/json")) return send(response, 415, { error: "Wymagany format application/json." });
      const now = Date.now();
      for (const [token, session] of sessions) if (session.expiresAt <= now) sessions.delete(token);
      for (const [address, attempt] of attempts) if (attempt.expiresAt <= now) attempts.delete(address);
      const cookie = String(request.headers.cookie || "").split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`));
      const token = cookie ? cookie.slice(COOKIE.length + 1) : "";
      let session = sessions.get(token);
      if (session && session.expiresAt <= now) { sessions.delete(token); session = undefined; }
      if (request.method === "GET" && url.pathname === "/api/session") return send(response, 200, session ? { authenticated: true, username: session.username } : { authenticated: false });
      if (request.method === "POST" && url.pathname === "/api/login") {
        const address = request.socket.remoteAddress;
        const attempt = attempts.get(address) || { count: 0, expiresAt: now + 15 * 60 * 1000 };
        if (attempt.count >= 10) return send(response, 429, { error: "Zbyt wiele prób logowania. Spróbuj za 15 minut." });
        attempts.set(address, { ...attempt, count: attempt.count + 1 });
        let input;
        try { input = JSON.parse((await readBody(request)).toString("utf8")); }
        catch (error) { if (error.status) throw error; return send(response, 400, { error: "Nieprawidłowy JSON." }); }
        if (typeof input?.username !== "string" || typeof input?.password !== "string" || input.password.length > 1024 || input.username.length > 64) return send(response, 400, { error: "Podaj nazwę użytkownika i hasło." });
        let admin;
        try { admin = JSON.parse(fs.readFileSync(path.join(dataDir, "panel-admin.json"), "utf8")); }
        catch (error) {
          if (error.code === "ENOENT") return send(response, 503, { error: "Najpierw skonfiguruj konto: npm run panel:admin -- --username NAZWA." });
          throw error;
        }
        const candidate = await scrypt(input.password, admin.salt, 32);
        const expected = Buffer.from(admin.passwordHash, "hex");
        const validHash = expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
        if (!validHash || input.username !== admin.username) return send(response, 401, { error: "Nieprawidłowa nazwa użytkownika lub hasło." });
        attempts.delete(address);
        // A successful reauthentication invalidates this browser's earlier session.
        if (token) sessions.delete(token);
        const nextToken = crypto.randomBytes(32).toString("hex");
        sessions.set(nextToken, { username: admin.username, expiresAt: now + SESSION_AGE });
        response.setHeader("Set-Cookie", `${COOKIE}=${nextToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_AGE / 1000}${origin.startsWith("https:") ? "; Secure" : ""}`);
        return send(response, 200, { authenticated: true, username: admin.username });
      }
      if (request.method === "POST" && url.pathname === "/api/logout") {
        if (token) sessions.delete(token);
        response.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${origin.startsWith("https:") ? "; Secure" : ""}`);
        return send(response, 200, { ok: true });
      }
      if (url.pathname.startsWith("/api/")) {
        if (!session) return send(response, 401, { error: "Zaloguj się do panelu." });
        const allowed = (request.method === "GET" && url.pathname === "/api/state") || (["POST", "PATCH", "DELETE"].includes(request.method) && mutation.test(url.pathname)) || (request.method === "POST" && url.pathname === "/api/actions/publish");
        if (!allowed) return send(response, 404, { error: "Nieznane API." });
        let key;
        try { key = fs.readFileSync(path.join(bridgeDir, "panel-bridge.key"), "utf8").trim(); }
        catch (error) { if (error.code === "ENOENT") return send(response, 503, { error: "Bot jest wyłączony. Uruchom npm start lub npm run start:offline." }); throw error; }
        const body = isMutation ? await readBody(request) : undefined;
        const upstream = http.request({
          hostname: "127.0.0.1", port: bridgePort, method: request.method, path: url.pathname,
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Panel-User": session.username, ...(body ? { "Content-Length": body.length } : {}) },
          timeout: 10000,
        }, bridge => {
          response.writeHead(bridge.statusCode, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
          bridge.pipe(response);
        });
        upstream.on("timeout", () => upstream.destroy(new Error("timeout")));
        upstream.on("error", () => { if (!response.headersSent) send(response, 503, { error: "Brak połączenia z botem. Sprawdź proces i port zarządzania." }); else response.destroy(); });
        upstream.end(body);
        return;
      }
      if (!["GET", "HEAD"].includes(request.method)) return send(response, 405, { error: "Niedozwolona metoda." });
      let decoded;
      try { decoded = decodeURIComponent(url.pathname); } catch { return send(response, 400, { error: "Nieprawidłowa ścieżka." }); }
      const filename = path.resolve(publicDir, decoded === "/" ? "index.html" : `.${decoded}`);
      if (!filename.startsWith(`${path.resolve(publicDir)}${path.sep}`)) return send(response, 404, { error: "Nie znaleziono pliku." });
      const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" }[path.extname(filename)];
      if (!mime) return send(response, 404, { error: "Nie znaleziono pliku." });
      try {
        const content = await fs.promises.readFile(filename);
        response.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-store" });
        response.end(request.method === "HEAD" ? undefined : content);
      } catch (error) { if (error.code === "ENOENT" || error.code === "EISDIR") send(response, 404, { error: "Nie znaleziono pliku." }); else throw error; }
    } catch (error) {
      if (!error.status) console.error("Panel request failed:", error.message);
      if (!response.headersSent) send(response, error.status || 500, { error: error.status ? error.message : "Błąd serwera panelu." });
      else response.destroy();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}

if (require.main === module) {
  const server = createPanelServer();
  const port = Number(process.env.PANEL_PORT || 3200);
  const host = process.env.PANEL_HOST || "127.0.0.1";
  server.on("error", error => { console.error(`Nie można uruchomić panelu: ${error.message}`); process.exitCode = 1; });
  server.listen(port, host, () => console.log(`Panel SW nasłuchuje na ${host}:${server.address().port}.`));
  const stop = () => server.close(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

module.exports = { createPanelServer };
