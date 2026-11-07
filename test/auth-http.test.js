"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { once } = require("node:events");
const { spawnSync } = require("node:child_process");
const { createPanelServer, rateLimitAddress } = require("../panel/server");
const { createAuthStore, hashPassword } = require("../panel/auth-store");

const password = "Fixture password for HTTP accounts!";
const changedPassword = "Replacement fixture HTTP password!";

function request(server, route, { method = "GET", body, cookie, headers = {}, origin } = {}) {
  return new Promise((resolve,reject) => {
    const port = server.address().port;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const allHeaders = { "Content-Type":"application/json", ...headers };
    if (method !== "GET") allHeaders.Origin = origin || `http://127.0.0.1:${port}`;
    if (cookie) allHeaders.Cookie = cookie;
    if (payload !== undefined) allHeaders["Content-Length"] = Buffer.byteLength(payload);
    const req = http.request({ host:"127.0.0.1", port, path:route, method, headers:allHeaders },res => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data",chunk => { text += chunk; });
      res.on("end",() => {
        try { resolve({ status:res.statusCode, data:text ? JSON.parse(text) : null, headers:res.headers }); }
        catch(error) { reject(error); }
      });
    });
    req.on("error",reject); req.end(payload);
  });
}
async function login(server, username, passwordValue = password, options = {}) {
  const result = await request(server,"/api/login",{ method:"POST",body:{ username,password:passwordValue },...options });
  return { ...result, cookie:result.headers["set-cookie"]?.[0].split(";")[0] };
}
async function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),"sw-auth-http-"));
  const auth = createAuthStore({ dataDir:directory });
  const owner = auth.upsertAdmin({ username:"owner",password });
  const operator = auth.createUser({ username:"operator",password,role:"operator" });
  const viewer = auth.createUser({ username:"viewer",password,role:"viewer" });
  const bridgeCalls = [];
  const key = "a".repeat(64);
  fs.writeFileSync(path.join(directory,"panel-bridge.key"),key,{ mode:0o600 });
  const bridge = http.createServer((req,res) => {
    assert.equal(req.headers.authorization,`Bearer ${key}`);
    bridgeCalls.push({ method:req.method,path:req.url,user:req.headers["x-panel-user"] });
    req.resume();
    res.writeHead(req.method === "POST" && !req.url.includes("/retry") ? 201 : 200,{ "Content-Type":"application/json" });
    res.end(JSON.stringify(req.method === "GET" ? { collections:{},status:{ mode:"offline" },notifications:[] } : { ok:true,record:{ id:"fixture" } }));
  });
  bridge.listen(0,"127.0.0.1"); await once(bridge,"listening");
  const panel = createPanelServer({ dataDir:directory,bridgeDir:directory,bridgePort:bridge.address().port,...options });
  panel.listen(0,"127.0.0.1"); await once(panel,"listening");
  t.after(async() => {
    await new Promise(resolve => panel.close(resolve));
    await new Promise(resolve => bridge.close(resolve));
    fs.rmSync(directory,{ recursive:true,force:true });
  });
  return { panel,bridge,auth,owner,operator,viewer,directory,bridgeCalls };
}

test("individual logins expose role and stable id without password material",async t => {
  const f = await fixture(t);
  for (const [username,role] of [["owner","admin"],["operator","operator"],["viewer","viewer"]]) {
    const result = await login(f.panel,username);
    assert.equal(result.status,200);
    assert.equal(result.data.username,username);
    assert.equal(result.data.role,role);
    assert.equal(typeof result.data.id,"string");
    const session = await request(f.panel,"/api/session",{ cookie:result.cookie });
    assert.deepEqual(session.data,result.data);
    const exposed = JSON.stringify([result.data,session.data]);
    assert.ok(!exposed.includes(password) && !exposed.includes("passwordHash") && !exposed.includes("salt"));
  }
});

