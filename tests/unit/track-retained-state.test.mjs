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
  assert.equal(Object.getOwnPropertyDescriptor(tr.props,'dropped').get,undefined);
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
    assert.equal(gfx.createMesh(geo).verts,geo.pos.length/3);
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
