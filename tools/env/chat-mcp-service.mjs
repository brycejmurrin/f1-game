#!/usr/bin/env node
// @doc Idempotent private tunnel startup, bounded restart supervision and environment readiness diagnostics.
// @skill mcp-probe
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url);
const GATEWAY=path.join(ROOT,'tools/mcp/chat-gateway.mjs');
export function environmentChecks(root=ROOT){
  const checks=[];
  for(const name of ['axe-core','@modelcontextprotocol/sdk','gltf-validator','@gltf-transform/core','@gltf-transform/functions','playwright','sharp']){
    try{require.resolve(name==='@modelcontextprotocol/sdk'?'@modelcontextprotocol/sdk/client/index.js':name);checks.push({name,status:'pass'});}catch{checks.push({name,status:'fail',action:'Run npm ci --include=dev in the checkout.'});}
  }
  const browser=spawnSync(process.execPath,[path.join(root,'tools/lib/chromium-path.mjs'),'--path'],{encoding:'utf8',timeout:10000});
  checks.push({name:'chromium',status:browser.status===0&&browser.stdout.trim()?'pass':'fail',action:browser.status===0?undefined:'Run bash tools/env/install-browsers.sh.'});
  for(const name of ['blender','ffmpeg','inkscape']){
    const result=spawnSync(name,[name==='ffmpeg'?'-version':'--version'],{stdio:'ignore',timeout:10000});
    checks.push({name,status:result.status===0?'pass':'skip',action:result.status===0?undefined:'Optional system package; install through the environment image setup.'});
  }
  checks.push({name:'tunnelCredentialReference',status:process.env.CONTROL_PLANE_API_KEY?'present':'missing',action:'Presence is not proof of authorization; use tunnel-client doctor and a live native call.'});
  return {ok:!checks.some(c=>c.status==='fail'||c.status==='missing'),checks};
}
function identity(pid){try{return fs.readFileSync(`/proc/${pid}/stat`,'utf8').replace(/^.*\) /,'').split(' ')[19];}catch{return null;}}
export function readService(record){
  try{const value=JSON.parse(fs.readFileSync(record,'utf8'));return {...value,running:!['stopped','failed'].includes(value.status)&&identity(value.pid)===value.identity&&!!value.identity};}catch{return {running:false};}
}
export async function main(argv=process.argv.slice(2)){
  const {values,positionals}=parseArgs({args:argv,allowPositionals:true,options:{profile:{type:'string'},'tunnel-client':{type:'string'},help:{type:'boolean'},run:{type:'boolean'}}});
  if(values.help){console.log('Usage: node tools/env/chat-mcp-service.mjs doctor|start|restart|status --profile FILE --tunnel-client EXECUTABLE\nUses an existing private tunnel profile and environment credentials. No tunnel/plugin creation. Start is idempotent. Optional cloud setup: APEX_CHAT_MCP_PROFILE and APEX_TUNNEL_CLIENT_BIN.');return;}
  const command=positionals[0]||'doctor';if(positionals.length>1||!['doctor','start','restart','status'].includes(command))throw new Error('Expected doctor, start, restart or status');
  if(command==='doctor'){const report=environmentChecks();console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;return;}
  const state=path.join(ROOT,'artifacts/run/chat-mcp'),record=path.join(state,'service.json');
  fs.mkdirSync(state,{recursive:true});
  if(command==='status'){const status=readService(record);console.log(JSON.stringify(status,null,2));if(!status.running)process.exitCode=1;return;}
  if(command==='restart'&&readService(record).running){
    const owned=readService(record);if(identity(owned.pid)!==owned.identity)throw new Error('Supervisor identity changed; refusing to signal');
    process.kill(owned.pid,'SIGTERM');
    const deadline=Date.now()+10000;
    while(readService(record).running&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,200));
    if(readService(record).running)throw new Error('Supervisor has not stopped; inspect its existing runtime before retrying');
  }
  if(readService(record).running){console.log(JSON.stringify({status:'already-running',...readService(record)}));return;}
  const profile=values.profile||process.env.APEX_CHAT_MCP_PROFILE;
  const executable=values['tunnel-client']||process.env.APEX_TUNNEL_CLIENT_BIN;
  if(!profile||!executable)throw new Error('Supply existing --profile FILE and --tunnel-client EXECUTABLE. No credentials in arguments.');
  const profilePath=fs.realpathSync(profile),binary=fs.realpathSync(executable);
  if(!values.run){
    const ready=spawnSync(binary,['doctor','--profile-file',profilePath,'--mcp.command',`command=${JSON.stringify(process.execPath)} ${JSON.stringify(GATEWAY)},channel=main`],{stdio:'ignore',timeout:20000});
    if(ready.status!==0)throw new Error('Tunnel profile readiness failed. Run tunnel-client doctor --profile-file FILE for actionable checks.');
    const log=fs.openSync(path.join(state,'service.log'),'a',0o600);
    const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'start','--run','--profile',profilePath,'--tunnel-client',binary],{cwd:ROOT,detached:true,stdio:['ignore',log,log]});child.unref();fs.closeSync(log);
    console.log(JSON.stringify({status:'starting',supervisorPid:child.pid,record,log:path.join(state,'service.log')}));return;
  }
  // Atomic ownership lock closes the simultaneous-start race. A stale owner can be reclaimed.
  const lock=path.join(state,'owner');
  try{fs.mkdirSync(lock);}catch(error){
    if(error.code!=='EEXIST')throw error;
    const stat=fs.statSync(lock);if(readService(record).running||Date.now()-stat.mtimeMs<30000)throw new Error('Another startup owns the service lock');
    fs.rmdirSync(lock);fs.mkdirSync(lock);
  }
  let child,stopping=false,restarts=0,timer;
  const save=status=>fs.writeFileSync(record,JSON.stringify({pid:process.pid,identity:identity(process.pid),status,restarts,updatedAt:new Date().toISOString()}));
  const stop=()=>{stopping=true;clearTimeout(timer);if(child){const owned=child;owned.kill('SIGTERM');const force=setTimeout(()=>{if(child===owned)owned.kill('SIGKILL');},5000);force.unref();}else finish();};
  const finish=()=>{save('stopped');try{fs.rmdirSync(lock);}catch{}process.exit(0);};
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  const launch=()=>{
    try{fs.unlinkSync(path.join(state,'health.url'));}catch(error){if(error.code!=='ENOENT')throw error;}
    save('running');child=spawn(binary,['run','--health.url-file',path.join(state,'health.url'),'--profile-file',profilePath,'--log.level','warn','--mcp.stdio-send-initialized-notification','--mcp.command',`command=${JSON.stringify(process.execPath)} ${JSON.stringify(GATEWAY)},channel=main`],{cwd:ROOT,stdio:'ignore'});
    child.once('error',()=>{save('failed');});
    child.once('close',()=>{child=null;if(stopping)return finish();if(++restarts>5){save('failed');try{fs.rmdirSync(lock);}catch{}process.exit(1);}save('restarting');timer=setTimeout(launch,Math.min(30000,1000*2**restarts));});
  };launch();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