test("viewer reads only; operator edits and publishes but cannot manage users or retry notifications",async t => {
  const f = await fixture(t);
  const viewer = await login(f.panel,"viewer"), operator = await login(f.panel,"operator");
  assert.equal((await request(f.panel,"/api/state",{ cookie:viewer.cookie })).status,200);
  assert.equal((await request(f.panel,"/api/notifications",{ cookie:viewer.cookie })).status,200);
  for (const [route,method] of [["/api/prisoners","POST"],["/api/prisoners/1","PATCH"],["/api/prisoners/1","DELETE"],["/api/actions/publish","POST"]]) {
    assert.equal((await request(f.panel,route,{ method,body:{},cookie:viewer.cookie })).status,403);
    assert.ok([200,201].includes((await request(f.panel,route,{ method,body:{},cookie:operator.cookie })).status));
  }
  assert.equal((await request(f.panel,"/api/users",{ cookie:viewer.cookie })).status,403);
  assert.equal((await request(f.panel,"/api/users",{ cookie:operator.cookie })).status,403);
  assert.equal((await request(f.panel,"/api/users",{ method:"POST",body:{ username:"forbidden",password,role:"admin" },cookie:operator.cookie })).status,403);
  assert.equal((await request(f.panel,"/api/notifications/fixture/retry",{ method:"POST",body:{},cookie:operator.cookie })).status,403);
  assert.ok(f.bridgeCalls.every(call => call.method === "GET" || call.user === "operator"));
});

test("admin creates, resets, changes roles and disables accounts with immediate session revocation",async t => {
  const f = await fixture(t);
  const owner = await login(f.panel,"owner");
  const create = await request(f.panel,"/api/users",{ method:"POST",cookie:owner.cookie,body:{ username:"recruit",password,role:"operator" } });
  assert.equal(create.status,201);
  const id = create.data.user.id;
  assert.equal(create.data.user.role,"operator");
  const recruit = await login(f.panel,"recruit");
  assert.equal((await request(f.panel,`/api/users/${id}`,{ method:"PATCH",cookie:owner.cookie,body:{ password:changedPassword } })).status,200);
  assert.deepEqual((await request(f.panel,"/api/session",{ cookie:recruit.cookie })).data,{ authenticated:false });
  assert.equal((await request(f.panel,"/api/state",{ cookie:recruit.cookie })).status,401);
  assert.equal((await login(f.panel,"recruit")).status,401);
  const reset = await login(f.panel,"recruit",changedPassword);
  assert.equal(reset.status,200);
  assert.equal((await request(f.panel,`/api/users/${id}`,{ method:"PATCH",cookie:owner.cookie,body:{ role:"viewer" } })).status,200);
  assert.equal((await request(f.panel,"/api/state",{ cookie:reset.cookie })).status,401);
  const reader = await login(f.panel,"recruit",changedPassword);
  assert.equal(reader.data.role,"viewer");
  assert.equal((await request(f.panel,`/api/users/${id}`,{ method:"PATCH",cookie:owner.cookie,body:{ active:false } })).status,200);
  assert.equal((await request(f.panel,"/api/state",{ cookie:reader.cookie })).status,401);
  assert.equal((await login(f.panel,"recruit",changedPassword)).status,401);
  assert.equal((await request(f.panel,`/api/users/${id}`,{ method:"DELETE",cookie:owner.cookie,body:{} })).status,200);
  const users = await request(f.panel,"/api/users",{ cookie:owner.cookie });
  assert.ok(!users.data.users.some(user => user.id === id));
  assert.ok(!JSON.stringify(users.data).includes("passwordHash"));
  assert.equal((await request(f.panel,"/api/notifications/fixture/retry",{ method:"POST",body:{},cookie:owner.cookie })).status,200);
});

test("last administrator and caller self-delete or deactivation cannot lock out the installation",async t => {
  const f = await fixture(t);
  const owner = await login(f.panel,"owner");
  for (const [method,body] of [["PATCH",{ role:"viewer" }],["PATCH",{ active:false }],["DELETE",{}]]) {
    assert.equal((await request(f.panel,`/api/users/${f.owner.id}`,{ method,body,cookie:owner.cookie })).status,409);
  }
  assert.equal((await request(f.panel,"/api/state",{ cookie:owner.cookie })).status,200);
  assert.equal((await request(f.panel,"/api/users",{ method:"POST",body:{ username:"weak",password:"short",role:"admin" },cookie:owner.cookie })).status,400);
  assert.equal((await request(f.panel,"/api/users",{ method:"POST",body:{ username:"owner",password,role:"admin" },cookie:owner.cookie })).status,409);
});

