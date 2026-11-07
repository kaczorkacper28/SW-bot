"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const { spawn,spawnSync } = require("node:child_process");
const { tunnelOrigin,runShare } = require("../panel/share");
const sharePath = path.resolve(__dirname,"../panel/share");
async function freePort() { const server=net.createServer();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port; }
async function fixture(t,{mode="normal",admin=true}={}) {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"sw-share-"));const port=await freePort();
 fs.writeFileSync(path.join(directory,"tunnel.js"),`const mode=${JSON.stringify(mode)};if(mode==='failure')process.exit(9);console.error('https://fixture-panel.trycloudflare.com');if(mode!=='unregistered')console.error('Registered tunnel connection connIndex=0');const keep=setInterval(()=>{if(require('fs').existsSync('drop-tunnel'))process.exit(4)},20);process.on('SIGTERM',()=>{clearInterval(keep);process.exit(0)});`);
 fs.writeFileSync(path.join(directory,"app.js"),`if(process.env.PANEL_PUBLIC_ORIGIN!=='https://fixture-panel.trycloudflare.com'||process.env.PANEL_HOST!=='127.0.0.1'||process.env.PANEL_TRUST_CLOUDFLARE!=='1')process.exit(3);const http=require('http');const s=http.createServer((q,r)=>{r.setHeader('Content-Type','application/json');r.end(JSON.stringify({authenticated:false}))});s.listen(Number(process.env.PANEL_PORT),'127.0.0.1');process.on('SIGTERM',()=>s.close(()=>process.exit(0)));`);
 const code=`require(${JSON.stringify(sharePath)}).runShare({directory:${JSON.stringify(directory)},environment:{...process.env,PANEL_PORT:${JSON.stringify(String(port))}},tunnelCommand:[process.execPath,${JSON.stringify(path.join(directory,"tunnel.js"))}],appScript:${JSON.stringify(path.join(directory,"app.js"))},hasAdmin:()=>${admin},startupTimeout:${mode==='unregistered'?800:5000}}).then(code=>{process.exitCode=code}).catch(error=>{console.error(error.message);process.exitCode=1})`;
 const child=spawn(process.execPath,["-e",code],{cwd:directory,stdio:["ignore","pipe","pipe"]});let output="";let closed=false;const listeners=new Set();
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output+=chunk;for(const call of [...listeners])call()});
 const completion=new Promise(resolve=>child.once('close',(code,signal)=>{closed=true;resolve({code,signal})}));
 const waitFor=pattern=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{listeners.delete(check);reject(new Error('Share helper output missing: '+pattern+'\n'+output))},6000);function check(){if(pattern.test(output)){clearTimeout(timeout);listeners.delete(check);resolve()}}listeners.add(check);check()});
 t.after(async()=>{if(!closed){child.kill('SIGTERM');await completion}fs.rmSync(directory,{recursive:true,force:true})});
 return {directory,port,child,completion,waitFor,output:()=>output};
}
test('only exact safe HTTPS Quick Tunnel origins are accepted',()=>{
 assert.equal(tunnelOrigin('URL: https://fixture-panel.trycloudflare.com |'),'https://fixture-panel.trycloudflare.com');
 for(const value of ['http://fixture.trycloudflare.com','https://fixture.trycloudflare.com.evil.test','https://user:pass@fixture.trycloudflare.com','https://fixture.trycloudflare.com:444','https://fixture.trycloudflare.com/path','https://fixture.trycloudflare.com?secret=x'])assert.equal(tunnelOrigin(value),null);
});
test('sharing requires an existing administrator and leaves services unstarted',async()=>{
 await assert.rejects(runShare({hasAdmin:()=>false,output:{write(){}}}),/Najpierw utwórz konto/);
});
test('share helper configures exact HTTPS origin and closes owned children on signal',{timeout:10000},async t=>{
 const run=await fixture(t);await run.waitFor(/LINK DO PULPITU: https:\/\/fixture-panel.trycloudflare.com/);
 const response=await fetch(`http://127.0.0.1:${run.port}/api/session`);assert.equal(response.status,200);assert.deepEqual(await response.json(),{authenticated:false});
 run.child.kill('SIGTERM');assert.deepEqual(await run.completion,{code:0,signal:null});await assert.rejects(fetch(`http://127.0.0.1:${run.port}/api/session`));
});
test('tunnel failure stops startup with its failure status',{timeout:10000},async t=>{
 const run=await fixture(t,{mode:'failure'});assert.deepEqual(await run.completion,{code:9,signal:null});assert.ok(!run.output().includes('LINK DO PULPITU'));
});
test('an unregistered tunnel never gets reported ready',{timeout:10000},async t=>{
 const run=await fixture(t,{mode:'unregistered'});assert.deepEqual(await run.completion,{code:1,signal:null});assert.ok(!run.output().includes('LINK DO PULPITU'));assert.match(run.output(),/Nie udało się uruchomić linku/);
});
test('a tunnel disconnect closes the owned panel',{timeout:10000},async t=>{
 const run=await fixture(t);await run.waitFor(/LINK DO PULPITU/);fs.writeFileSync(path.join(run.directory,'drop-tunnel'),'');assert.deepEqual(await run.completion,{code:4,signal:null});await assert.rejects(fetch(`http://127.0.0.1:${run.port}/api/session`));
});
test('sharing refuses an occupied panel port before launching a tunnel',async t=>{
 const blocker=net.createServer();await new Promise(resolve=>blocker.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>blocker.close(resolve)));
 await assert.rejects(runShare({environment:{PANEL_PORT:String(blocker.address().port)},hasAdmin:()=>true,tunnelCommand:[process.execPath,'/nonexistent-tunnel-fixture'],output:{write(){}}}),/Port .* jest zajęty/);
});

test('importing the sharing helper does not read local credentials or start processes',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sw-share-import-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));fs.writeFileSync(path.join(directory,'.env'),'SW_SHARE_FIXTURE_MARKER=loaded\n');
 const environment={...process.env};delete environment.SW_SHARE_FIXTURE_MARKER;
 const result=spawnSync(process.execPath,['-e',`require(${JSON.stringify(sharePath)});if(process.env.SW_SHARE_FIXTURE_MARKER)process.exit(3);console.log('IMPORT_OK')`],{cwd:directory,env:environment,encoding:'utf8',timeout:2000});assert.equal(result.status,0);assert.equal(result.stdout.trim(),'IMPORT_OK');
});
