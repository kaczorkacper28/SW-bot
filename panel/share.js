"use strict";
const path = require("node:path");
const net = require("node:net");
const http = require("node:http");
const { spawn } = require("node:child_process");

function tunnelOrigin(text) {
  const urls = String(text).match(/https:\/\/[^\s|<>"']+/g) || [];
  for (const candidate of urls) {
    try {
      const value = new URL(candidate);
      if (value.protocol === "https:" && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.trycloudflare\.com$/.test(value.hostname) && !value.username && !value.password && !value.port && value.pathname === "/" && !value.search && !value.hash) return value.origin;
    } catch { /* Only exact HTTPS Quick Tunnel origins are accepted. */ }
  }
  return null;
}
async function requireFreePort(port) {
  await new Promise((resolve,reject) => {
    const probe = net.createServer();
    probe.once("error",() => reject(new Error(`Port ${port} jest zajęty. Zatrzymaj poprzedni panel przez CTRL+C i spróbuj ponownie.`)));
    probe.listen(port,"127.0.0.1",() => probe.close(resolve));
  });
}
function panelReady(port) {
  return new Promise(resolve => {
    const request = http.get({ hostname:"127.0.0.1",port,path:"/api/session",agent:false,timeout:1000 },response => {
      let body = "";
      response.on("data",chunk => { if (body.length < 4096) body += chunk; });
      response.on("end",() => { try { resolve(response.statusCode === 200 && typeof JSON.parse(body).authenticated === "boolean"); } catch { resolve(false); } });
    });
    request.on("timeout",() => request.destroy()); request.on("error",() => resolve(false));
  });
}

async function runShare({
  directory = path.resolve(__dirname,".."), environment = process.env,
  tunnelCommand = ["cloudflared"], appScript = path.join(__dirname,"..","scripts","start-all.js"),
  hasAdmin, output = process.stdout, errorOutput = process.stderr, startupTimeout = 90000,
  offline = process.argv.includes("--offline"),
} = {}) {
  const port = Number(environment.PANEL_PORT || 3200);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PANEL_PORT musi mieć wartość od 1 do 65535.");
  if (!hasAdmin) {
    const dataDir = environment.PANEL_DATA_DIR || environment.SW_DATA_DIR || path.join(directory,"data");
    hasAdmin = () => require("./auth-store").createAuthStore({ dataDir }).hasUsers();
  }
  if (!hasAdmin()) throw new Error("Najpierw utwórz konto administratora: npm run panel:admin -- --username NAZWA.");
  await requireFreePort(port);
  output.write("Uruchamianie dostępu HTTPS. Link będzie działać, gdy telefon i Termux pozostaną uruchomione.\n");
  const children = new Set();
  let app, origin, registered = false, ready = false, stopping = false, exitCode = 0, buffer = "", polling = false;
  let resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  let shutdownTimer;
  let timeout;
  const finish = () => {
    if (!stopping || children.size) return;
    clearTimeout(timeout); clearTimeout(shutdownTimer); clearInterval(poll);
    process.removeListener("SIGINT",onSignal); process.removeListener("SIGTERM",onSignal);
    resolveDone(exitCode);
  };
  const stop = (code = 0,message) => {
    if (code) exitCode = code;
    if (message) errorOutput.write(message + "\n");
    if (stopping) return;
    stopping = true;
    clearTimeout(timeout); clearInterval(poll);
    for (const child of children) child.kill("SIGTERM");
    shutdownTimer = setTimeout(() => { for (const child of children) child.kill("SIGKILL"); },6000);
    shutdownTimer.unref(); finish();
  };
  function onSignal() { stop(); }
  const track = (child,name) => {
    children.add(child);
    child.once("error",error => stop(1,name === "tunnel" && error.code === "ENOENT" ? "Zainstaluj cloudflared w Termuxie: pkg install cloudflared" : `Nie można uruchomić procesu ${name}.`));
    child.once("close",code => {
      children.delete(child);
      if (!stopping) stop(Number.isInteger(code) && code ? code : 1,name === "tunnel" ? "Tunel zakończył pracę. Link HTTPS nie jest już dostępny." : "Panel zakończył pracę. Sprawdź komunikaty powyżej.");
      finish();
    });
    return child;
  };
  const poll = setInterval(async () => {
    if (!app || !registered || ready || stopping || polling) return;
    polling = true;
    const healthy = await panelReady(port);
    polling = false;
    if (!healthy || stopping) return;
    ready = true; clearTimeout(timeout); clearInterval(poll);
    output.write(`\nLINK DO PULPITU: ${origin}\nUdostępnij ten link osobom z utworzonymi kontami. Otwieraj go również na swoim telefonie.\nAdres może zmienić się po ponownym uruchomieniu. CTRL+C zamyka udostępnianie.\n`);
  },150);
  timeout = setTimeout(() => stop(1,"Nie udało się uruchomić linku HTTPS. Sprawdź internet i komunikaty cloudflared; panel możesz uruchomić lokalnie przez npm run dev."),startupTimeout);
  process.once("SIGINT",onSignal); process.once("SIGTERM",onSignal);
  const tunnel = track(spawn(tunnelCommand[0],[...tunnelCommand.slice(1),"tunnel","--no-autoupdate","--protocol","http2","--loglevel","info","--url",`http://127.0.0.1:${port}`],{ cwd:directory,env:{...environment},stdio:["ignore","pipe","pipe"] }),"tunnel");
  for (const stream of [tunnel.stdout,tunnel.stderr]) stream?.on("data",chunk => {
    if (stopping) return;
    buffer = (buffer + chunk).slice(-16384);
    if (/Registered tunnel connection/.test(buffer)) registered = true;
    const discovered = tunnelOrigin(buffer);
    if (!origin && discovered) {
      origin = discovered;
      app = track(spawn(process.execPath,[appScript,...(offline ? ["--offline"] : [])],{ cwd:directory,env:{...environment,PANEL_HOST:"127.0.0.1",PANEL_PORT:String(port),PANEL_PUBLIC_ORIGIN:origin,PANEL_TRUST_CLOUDFLARE:"1"},stdio:["ignore","inherit","inherit"] }),"panel");
    }
  });
  return done;
}
if (require.main === module) {
  require("dotenv").config({path:path.join(__dirname,"..",".env"),quiet:true});
  runShare().then(code => { process.exitCode = code; }).catch(error => { console.error(error.message);process.exitCode = 1; });
}
module.exports = { runShare,tunnelOrigin,panelReady };
