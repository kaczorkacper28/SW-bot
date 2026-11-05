"use strict";
// Both programs remain separate processes and share one bot management service.
const { spawn } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const env = { ...process.env };
if (process.argv.includes("--offline")) env.OFFLINE = "1";
let stopping = false;
let exitCode = 0;
const children = ["index.js", "panel/server.js"].map(file => spawn(process.execPath, [file], {
  cwd: root, env, stdio: "inherit"
}));
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  const deadline = setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill("SIGKILL");
  }, 5000);
  deadline.unref();
}
for (const child of children) {
  child.on("error", error => { console.error("Nie udało się uruchomić procesu:", error.message); stop(1); });
  child.on("exit", (code, signal) => {
    if (!stopping) stop(code || (signal ? 1 : 0));
    if (children.every(item => item.exitCode !== null || item.signalCode !== null)) process.exitCode = exitCode;
  });
}
process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