test("administrator CLI resets only its selected account and preserves other individual accounts",async t => {
  const f = await fixture(t);
  const owner = await login(f.panel,"owner");
  const result = spawnSync(process.execPath,[path.join(__dirname,"..","panel","setup-admin.js"),"--username","owner"],{ cwd:f.directory,env:{ ...process.env,PANEL_DATA_DIR:f.directory,PANEL_ADMIN_PASSWORD:"" },input:changedPassword+"\n",encoding:"utf8" });
  assert.equal(result.status,0,result.stderr);
  assert.ok(!result.stdout.includes(changedPassword));
  assert.equal((await request(f.panel,"/api/state",{ cookie:owner.cookie })).status,401);
  assert.equal((await login(f.panel,"owner",changedPassword)).status,200);
  assert.equal((await login(f.panel,"operator")).status,200);
  assert.equal(f.auth.listUsers().length,3);
});

test("legacy hash migrates to the authoritative store and stale legacy credentials stay disabled",async t => {
  const f = await fixture(t);
  // Only fixture data is reset to simulate an existing single-admin installation.
  fs.rmSync(path.join(f.directory,"panel-users.json"));
  const legacyHash = hashPassword(password);
  fs.writeFileSync(path.join(f.directory,"panel-admin.json"),JSON.stringify({ username:"legacy",...legacyHash }));
  const legacy = await login(f.panel,"legacy");
  assert.equal(legacy.status,200);
  assert.equal(legacy.data.role,"admin");
  assert.equal((await request(f.panel,`/api/users/${legacy.data.id}`,{ method:"PATCH",cookie:legacy.cookie,body:{ password:changedPassword } })).status,200);
  assert.equal((await login(f.panel,"legacy")).status,401);
  assert.equal((await login(f.panel,"legacy",changedPassword)).status,200);
});

test("HTTPS public origin issues Secure cookies and retains strict CSRF checks",async t => {
  const f = await fixture(t,{ publicOrigin:"https://fixture.trycloudflare.com",trustCloudflareProxy:true });
  const settings = { headers:{ Host:"fixture.trycloudflare.com" },origin:"https://fixture.trycloudflare.com" };
  const owner = await login(f.panel,"owner",password,settings);
  assert.equal(owner.status,200);
  assert.match(owner.headers["set-cookie"][0],/; Secure/);
  assert.equal((await request(f.panel,"/api/users",{ method:"POST",cookie:owner.cookie,body:{ username:"extra",password,role:"viewer" },headers:settings.headers,origin:"https://outside.example" })).status,403);
});

test("Cloudflare client IP is trusted only for the opted-in HTTPS loopback proxy",() => {
  const req = (remote,ip) => ({ socket:{ remoteAddress:remote },headers:{ "cf-connecting-ip":ip } });
  const options = { publicOrigin:"https://fixture.trycloudflare.com",trustCloudflareProxy:true };
  assert.equal(rateLimitAddress(req("127.0.0.1","203.0.113.4"),options),"203.0.113.4");
  assert.equal(rateLimitAddress(req("127.0.0.1","malformed"),options),"127.0.0.1");
  assert.equal(rateLimitAddress(req("203.0.113.1","203.0.113.4"),options),"203.0.113.1");
  assert.equal(rateLimitAddress(req("127.0.0.1","203.0.113.4"),{ ...options,trustCloudflareProxy:false }),"127.0.0.1");
  assert.equal(rateLimitAddress(req("127.0.0.1","203.0.113.4"),{ ...options,publicOrigin:"http://fixture.example" }),"127.0.0.1");
});

test("public origin rejects unencrypted remote addresses and permits local development HTTP",() => {
  assert.throws(() => createPanelServer({ publicOrigin:"http://panel.example.org" }),/HTTPS/);
  assert.doesNotThrow(() => createPanelServer({ publicOrigin:"http://localhost:3200" }));
});

test("successful viewer login cannot reset another account's failed password counter",async t => {
  const f = await fixture(t);
  for (let i = 0; i < 10; i++) {
    assert.equal((await login(f.panel,"owner","wrong fixture password")).status,401);
    assert.equal((await login(f.panel,"viewer")).status,200);
  }
  assert.equal((await login(f.panel,"owner",password)).status,429);
});
