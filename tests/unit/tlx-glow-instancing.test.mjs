import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../vendor/three-0.187.0/three.webgpu.min.js';
import {fnSource} from '../helpers/fn-source.mjs';
import {absSrc} from '../helpers/abs-src.mjs';
import {makeFakeGL, installThreeGlobals} from '../helpers/fake-webgl2.mjs';
const source = fs.readFileSync(new URL('../../js/render/three/tlx.js', import.meta.url), 'utf8');
const fxSource = fs.readFileSync(new URL('../../js/render/three/tsl-fx.js', import.meta.url), 'utf8');
const makeFx = vm.runInNewContext(`(${fnSource(fxSource,'function fx(THREE, TSL, opts) {')})`, {}, {filename:absSrc('js/render/three/tsl-fx.js')});
const corners = source.match(/const _glowCorners = (\[[^;]+\]);/)[1];
function fixture() {
  const disposed=[], records=[], glowStream={geo:null,ib:null,cap:0};
  const context={THREE, Float32Array, Math, glowStream, _instUsage:THREE.StaticDrawUsage,
    _glowCorners:JSON.parse(corners), frameEye:[0,0,0], _fxFrame:{}, fx:makeFx(THREE,THREE.TSL,{}),
    disposeGeometry(g){disposed.push(g);g.dispose();}, pushRec(...args){records.push(args);}};
  const methods=['function ensureGlowStream(instances, slot = glowStream) {','function uploadStream(slot, floats) {','function setRange0(attr, count) {'].map(d=>fnSource(source,d)).join('\n');
  const api=vm.runInNewContext(`${methods};({drawGlow:${fnSource(source,'drawGlow(lights, str) {').replace(/^drawGlow/,'function')},ensureGlowStream})`,context,{filename:absSrc('js/render/three/tlx.js')});
  return {context,api,glowStream,disposed,records};
}
function light(x=10,glare=1){return [x,0,0,10,20,30,20,0,0,0,0,0,0,0,glare];}
function many(n){return new Float32Array(Array.from({length:n},(_,i)=>light(10+i%20)).flat());}

test('glow admission and packed values retain fade, HDR clamp, order and instance rates',()=>{
 const f=fixture(); f.api.drawGlow(new Float32Array([...light(10),...light(170),...light(20,0),...light(115)]),1);
 const g=f.glowStream.geo, a=f.glowStream.ib.array;
 assert.equal(g.instanceCount,2); assert.equal(g.attributes.position.count,6); assert.deepEqual(g.drawRange,{start:0,count:6});
 assert.equal(g.attributes.position.data,g.attributes.fxCorner.data);
 assert.equal(g.attributes.position.data.isInstancedInterleavedBuffer,undefined);
 for(const key of ['fxCenter','fxColor','fxRadius'])assert.equal(g.attributes[key].data,f.glowStream.ib);
 assert.equal(f.glowStream.ib.isInstancedInterleavedBuffer,true);assert.equal(f.glowStream.ib.stride,7);
 const expected=new Float32Array([10,0,0,10*(3.2/30)*0.875,20*(3.2/30)*0.875,30*(3.2/30)*0.875,2*1.3,
 115,0,0,10*(3.2/30)*0.875*0.5,20*(3.2/30)*0.875*0.5,30*(3.2/30)*0.875*0.5,2*1.3]);
 assert.deepEqual(a.slice(0,14),expected);
 assert.equal(f.glowStream.ib.updateRanges[0].count*4,56);
 assert.equal(f.records.length,1); assert.equal(f.records[0][2],f.context.fx.glowMat);
});

