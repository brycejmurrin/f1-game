import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
function fn(source, name) {
  const start = source.indexOf('function ' + name + '('); assert.ok(start >= 0, name);
  let i = source.indexOf('{', start), depth = 1, end = i + 1;
  for (; depth; end++) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; }
  return source.slice(start, end);
}
const tlx = read('js/render/three/tlx.js');
function ctx(values, code) { const c = vm.createContext(values); vm.runInContext(code, c); return c; }
for (const warm of [false, true]) test(`coalesced teardown retires object and owned geometry once (warm=${warm})`, () => {
  const events = [], geometry = { dispose() { events.push('geometry'); } };
  const mesh = { geometry, material: {}, parent: { remove() { events.push('remove'); } }, dispatchEvent(e) { events.push(e.type); } };
  const source = {}, runs = new Map([[source, [{ imesh: mesh }]]]);
  const c = ctx({ _warmPending: warm, _dropQueue: [], _coRuns: runs, _instRegistry: [mesh] }, fn(tlx, 'dropWrapper') + fn(tlx, 'flushDropped') + fn(tlx, '_coDrop'));
  c._coDrop(source); c._coDrop(source);
  assert.equal(runs.size, 0); assert.equal(c._instRegistry.length, 0);
  assert.equal(events.filter(e => e === 'dispose').length, warm ? 0 : 1);
  assert.equal(events.filter(e => e === 'geometry').length, warm ? 0 : 1);
  c._warmPending = false; c.flushDropped(); c.flushDropped(); c.dropWrapper(mesh, geometry);
  assert.equal(events.filter(e => e === 'dispose').length, 1); assert.equal(events.filter(e => e === 'geometry').length, 1);
  assert.equal(mesh.geometry, null); assert.equal(mesh.material, null);
  assert.ok(events.indexOf('dispose') < events.indexOf('geometry'));
});
for (const requested of [null, '8', '999']) for (const cap of [1, 2, 4, 8, 16]) test(`material-array detail ${requested} respects cap ${cap}`, () => {
  const c = ctx({ materialArrayDetail: null, localStorage: { getItem: () => requested }, renderer: { getMaxAnisotropy: () => cap } }, fn(tlx, 'materialArrayAnisotropy'));
  assert.equal(c.materialArrayAnisotropy(), Math.min(requested === '8' ? 8 : 4, cap));
});

test('alternate init revocation prevents late canvas claim and publication', async () => {
  let finish, claims = 0;
  const canvas = { width: 100, getContext() { assert.equal(this, canvas); claims++; return {}; } };
  const c = ctx({ Log: { info() {} }, TLX: { create: async (leased) => { await new Promise(r => { finish = r; }); assert.equal(leased.getContext('webgpu'), null); leased.width = 999; return { backend: 'three' }; } } }, read('js/render/gfx.js') + ';globalThis.G=Gfx;');
  const owner = c.G.createInitOwner(canvas), pending = c.G.create(canvas, { backend: 'three', initOwner: owner });
  owner.abort(); finish(); assert.equal(await pending, null); assert.equal(claims, 0); assert.equal(canvas.width, 100); assert.equal(owner.claimed, false);
});
test('alternate init records a context already claimed before timeout', () => {
  const c = ctx({}, read('js/render/gfx.js') + ';globalThis.G=Gfx;');
  const owner = c.G.createInitOwner({ getContext: () => ({}) }); owner.canvas.getContext('webgpu'); owner.abort();
  assert.equal(owner.claimed, true); assert.equal(owner.active, false); assert.equal(owner.canvas.getContext('webgl2'), null);
});

test('GLX particle buffers retain independent stream payloads and refresh cross-stream epochs', () => {
  let uploads = 0; const c = ctx({
    ctxGone:()=>false, particleProg:{}, particleU:{}, frameEye:[0,0,0], frameViewProj:[], frameSunColor:null, frameAmbSky:[], frameAmbGround:[],
    _particleFog:{color:[],density:0}, _partEpochs:new WeakMap(), _partEpoch:0, _partResident:[], particleVAO:[{},{}],particleVBO:[{},{}],particleCap:[0,0],
    useProg(){},bindVAO(){},setBlend(){},setDepthMask(){},setCull(){},setAlphaWrite(){},
    gl:{uniformMatrix4fv(){},uniform3fv(){},uniform1f(){},bindBuffer(){},bufferData(){},bufferSubData(){uploads++;},blendFunc(){},drawArrays(){}},
  }, fn(read('js/render/glx/glx.js'),'drawParticles'));
  const a = new Float32Array(60), b = new Float32Array(60);
  c.drawParticles(a,60,false,true);c.drawParticles(b,60,true,true);
  c.drawParticles(a,60,false,false);c.drawParticles(b,60,true,false);assert.equal(uploads,2);
  c.drawParticles(a,60,true,true);c.drawParticles(a,60,false,false);assert.equal(uploads,4);
  c.drawParticles(a,30,false,false);assert.equal(uploads,5);
});

