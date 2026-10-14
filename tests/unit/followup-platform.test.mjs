import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { EventEmitter } from 'node:events';
const read = p => fs.readFileSync(new URL('../../'+p, import.meta.url), 'utf8');
const flush = async () => { for(let i=0;i<20;i++) await Promise.resolve(); };
const ps = read('js/ui/platform-session.js');
function section(name) { const start=ps.indexOf('(function '+name+'()');return ps.slice(start,ps.indexOf('})();',start)+5); }
for (const native of [true,false]) test(`web install guidance native=${native}`, () => {
 const els=Object.fromEntries(['ios-install','ios-install-x','install-chip','pm-install'].map(k=>[k,{hidden:true,addEventListener(){}}]));
 const events=new Map();
 const sb={Native:{isNative:()=>native},$:k=>els[k],store:{get:()=>false,set(){}},navigator:{userAgent:'iPhone'},window:{matchMedia:()=>({matches:false}),addEventListener:(k,f)=>events.set(k,f)},setTimeout(){},UiLayers:{inRace:()=>false}};
 vm.runInNewContext(section('iosInstallNudge'),sb); vm.runInNewContext(section('installChip'),sb);
 assert.equal(els['ios-install'].hidden,native);assert.equal(events.has('beforeinstallprompt'),!native);
 if(!native){events.get('beforeinstallprompt')({preventDefault(){}});assert.equal(els['pm-install'].hidden,false);}
});
function desktop(lock=true) {
 const app=new EventEmitter();Object.assign(app,{requestSingleInstanceLock:()=>lock,quit(){app.quits++},quits:0,isReady:()=>true,whenReady:()=>Promise.resolve(),isPackaged:false,commandLine:{appendSwitch(){}},exit(){}});
 const wins=[],dialogs=[];let answer;
 class Win extends EventEmitter {constructor(){super();this.webContents=new EventEmitter();Object.assign(this.webContents,{setWindowOpenHandler(){},session:{setPermissionRequestHandler(){},setPermissionCheckHandler(){}}});wins.push(this)} isDestroyed(){return !!this.dead} isMinimized(){return true} restore(){this.restored=true} show(){} focus(){this.focused=true} destroy(){this.dead=true;this.emit('closed')} setMenuBarVisibility(){} loadURL(url){this.url=url} }
 Win.getAllWindows=()=>wins.filter(w=>!w.dead);
 vm.runInNewContext(read('desktop/main.js'),{require:n=> n==='electron'?{app,BrowserWindow:Win,globalShortcut:{unregisterAll(){}},shell:{},dialog:{showMessageBox:(_w,opts)=>{dialogs.push(opts);return new Promise(r=>answer=r)}}}:n==='node:fs'?{existsSync:()=>true}:n==='node:path'?{join:(...parts)=>parts.join('/')}:n==='./app-protocol'?{SCHEME:'app',HOST:'apex',registerScheme(){},handleScheme(){}}:{requestHandler(){},checkHandler(){}},process:{argv:[],env:{},platform:'linux'},__dirname:'/desktop',console,setTimeout});
 return {app,wins,dialogs,answer:response=>answer({response})};
}
test('desktop secondary exits before creating any window',async()=>{const h=desktop(false);await flush();assert.equal(h.app.quits,1);assert.equal(h.wins.length,0)});
test('desktop focuses primary, explicit crash recovery preserves bundled origin and coalesces',async()=>{
 const h=desktop();await flush();const first=h.wins[0];h.app.emit('second-instance');assert.equal(first.restored,true);assert.equal(first.focused,true);
 first.webContents.emit('render-process-gone',{}, {reason:'crashed'});first.webContents.emit('unresponsive');assert.equal(h.dialogs.length,1);
 assert.deepEqual([...h.dialogs[0].buttons],['Reopen game','Quit']);h.answer(0);await flush();
 assert.equal(h.wins.length,2);assert.equal(h.wins[1].url,'app://apex/');assert.equal(first.dead,true);
 h.wins[1].webContents.emit('render-process-gone',{}, {reason:'crashed'});await flush();assert.equal(h.wins.length,2);assert.equal(h.dialogs.length,2);
 h.answer(1);await flush();assert.equal(h.app.quits,1);
});
test('desktop ignores retired dialog and clean exits',async()=>{const h=desktop();await flush();const w=h.wins[0];w.webContents.emit('render-process-gone',{}, {reason:'clean-exit'});assert.equal(h.dialogs.length,0);w.webContents.emit('unresponsive');w.destroy();h.answer(0);await flush();assert.equal(h.wins.length,1)});
const voiceSource=read('js/audio/voice-pack.js');
const payload=new Uint8Array([1,2,3,4]).buffer;
const hash=createHash('sha256').update(Buffer.from(payload)).digest('hex');
async function voice(man, crypto=webcrypto) {
 const calls=[];const sb=vm.createContext({crypto,Uint8Array,AbortController,setTimeout,clearTimeout,Log:{info(){}},fetch:async u=>{calls.push(u);return {ok:true,json:async()=>man,arrayBuffer:async()=>payload}}});
 vm.runInContext(voiceSource,sb);return {pack:sb.VoicePack.create({}),calls};
}
for(const mode of ['valid','mismatch','legacy','no-crypto']) test('voice integrity '+mode,async()=>{
 const man={v:1,clips:{hello:[0,4,1]},...(mode==='legacy'?{}:{binarySha256:mode==='mismatch'?'0'.repeat(64):hash})};
 const h=await voice(man,mode==='no-crypto'?{}:webcrypto);assert.equal(await h.pack.load('george'),mode==='valid');assert.equal(h.calls.length,2);
});
test('all shipped voice manifests are sealed against unchanged binary content',()=>{
 const dir=new URL('../../assets/voice/',import.meta.url);let count=0;
 for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))){const binary=new URL(file.replace(/\.json$/,'.bin'),dir);if(!fs.existsSync(binary))continue;const man=JSON.parse(fs.readFileSync(new URL(file,dir)));assert.equal(man.binarySha256,createHash('sha256').update(fs.readFileSync(binary)).digest('hex'));assert.equal(man.v,1);count++}assert.equal(count,24);
});
function worker() {
 const handlers=new Map(),data=new Map(),name='apex26-321';let finish;
 const key=u=>typeof u==='string'?u:u.url;
 const cache={match:async u=>data.get(key(u))?.clone(),put:async(u,r)=>data.set(key(u),r.clone())};
 const sb=vm.createContext({self:{location:{origin:'https://apex.test',hostname:'apex.test',href:'https://apex.test/sw.js?v=321'},addEventListener:(k,f)=>handlers.set(k,f),clients:{}},URL,Request,Response,AbortController,setTimeout,clearTimeout,caches:{keys:async()=>[name],open:async()=>cache,match:async u=>cache.match(u)},fetch:()=>new Promise(r=>finish=r)});
 vm.runInContext(read('sw.js'),sb);vm.runInContext('_cacheNameKnown="apex26-321";',sb);
 data.set('__apex_install_settled__',new Response('settled'));
 data.set('__apex_offline_status__',new Response(JSON.stringify({build:321,required:['index.html'],optional:['assets/icons/test.png']})));data.set('index.html',new Response('core'));
 return {data,finish:()=>finish(new Response('optional')),async ask(type){const lifetimes=[];let reply;handlers.get('message')({data:{type},ports:[{postMessage:d=>reply=d,close(){}}],waitUntil:p=>lifetimes.push(p)});await lifetimes[0];return {reply,lifetimes};}};
}
test('offline status distinguishes core, optional misses and cache eviction',async()=>{
 const h=worker();let q=await h.ask('apex-offline-status');assert.equal(q.reply.known,true);assert.equal(q.reply.coreReady,true);assert.equal(q.reply.optionalMissing,1);assert.equal('_cache' in q.reply,false);
 h.data.delete('index.html');q=await h.ask('apex-offline-status');assert.equal(q.reply.coreReady,false);
 h.data.delete('__apex_offline_status__');q=await h.ask('apex-offline-status');assert.equal(q.reply.known,false);
});
test('offline retry coalesces in one generation and records downloaded coverage',async()=>{
 const h=worker(),first=await h.ask('apex-offline-retry');assert.equal(first.reply.retrying,true);const second=await h.ask('apex-offline-retry');assert.equal(second.lifetimes.length,1);
 h.finish();await Promise.all(first.lifetimes);const status=await h.ask('apex-offline-status');assert.equal(status.reply.optionalMissing,0);assert.equal(status.reply.retrying,false);
});
test('offline status rejects hostile summary instead of fetching arbitrary URLs',async()=>{const h=worker();h.data.set('__apex_offline_status__',new Response(JSON.stringify({build:321,required:['index.html'],optional:['https://evil.test/foo']})));assert.equal((await h.ask('apex-offline-retry')).reply.known,false)});
