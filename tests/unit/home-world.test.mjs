import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../js/ui/home-world.js', import.meta.url), 'utf8');
const pitSource = readFileSync(new URL('../../js/track/core/pit.js', import.meta.url), 'utf8');

function fixture({ side = 1, noPit = false, flyby = true } = {}) {
  const n = 100, track = { total: 1000, n, hw: new Float32Array(n).fill(10) };
  if (!noPit) track.pit = { sIn: 100, lenM: 400, side,
    w: new Float32Array(n).fill(1), v: new Float32Array(n).fill(1), b: new Float32Array(n).fill(1),
    off: { fastIn: 4, fastOut: 7.5, corrOut: 8.5, workOut: 14 } };
  const G = { state: 'menu', setupPreviewOn: false, track, camEye: [3, 6, 9], camTgt: [2, 4, 8], camFov: 62,
    gfx: { warming: () => warm }, cars: [{ untouched: true }], raceClock: 107 };
  let warm = false, reduce = false, ready = false, eligible = true, key = 'a', prepared = 0, flyCalls = 0;
  const context = vm.createContext({ TitleFx: { mode: () => reduce ? 'reduce' : 'on' } });
  vm.runInContext(pitSource + ';globalThis.Pit=TrackPit;', context);
  context.Tracks = {
    sample: (t, s, out) => { out.p[0] = 25; out.p[1] = 7; out.p[2] = s; out.r[0] = 1; out.r[1] = 0; out.r[2] = 0; out.t[0] = 0; out.t[1] = 0; out.t[2] = 1; out.hw = 10; return out; },
    pitLaneSpan: t => t.pit ? { sIn: t.pit.sIn, lenM: t.pit.lenM, side: t.pit.side } : null,
    pitLaneAt: (t, s) => context.Pit.at(t, s),
  };
  if (flyby) context.FlybySeq = {
    posePoint: (t, p, out) => { flyCalls++; out[0] = p.at === 'centre' ? (p.distR || 0) * 80 + (p.bear || 0) * 5 : 25 + (p.x || 0); out[1] = 7 + (p.y || (p.yR || 0) * 90); out[2] = p.at === 'centre' ? (p.bear || 0) * 60 : 350 + (p.off || 0); return out; },
    clearEye: (t, eye) => eye,
    floorEye: (t, eye) => { eye[1] = Math.max(eye[1], 8.5); return eye; },
    solve: () => { throw Error('Home must not change persistent Flyby timing'); },
    setDuration: () => { throw Error('Home must not change global Flyby duration'); },
    reset: () => { throw Error('Home must not reset Flyby cuts'); },
  };
  vm.runInContext(source + ';globalThis.api=HomeWorld;', context);
  const home = context.api.create(G, { prepareTrack: () => prepared++, worldReady: () => ready, eligible: () => eligible, contextKey: () => key });
  return { home, G, track, context, set: v => { if ('warm' in v) warm=v.warm; if ('reduce' in v) reduce=v.reduce; if ('ready' in v) ready=v.ready; if ('eligible' in v) eligible=v.eligible; if ('key' in v) key=v.key; }, prepared: () => prepared, flyCalls: () => flyCalls };
}
const copy = p => ({ eye: Array.from(p.eye), tgt: Array.from(p.tgt), fov: p.fov, cut: p.cut });

test('prepared world ownership is eligible, context scoped, idempotent and restores one snapshot', () => {
  const f = fixture(), before = JSON.stringify({ eye:f.G.camEye, tgt:f.G.camTgt, fov:f.G.camFov, cars:f.G.cars, clock:f.G.raceClock });
  assert.equal(f.home.begin('track', { shot:'hero' }), true);
  assert.equal(f.home.wantsTrack(), true); assert.equal(f.home.active(), false); assert.equal(f.home.camera(1), null);
  f.home.begin('track', { shot:'hero' }); assert.equal(f.prepared(), 1);
  f.set({ ready:true }); assert.equal(f.home.active(), true);
  f.G.camEye.splice(0,3,90,80,70); f.G.camTgt.splice(0,3,60,50,40); f.G.camFov=45;
  f.home.begin('pitlane', { shot:'side' }); assert.equal(f.prepared(), 1);
  f.set({ eligible:false }); assert.equal(f.home.active(), false); assert.equal(f.home.needsFrame(1), false);
  f.set({ eligible:true, key:'b' }); assert.equal(f.home.active(), false); assert.equal(f.home.wantsTrack(), false);
  f.home.begin('pitlane', { shot:'side' }); assert.equal(f.prepared(), 2);
  f.home.end(); f.home.end(); assert.equal(f.home.wantsTrack(), false);
  assert.equal(JSON.stringify({ eye:f.G.camEye, tgt:f.G.camTgt, fov:f.G.camFov, cars:f.G.cars, clock:f.G.raceClock }), before);
});

test('still frames are acknowledged only after a ready, non-warming draw, and viewport changes repaint', () => {
  const f=fixture(); f.home.begin('track',{ motion:'still', viewKey:'wide' }); f.set({ready:true});
  assert.equal(f.home.needsFrame(0),true); assert.equal(f.home.camera().cut,true);
  f.set({warm:true}); assert.equal(f.home.didRender(),false); assert.equal(f.home.state().painted,false); assert.equal(f.home.needsFrame(1),false);
  f.set({warm:false}); assert.equal(f.home.needsFrame(0),true); f.home.camera(); assert.equal(f.home.didRender(),true);
  assert.equal(f.home.camera().cut,false); assert.equal(f.home.needsFrame(60),false);
  f.home.begin('track',{motion:'still',viewKey:'portrait'}); assert.equal(f.home.needsFrame(0),true); assert.equal(f.home.camera().cut,true);
});