test('TLX particle streams refresh when identity, epoch or count changes', () => {
  let uploads=0;
  const slot = () => ({stride:10,ib:{array:new Float32Array(120)},geo:{setDrawRange(){}}});
  const methodStart=tlx.indexOf('        drawParticles(data,');
  const method=tlx.slice(methodStart,tlx.indexOf('        drawDecal(',methodStart)).replace('drawParticles(', 'function drawParticles(').replace(/,\s*$/, '');
  const c=ctx({fx:{particleMats:[{},{}]},frameEye:[0,0,0],partStreams:[slot(),slot()],_partEpochs:new WeakMap(),_partEpoch:0,_wrapPart:false,
    Float32Array,ensureStream:()=>false,uploadStream(){uploads++;},pushRec(){},_fxFrame:{particles:0}}, method);
  const a=new Float32Array(60),b=new Float32Array(60);
  c.drawParticles(a,60,false,true);c.drawParticles(b,60,true,true);
  c.drawParticles(a,60,false,false);c.drawParticles(b,60,true,false);assert.equal(uploads,2);
  c.drawParticles(a,60,true,true);c.drawParticles(a,60,false,false);assert.equal(uploads,4);
  c.drawParticles(a,30,false,false);assert.equal(uploads,5);
});

test('expanded renderer details shows post degradation and deliberate retry, clears on replacement',()=>{
  const ids=new Map();let health={state:'degraded',attempts:3,maxAttempts:3,reason:'compile failed'},retries=0;
  const node=()=>({children:[],hidden:false,setAttribute(){},addEventListener(type,cb){this[type]=cb;},appendChild(n){this.children.push(n);if(n.id)ids.set(n.id,n);},set textContent(v){this.text=v;this.children=[];},get textContent(){return this.text;}});
  const details=node(),summary={parentElement:details};
  const c=ctx({document:{createElement:node,getElementById:id=>ids.get(id)},GLX:{postHealth:()=>health,retryPost(){retries++;health={state:'recovering',attempts:0,maxAttempts:3};}}},fn(read('js/perf/renderer-picker.js'),'paintPostHealth'));
  c.paintPostHealth(summary);const row=ids.get('pm-post-health');assert.match(row.text,/compile failed/);assert.equal(row.children.length,1);
  row.children[0].click();assert.equal(retries,1);assert.match(row.text,/recovering/);assert.equal(row.children.length,0);
  health={state:'degraded',reason:'reload required',retryable:false};c.paintPostHealth(summary);assert.equal(row.children.length,0,'terminal fallback offers no impossible retry');
  health={state:'healthy'};c.paintPostHealth(summary);assert.equal(row.hidden,true);
  health=null;c.paintPostHealth(summary);assert.equal(row.hidden,true);
});


test('material-array detail stays identical between placeholder and late pack upload',()=>{
  let requested='8';const c=ctx({materialArrayDetail:null,localStorage:{getItem:()=>requested},renderer:{getMaxAnisotropy:()=>16}},fn(tlx,'materialArrayAnisotropy'));
  assert.equal(c.materialArrayAnisotropy(),8);requested=null;assert.equal(c.materialArrayAnisotropy(),8,'reload applies setting changes to a new renderer only');
});

test('post health distinguishes bounded recovering and exhausted degradation with a bounded reason',()=>{
  const state=tlx.slice(tlx.indexOf('      let _postStrikes ='),tlx.indexOf('      const ENV_SIZE'));
  const c=ctx({post:{}},state+';globalThis.health=()=>_postHealth;');
  assert.equal(c.health().state,'recovering');
  assert.match(c.health().reason,/first completed post frame/);
  vm.runInContext('_postStrikes=2;_postRebuild=true;postFailure("injected\\n failure");',c);
  assert.equal(c.health().state,'recovering');assert.equal(c.health().attempts,2);assert.equal(c.health().reason,'injected failure');
  vm.runInContext('_postStrikes=4;_postRebuild=false;postFailure("x".repeat(500));',c);
  assert.equal(c.health().state,'degraded');assert.equal(c.health().reason.length,160);
});


test('terminal renderer fallback marks degradation and refuses post retry without lit/FX',()=>{
  const state=tlx.slice(tlx.indexOf('      let _postStrikes ='),tlx.indexOf('      const ENV_SIZE'));
  const drop=tlx.slice(tlx.indexOf('      const dropTo ='),tlx.indexOf('      // the backend object'));
  const methodStart=tlx.indexOf('        retryPost()');
  const method=tlx.slice(methodStart,tlx.indexOf('        backend:',methodStart)).replace('retryPost()', 'function retryPost()').replace(/,\s*$/, '');
  let disposed=0;
  const c=ctx({post:{dispose(){disposed++;}},_drawMatMode:0,_cancelSoftBlits(){},sky:null,hideSkyMesh(){},scene:{},lit:{},fx:{},meshPool:[],_poolBatch:0,unlitInstancedMat:{},_instRegistry:[]},state+drop+method+';globalThis.drop=dropTo;globalThis.health=()=>_postHealth;');
  c.drop(1,{});assert.equal(disposed,1);assert.equal(c.health().state,'degraded');assert.match(c.health().reason,/reload/);
  assert.equal(c.retryPost(),false);assert.equal(c.lit,null);assert.equal(c.fx,null);
});


test('post health becomes healthy only after successful post presentation',()=>{
  const marker='                post.present(opts, _postF);';
  const a=tlx.indexOf(marker),b=tlx.indexOf('              } finally',a);
  assert.ok(a>0&&b>a);const block=tlx.slice(a,b);let fail=true;
  const c=ctx({post:{present(){if(fail)throw new Error('post failure');}},opts:{},_postF:{},_postStrikes:1,_postHealth:{state:'recovering'}},'globalThis.present=function(){'+block+'};');
  assert.throws(()=>c.present(),/post failure/);assert.equal(c._postHealth.state,'recovering');
  fail=false;c.present();assert.equal(c._postHealth.state,'healthy');assert.equal(c._postHealth.reason,'');
});