test('glow growth disposes previous geometry; shrink, zero and moving eye preserve active prefix',()=>{
 const f=fixture();f.api.drawGlow(many(1),1);const first=f.glowStream.geo;let disposed=0;first.addEventListener('dispose',()=>disposed++);
 f.api.drawGlow(many(40),1);assert.equal(disposed,1);assert.deepEqual(f.disposed,[first]);assert.equal(f.glowStream.cap,64);
 const grown=f.glowStream.geo;f.api.drawGlow(many(2),1);assert.equal(f.glowStream.geo,grown);assert.equal(grown.instanceCount,2);
 const before=f.records.length;f.context.frameEye=[1000,0,0];f.api.drawGlow(many(2),1);assert.equal(grown.instanceCount,0);assert.equal(f.records.length,before);
 f.context.frameEye=[0,0,0];f.api.drawGlow(many(1),1);assert.equal(grown.instanceCount,1);assert.equal(f.glowStream.ib.updateRanges[0].count,7);
});

test('glow wrappers survive actual idle pruning after initial allocation and growth',()=>{
 const constants=source.match(/const PRUNE_EVERY_MS = [^;]+;/)[0];
 for(const grow of [false,true])for(const unpinned of [true,false]){
  const f=fixture();f.api.drawGlow(many(1),1);if(grow)f.api.drawGlow(many(40),1);
  const geo=f.glowStream.geo;if(unpinned)geo.__tlxPin=false;
  const mat=f.context.fx.glowMat, mesh=new THREE.Mesh(geo,mat);mesh.__tlxSeen=1000;
  const pool=[mesh], byGeo=new Map([[geo,new Map([[mat,[mesh]]])]]), dropped=[];
  const prune=vm.runInNewContext(`${constants}\nlet _pruneLast=0;\n${fnSource(source,'function prunePool(now) {')}\nprunePool`,
   {meshPool:pool,meshByGeo:byGeo,dropWrapper:m=>dropped.push(m)}, {filename:absSrc('js/render/three/tlx.js')});
  prune(20999); // 19,999 ms idle: both pinned and unpinned wrappers survive.
  assert.equal(pool.length,1);assert.equal(dropped.length,0);
  prune(27001); // 26,001 ms idle, also beyond the actual five-second prune cadence.
  assert.equal(pool.length,unpinned?0:1,`growth=${grow}, unpinned=${unpinned}`);
  assert.equal(dropped.length,unpinned?1:0);
  assert.equal(byGeo.has(geo),!unpinned,'the live geometry lookup follows wrapper ownership');
  if(!unpinned)assert.equal(pool[0],mesh,'retain the original render wrapper');
 }
});

test('warm owns an independent layout while live draws shrink, grow and compilation fails',async()=>{
 const f=fixture(),seen=[];f.api.drawGlow(many(3),1);const original=f.glowStream.geo;
 let rejectCompile;const pending=new Promise((_,reject)=>{rejectCompile=reject;});
 Object.assign(f.context,{_warmFx:true,skidStream:{},lineStream:{},partStreams:[{},{}],_blob:null,_decalRuns:new Map(),_coWarm:async()=>{},
  ensureStream(){throw new Error('glow must not use the per-vertex stream allocator');},
  compileWarmProbe:async(g)=>{seen.push(g);return pending;}});
 f.context.fx={glowMat:f.context.fx.glowMat};f.context.ensureGlowStream=f.api.ensureGlowStream;
 const warm=vm.runInNewContext(`(${fnSource(source,'async function warmFxPrograms() {')})`,f.context,{filename:absSrc('js/render/three/tlx.js')});
 const work=warm();assert.equal(seen[0].instanceCount,1);assert.notEqual(seen[0],original);
 // Restore producer uniforms while the warm awaits its isolated material probe.
 f.context.fx.glowStr={value:0};f.api.drawGlow(many(2),1);assert.equal(original.instanceCount,2);
 f.api.drawGlow(many(40),1);const grown=f.glowStream.geo;assert.notEqual(grown,original);
 rejectCompile(new Error('compile failed'));await assert.rejects(work,/compile failed/);
 assert.equal(grown.instanceCount,40);assert.equal(seen[0].instanceCount,1);
 assert.notEqual(seen[0].attributes.fxCenter.data,grown.attributes.fxCenter.data);
 const probe=seen[0],data=probe.attributes.fxCenter.data;
 assert.equal(data.array.byteLength+probe.attributes.position.data.array.byteLength,100);
 f.context.compileWarmProbe=async(g)=>{assert.equal(g,probe);};await warm();
 assert.equal(f.glowStream.geo,grown);assert.equal(grown.instanceCount,40);
 let released=0;probe.addEventListener('dispose',()=>released++);f.context.fx.glowMat.dispose();
 assert.equal(released,1);assert.equal(f.glowStream.warm,null);
 assert.equal(f.glowStream.geo,grown);assert.equal(grown.instanceCount,40);
});