test('ambient is bounded to 24fps, clamps stalled clocks, and never changes global Flyby playback', () => {
  const f=fixture(); f.set({ready:true}); f.home.begin('track',{motion:'ambient',shot:'front'});
  const opening=copy(f.home.camera()); f.home.didRender();
  let draws=0;
  for(let i=0;i<120;i++) if(f.home.needsFrame(1/120)){f.home.camera();f.home.didRender();draws++;}
  assert.equal(draws,24); assert.notDeepEqual(copy(f.home.camera()).eye,opening.eye); assert.equal(f.flyCalls(),4);
  const before=f.home.state().clock; f.home.needsFrame(10000); assert.ok(f.home.state().clock-before <= 0.100001);
  assert.equal(f.G.raceClock,107); assert.deepEqual(f.G.cars,[{untouched:true}]);
});

test('reduced motion freezes ambient but interactive photo camera still receives bounded redraws', () => {
  const f=fixture(); f.set({ready:true,reduce:true}); f.home.begin('track',{motion:'ambient'});
  const held=copy(f.home.camera()); f.home.didRender();
  for(let i=0;i<100;i++) assert.equal(f.home.needsFrame(0.1),false);
  assert.deepEqual(copy(f.home.camera()).eye,held.eye); assert.equal(f.home.state().clock,0);
  let draws=0; for(let i=0;i<120;i++) if(f.home.needsFrame(1/120,{interactive:true})){f.home.camera();f.home.didRender();draws++;}
  assert.equal(draws,24); assert.equal(f.home.state().clock,0);
  assert.equal(f.home.needsFrame(0,{interactive:true}),false);
  assert.equal(f.home.needsFrame(0,{interactive:true,force:true}),true);
  assert.equal(f.home.state().clock,0); f.home.didRender();
  f.set({reduce:false}); assert.equal(f.home.needsFrame(0),true); f.home.didRender();
  f.home.needsFrame(0.1); f.home.camera(); f.home.didRender();
  f.set({reduce:true}); assert.equal(f.home.needsFrame(0),true); assert.equal(f.home.camera().cut,true); f.home.didRender();
  assert.equal(f.home.needsFrame(1),false);
});

test('pit framing follows real TrackPit bands, signed lane side and the sampled road elevation', () => {
  for(const side of [-1,1]){
    const f=fixture({side}); f.set({ready:true}); f.home.begin('pitlane',{motion:'still',shot:'hero'});
    const p=copy(f.home.camera()), lane=f.context.Pit.at(f.track,300);
    assert.equal(p.tgt[0],25+lane.workCentre); assert.equal(p.tgt[1],8.8); assert.equal(p.tgt[2],314);
    assert.equal(p.eye[0],25+lane.centre); assert.equal(p.eye[1],10.6); assert.equal(p.eye[2],282);
    assert.equal(f.flyCalls(),0); assert.equal(f.home.state().fallback,false);
    const variants=new Set();
    for(const shot of ['hero','front','side','rear']){f.home.begin('pitlane',{shot}); variants.add(JSON.stringify(copy(f.home.camera()).eye));}
    assert.equal(variants.size,4);
  }
});

test('missing pit/Flyby data falls back to a finite scoped still without an endless render loop', () => {
  const f=fixture({noPit:true,flyby:false}); f.set({ready:true}); f.home.begin('pitlane',{motion:'ambient'});
  assert.equal(f.home.needsFrame(0),true); const p=copy(f.home.camera());
  assert.ok([...p.eye,...p.tgt,p.fov].every(Number.isFinite)); assert.equal(f.home.state().fallback,true);
  f.home.didRender(); for(let i=0;i<20;i++) assert.equal(f.home.needsFrame(1),false);
  assert.equal(f.home.needsFrame(0.1,{interactive:true}),true);
});

test('late world readiness cannot reactivate an ended ownership session', () => {
  const f=fixture(); f.home.begin('track',{motion:'ambient'}); f.home.end(); f.set({ready:true});
  assert.equal(f.home.active(),false); assert.equal(f.home.needsFrame(1),false); assert.equal(f.home.camera(),null);
  assert.equal(f.home.begin('garage'),false); assert.equal(f.prepared(),1);
});

test('the outdoor subject is shifted into the visible menu pane, and Photo restores the full frame', () => {
  const f=fixture(); f.set({ready:true});
  f.home.begin('track',{viewKey:'right-menu',pane:{left:0,right:0.52,top:0,bottom:1}});
  assert.equal(f.home.camera().shiftX,0.48); assert.equal(f.home.camera().shiftY,0);
  f.home.begin('track',{viewKey:'bottom-menu',pane:{left:0,right:1,top:0,bottom:0.45}});
  assert.equal(f.home.camera().shiftX,0); assert.equal(f.home.camera().shiftY,-0.55);
  f.home.begin('track',{viewKey:'photo'});
  assert.equal(f.home.camera().shiftX,0); assert.equal(f.home.camera().shiftY,0);
});

test('custom capture/restore run once across shots and read-only FOV restoration is safe', () => {
  const f=fixture(); let captures=0,restores=0;
  const home=f.context.api.create(f.G,{capture:()=>{captures++;return {token:'camera-owner'};},restore:value=>{restores++;assert.equal(value.token,'camera-owner');}});
  home.begin('track'); home.begin('pitlane',{shot:'rear'}); home.end(); home.end();
  assert.equal(captures,1); assert.equal(restores,1);
  Object.defineProperty(f.G,'camFov',{get:()=>62}); f.home.begin('track'); assert.doesNotThrow(()=>f.home.end());
});
