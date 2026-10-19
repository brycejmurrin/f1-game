// Retained track state after upload: production drops build-only graph nodes,
// but an unchunked road/terrain may be chunked later when quality recovers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const require=createRequire(import.meta.url);
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const {buildContext}=require(path.join(ROOT,'tools/track/verify-track.cjs'));

test('production track releases graph while late ribbon upload keeps required channels',()=>{
  const T=buildContext(null,{quiet:true});
  const def=T.LIST.find(d=>d.id==='monza');
  const gfx={createMesh(g){return {verts:g.pos.length/3};}};
  const tr=T.build(def,{gfx,retainGraph:false,chunkRibbons:false});
  assert.equal(tr.graph,null);
  assert.ok(tr.props.count>0);
  assert.equal(tr.props.count,tr.props.list.length);
  assert.equal(tr.props.spanCount,tr.props.spans.length);
  const dropped=Object.getOwnPropertyDescriptor(tr.props,'dropped');
  assert.ok(!dropped||dropped.get===undefined,'dropped is not a lazy getter holding build state');
  for(const name of ['road','terrain']){
    const geo=tr[name+'Geo'];
    assert.ok(Array.isArray(geo.pos) && Array.isArray(geo.idx));
    for(const channel of ['nrm','col','mat']){
      // The TLX late-chunk normal pack multiplies the authored double by
      // 32767 before rounding. An early float32 conversion shifts threshold
      // values by one snorm16 code and breaks upload identity.
      assert.ok(Array.isArray(geo[channel]),`${name}.${channel} preserves authored precision for late upload`);
    }
    if(name==='road') assert.ok(Array.isArray(geo.trk));
    // geometry is self-consistent (the faked gfx.createMesh is not evidence)
    assert.equal(geo.pos.length%3,0);
    assert.equal(geo.nrm.length,geo.pos.length,`${name} nrm matches pos`);
    assert.equal(geo.col.length,geo.pos.length,`${name} col matches pos`);
    const nv=geo.pos.length/3;
    assert.ok(geo.idx.every(i=>i>=0&&i<nv),`${name} idx within vertices`);
  }
  const p=tr.terrainGeo.pos;
  assert.equal(typeof T.terrainY(tr,p[0],p[2]),'number');
});

test('diagnostic track retains the full graph and exact geometry',()=>{
  const T=buildContext(null,{quiet:true});
  T.setKeepGeometry(true);
  const tr=T.build(T.LIST.find(d=>d.id==='monza'),{
    gfx:{createMesh(g){return {verts:g.pos.length/3};}},
    retainGraph:true,chunkRibbons:false,
  });
  assert.ok(tr.graph.nodes.length>0);
  assert.ok(Array.isArray(tr.roadGeo.nrm));
  assert.ok(Array.isArray(tr.terrainGeo.col));
});

test('a player build frees the prop/glass/water CPU geometry; the dev surface keeps it (M-3a)',()=>{
  const T=buildContext(null,{quiet:true});
  const def=T.LIST.find(d=>d.id==='monza');
  const gfx={createMesh(g){return {verts:g.pos.length/3};}};
  const geoBytes=(tr)=>['propsGeo','glassGeo','waterGeo'].reduce((n,k)=>n+(tr[k]&&tr[k].pos?tr[k].pos.length*8:0),0);
  const keepAll=T.build(def,{gfx,chunkRibbons:false});
  const kept=geoBytes(keepAll);
  assert.ok(kept>0,'default (VM/diagnostic) builds keep the geometry');
  const player=T.build(def,{gfx,retainGraph:false,chunkRibbons:false});
  for(const k of ['propsGeo','glassGeo','waterGeo']) assert.equal(player[k],null,k+' freed on a player build');
  console.log('M-3a freed pos bytes (monza, as doubles):',kept);
  const wanted=T.build(def,{gfx,retainGraph:false,retainGeometry:true,chunkRibbons:false});
  assert.ok(wanted.propsGeo&&wanted.glassGeo&&wanted.waterGeo,'retainGeometry keeps them');
  T.setKeepGeometry(true);
  try{ const k=T.build(def,{gfx,retainGraph:false,chunkRibbons:false}); assert.ok(k.propsGeo,'trackGeometry(true) keeps them'); }
  finally{ T.setKeepGeometry(false); }
  assert.ok(player.roadGeo&&player.terrainGeo,'road/terrain stay (groundY needs them)');
});
