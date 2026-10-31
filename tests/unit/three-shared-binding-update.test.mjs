// Actual vendor Bindings._update + Nodes.updateGroup; controlled data/backend adapters.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parse} from 'acorn';
const source=fs.readFileSync(new URL('../../vendor/three-0.187.0/three.webgpu.min.js',import.meta.url),'utf8');
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
const classes=ast.body.filter(n=>n.type==='ClassDeclaration');
const bindingClass=classes.find(n=>n.body.body.some(m=>m.key?.name==='_updateBindings'));
const nodeClass=classes.find(n=>n.body.body.some(m=>m.key?.name==='getNodeFrameForRender'));
const method=(c,key)=>{const n=c.body.body.find(m=>m.key?.name===key);return source.slice(n.start,n.end);};
// Resolve minifier-local dependencies from free references, not unstable symbol names.
import {analyze} from 'eslint-scope';
import {test} from 'node:test';
function executable(c,key){
 const code='({' + method(c,key) + '})';
 const tree=parse(code,{ecmaVersion:'latest',ranges:true});
 const names=[...new Set(analyze(tree,{ecmaVersion:2022}).globalScope.through.map(r=>r.identifier.name))];
 const values=names.map(name=>{
  if(name==='undefined')return undefined;
  if(code.includes(name+'.OBJECT'))return {OBJECT:'object'};
  if(code.includes(name+'.STORAGE'))return {STORAGE:0,INDIRECT:1};
  if(code.includes(name+'['))return [];
  return ()=>true; // unrelated existing uniform byte-diff helper; fixtures have no NodeUniformBuffer
 });
 return Function(...names,'return '+code)(...values)[key];
}
const update=executable(bindingClass,'_update');
const updateGroup=executable(nodeClass,'updateGroup');

function run({fast=false,change=null,objectGroup=false,mixed=false,throws=false}={}){
 const counts={bindingVisits:0,groupMapGets:0,membershipChecks:0,skippedGroups:0};
 const effects=[];
 const groupNode={shared:!objectGroup,updateType:objectGroup?'object':'render',version:0};
 const secondNode={shared:true,updateType:'render',version:0};
 const perBinding=new WeakMap(),backendData=new WeakMap(),textureData=new WeakMap();
 const backend={get(o){let v=backendData.get(o);if(!v)backendData.set(o,v={});return v;},updateBinding(b){effects.push(['uniform-write',b.id]);},updateBindings(g,a,key,version){effects.push(['bind-group-update',key,version]);},generateMipmaps(){effects.push(['mipmap']);}};
 const nodes={groupsData:{get(k){counts.groupMapGets++;return perBinding.get(k[1]);},set(k,v){perBinding.set(k[1],v);}},updateGroup(b){counts.bindingVisits++;return updateGroup.call(this,b);}};
 const textures={get(t){let d=textureData.get(t);if(!d)textureData.set(t,d={generation:0,bindGroups:new Set()});return d;},updateTexture(t){effects.push(['texture-upload',t.id,t.version]);this.get(t).generation=t.version;},updateSampler(b){effects.push(['sampler-update',b.id]);return 'sampler-'+b.id;},needsMipmaps(){return false;}};
 const groupData=new WeakMap();
 const context={backend,nodes,textures,attributes:{update(a,type){effects.push(['storage-update',a.id,type]);},get(){return {generation:0};}},get(o){let d=groupData.get(o);if(!d)groupData.set(o,d={});return d;}};
 let thrown=false;
 function make(i,node=groupNode){
  const base={id:i,groupNode:node};
  if(i%4===0)return {...base,isUniformBuffer:true,isBuffer:true,updateRanges:[{start:0,count:4}],update(){effects.push(['uniform-callback',i]);if(change==='callback-cache'&&!thrown){thrown=true;const fresh=new WeakMap();nodes.groupsData={get(k){counts.groupMapGets++;return fresh.get(k[1]);},set(k,v){fresh.set(k[1],v);}};}if(throws&&!thrown&&(throws!=='later'||groupNode.version===1)){thrown=true;throw Error('controlled callback failure');}return true;},clearUpdateRanges(){effects.push(['clear-ranges',i]);this.updateRanges.length=0;}};
  if(i%4===1)return {...base,isSampledTexture:true,texture:{id:i,version:1},generation:0,update(){effects.push(['texture-callback',i]);return true;}};
  if(i%4===2)return {...base,isSampler:true,samplerKey:null,update(){effects.push(['sampler-callback',i]);return true;}};
  return {...base,isStorageBuffer:true,attribute:{id:i,isIndirectStorageBufferAttribute:false}};
 }
 const bg={bindings:Array.from({length:12},(_,i)=>make(i,mixed&&i===11?secondNode:groupNode))};
 const call=fast?update:function(group,all){this.get(group).sharedUpdate=undefined;return update.call(this,group,all);};
 for(let i=0;i<400;i++){
  if(i===200){
   if(change==='shared')groupNode.shared=false;
   if(change==='object')groupNode.updateType='object';
   if(change==='empty')bg.bindings=[];
   if(change==='cache'){const fresh=new WeakMap();nodes.groupsData={get(k){counts.groupMapGets++;return fresh.get(k[1]);},set(k,v){fresh.set(k[1],v);}};}
   if(change==='version'){groupNode.version++;for(const b of bg.bindings){if(b.texture)b.texture.version++;if(b.isBuffer)b.updateRanges.push({start:4,count:4});}}
   if(change==='array')bg.bindings=bg.bindings.map((_,j)=>make(100+j));
   if(change==='in-place')bg.bindings[1]=make(101);
   if(change==='node')bg.bindings[1].groupNode=secondNode;
  }
  try{call.call(context,bg,[bg]);}catch(e){if(!throws||e.message!=='controlled callback failure')throw e;effects.push(['caught']);}
 }
 return {counts,effects};
}
test('production shared group gate preserves all binding side effects and reduces repeated lookups',()=>{
const results={};
for(const [name,options] of Object.entries({shared:{},changed:{change:'version'},object:{objectGroup:true},mixed:{mixed:true},replacedArray:{change:'array'},replacedInPlace:{change:'in-place'},changedNode:{change:'node'},firstException:{throws:true},laterException:{throws:'later',change:'version'},sharedFlag:{change:'shared'},objectType:{change:'object'},empty:{change:'empty'},cacheReset:{change:'cache'},callbackCacheReset:{change:'callback-cache'}})){
 const a=run(options),b=run({...options,fast:true});
 assert.deepEqual(b.effects,a.effects,`${name}: all callbacks/uploads/bind updates/range clears must match`);
 results[name]={baseline:a.counts,candidate:b.counts,sideEffects:a.effects.length,equalSideEffectTrace:true};
 if(name==='shared'){assert.equal(a.counts.groupMapGets,4800);assert.equal(b.counts.groupMapGets,12);}
 if(name==='cacheReset')assert.equal(b.counts.bindingVisits,24);
 if(name==='objectType')assert.equal(b.counts.bindingVisits,2412);
 if(name==='changed')assert.equal(b.counts.bindingVisits,24);
 if(name==='replacedInPlace')assert.equal(b.effects.filter(e=>e[0]==='texture-upload'&&e[1]===101).length,1);
 if(name==='firstException')assert.ok(b.counts.bindingVisits>12,'failed first call must not populate skip cache');
}
});