test('actual vendor builds one six-vertex instanced draw; glow state and particle shader remain distinct',async()=>{
 installThreeGlobals();const fake=makeFakeGL(), draws=[];
 fake.gl.drawArraysInstanced=(...args)=>draws.push(args);
 const renderer=new THREE.WebGPURenderer({canvas:fake.canvas,context:fake.gl,forceWebGL:true,antialias:false});await renderer.init();
 const inputs=new Map(),compile=renderer.backend.createRenderPipeline.bind(renderer.backend);
 renderer.backend.createRenderPipeline=(object,...args)=>{
  inputs.set(object.geometry,[...object.getAttributes()]);
  return compile(object,...args);
 };
 const f=fixture();f.api.drawGlow(many(3),1);
 const mat=f.context.fx.glowMat;
 assert.equal(mat.transparent,true);assert.equal(mat.depthWrite,false);assert.equal(mat.depthTest,true);
 assert.equal(mat.blendSrc,THREE.OneFactor);assert.equal(mat.blendDst,THREE.OneFactor);
 assert.equal(mat.blendSrcAlpha,THREE.ZeroFactor);assert.equal(mat.blendDstAlpha,THREE.OneFactor);assert.equal(mat.forceSinglePass,true);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(0,0,5);
 const mesh=new THREE.Mesh(f.glowStream.geo,mat);mesh.frustumCulled=false;scene.add(mesh);renderer.render(scene,camera);
 assert.ok(draws.some(a=>a[2]===6&&a[3]===3),'actual renderer draws six vertices and three instances');
 const glowInputs=inputs.get(f.glowStream.geo),center=f.glowStream.geo.attributes.fxCenter;
 assert.notEqual(glowInputs.indexOf(center),-1,'compiled glow pipeline binds its actual center attribute');
 assert.equal(center.data,f.glowStream.ib);assert.equal(center.data.isInstancedInterleavedBuffer,true);
 assert.equal(center.data.stride,7);assert.equal(center.data.meshPerAttribute,1);
 assert.ok(glowInputs.every(a=>Object.values(f.glowStream.geo.attributes).includes(a)),
  'glow pipeline inputs belong to its quad/instance geometry without synthetic matrix attributes');
 const p=new THREE.BufferGeometry();for(const [name,size]of [['position',3],['fxCorner',2],['fxColor',3],['fxSize',1],['fxAlpha',1]])p.setAttribute(name,new THREE.BufferAttribute(new Float32Array(size*6),size));
 scene.remove(mesh);const particles=new THREE.Mesh(p,f.context.fx.particleMats[0]);particles.frustumCulled=false;scene.add(particles);renderer.render(scene,camera);
 const particleInputs=inputs.get(p);
 assert.notEqual(particleInputs.indexOf(p.attributes.position),-1,'compiled particle pipeline binds its actual vertex centers');
 assert.equal(p.attributes.position.count,6);assert.equal(p.attributes.position.isInstancedBufferAttribute,undefined);
 assert.ok(particleInputs.every(a=>Object.values(p.attributes).includes(a)),
  'particle pipeline inputs all belong to the per-vertex particle geometry');
 assert.equal(particleInputs.includes(center),false,'particle pipeline does not bind the glow center stream');
 scene.remove(particles);p.dispose();f.glowStream.geo.dispose();renderer.dispose();
});
