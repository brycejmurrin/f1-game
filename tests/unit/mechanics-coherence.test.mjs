import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const root = new URL("../../", import.meta.url);
function load(files, extra = {}) {
  const values = new Map();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,String(v)), removeItem: k => values.delete(k) };
  const ctx = vm.createContext({ Math, JSON, Object, Number, Array, Map, Set, localStorage: storage,
    Log: { info() {}, warn() {}, enabled() { return false; } },
    GameStore: { store: { get: (k,d) => values.has(k) ? values.get(k) : d, set: (k,v) => values.set(k,v) } }, ...extra });
  ctx.window = ctx;
  for (const f of ["js/core/mat4.js", ...files]) vm.runInContext(readFileSync(new URL(f, root), "utf8"),ctx,{filename:f});
  return { get: name => vm.runInContext(name,ctx), values, ctx };
}

test("the actual collision candidate accepts two rotated humans across the lap seam", () => {
  const { get } = load(["js/physics/ai-drive.js", "js/physics/contact-geometry.js", "js/physics/collide.js"], {
    IncidentSim: { owns: () => false }, Tracks: { wallAt: () => 20 },
  });
  const C = get("Collide").create({ track: { total: 1000 }, player: null, netPlay: { owns: () => false }, PACE: 1, wrapS: s => s }, () => {});
  C.resolveCollisions([],1/60);
  const yaw = Math.PI - Math.atan(1/2.4);
  for (const [aS,bS] of [[0,5.1],[995,0.1]]) {
    const a = { human:true, yawVis:yaw, prog:aS, x:0, speed:0 };
    const b = { human:true, yawVis:-yaw, prog:bS, x:0, speed:0 };
    assert.ok(C.pairContact(a,b),"5.1 m pair lies inside the combined 5.2 m support");
    b.x=6; assert.equal(C.pairContact(a,b),null,"lateral separation still rejects it");
  }
});

test("AI corner planning solves the same speed-dependent envelope as steering", () => {
  const A = load(["js/physics/ai-drive.js"]).get("AiDrive");
  for (const pace of [.4,.84,1,1.4]) for (const grip of [.4,.8,1]) for (const k of [.001,.006,.03,.1]) {
    const load=.8, lat=22*(1+(load-.5)*.16)*grip;
    const v=A.cornerSpeed(k,lat,pace,72);
    assert.ok(Math.abs(v*v*k - 22*A.lateralScale(v,load,grip,pace,72))<1e-9);
    assert.ok(A.cornerSpeed(k,lat*.8,pace,72)<v,"less grip must lower the target");
  }
});

test("roll stiffness shifts grip between axles while works settings stay identical", () => {
  const S=load(["js/physics/consts.js","js/garage/setup-tune.js"]).get("SetupTune");
  assert.equal(S.axleGrip(0,22).f,1);
  assert.equal(S.axleGrip(.3,0).f,1,"no lateral transfer while driving straight");
  const front={...S.axleGrip(.3,22)},rear={...S.axleGrip(-.3,22)};
  assert.ok(front.f<1 && front.r>1 && rear.f>1 && rear.r<1);
  for (const x of [front,rear]) assert.ok(x.f>.8 && x.r>.8 && x.f<1.2 && x.r<1.2);
});

test("ghost classes isolate records, retain legacy laps and survive immediate switching", () => {
  const { get, ctx }=load(["js/car/ghost.js"],{requestIdleCallback() {}}), G=get("Ghost");
  const lap=t=>{G.startLap();for(let i=0;i<12;i++)G.record(i*t/12,i*10,0);G.finishLap(t);};
  const a=G.contextKey({physics:1,setup:{wing:2,tyre:1}}),b=G.contextKey({physics:2,setup:{wing:2,tyre:1}});
  assert.equal(a,G.contextKey({setup:{tyre:1,wing:2},physics:1}));
  G.setTrack("monza");lap(80);
  G.setTrack("monza",a);assert.equal(G.hasGhost(),false);lap(90);
  G.setTrack("monza",b);assert.equal(G.hasGhost(),false);lap(95);
  G.setTrack("monza",a);assert.equal(G.bestTime(),90);
  G.setTrack("monza");assert.equal(G.bestTime(),80);
  assert.ok(ctx.localStorage,"test uses actual recorder and store cache");
});

test("network strategic state clamps telemetry and never changes car pose", () => {
  const N=load(["js/net/netplay.js"]).get("NetPlay");
  const c={px:3,pz:5,speed:40,tyre:{id:"soft",code:"S",life:.67,tread:0,colour:[1,0,0]},tyreWear:.7,pitState:"box",pitT:2,tyreStints:2};
  const d=N.strategyState(c,7,"monza"), remote={px:10,speed:30};
  d.fields.tyreWear=1e8; d.fields.speed=1000;
  assert.equal(N.applyStrategy(remote,d),true);
  assert.equal(remote.tyreWear,3);assert.equal(remote.speed,30);assert.equal(remote.px,10);assert.equal(remote.tyre.id,"soft");
  const old=JSON.stringify(remote);d.physics="other";
  assert.equal(N.applyStrategy(remote,d),false);assert.equal(JSON.stringify(remote),old);
});

test("adaptive interpolation reacts to arrival jitter, stays bounded, and preserves prediction", () => {
  const N=load(["js/net/snapshot.js"]).get("NetSnapshot");
  const a=N.createInterp({total:1000,adaptive:true}), b=N.createInterp({total:1000});
  for(let i=0;i<80;i++) {
    const st={s:i,lap:1,x:0,speed:20,head:0};
    a.push(i*50,st,i*50+(i%2?35:0)); b.push(i*50,st);
  }
  assert.ok(a.timing().delayMs>100 && a.timing().delayMs<=180);
  assert.equal(b.timing().delayMs,100);
  assert.ok(Math.abs(a.predict(4000).s-b.predict(4000).s)<1e-6);
  a.clear();assert.equal(a.timing().delayMs,100);
});


test("adaptive presentation cannot rewind when a burst grows the delay", () => {
  const N=load(["js/net/snapshot.js"]).get("NetSnapshot");
  const a=N.createInterp({total:10000,adaptive:true});
  for(let i=0;i<8;i++) a.push(i*50,{s:i,lap:1,x:0,speed:20,head:0},i*50);
  const before=a.sample(400).s;
  for(let i=8;i<20;i++) a.push(i*50,{s:i,lap:1,x:0,speed:20,head:0},1000);
  assert.ok(a.sample(401).s>=before);
  a.predict(1200);
  assert.ok(a.sample(402).s<20,"collision prediction must not advance the presentation clock");
});

test("every difficulty carries both dimensions, the ladder is monotonic, and no AI out-drags the player", () => {
  const src = readFileSync(new URL("../../js/physics/consts.js", import.meta.url), "utf8");
  const ctx = { window: {} }; ctx.globalThis = ctx;
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const C = ctx.window.PhysicsConsts, DIFF = C.DIFF;
  const order = ["easy", "normal", "hard"];
  for (const k of order) {
    assert.ok(DIFF[k].corner > 0 && DIFF[k].corner <= 1, `${k} corner ${DIFF[k].corner} is a real factor at or below the grip model`);
    assert.ok(DIFF[k].ai > 0, `${k} has a pace scale`);
    assert.ok(DIFF[k].err > 0, `${k} has a mistake-rate scale`);
  }
  for (let i = 1; i < order.length; i++) {
    const lo = DIFF[order[i - 1]], hi = DIFF[order[i]];
    assert.ok(hi.ai > lo.ai, `${order[i]} is faster than ${order[i - 1]}`);
    assert.ok(hi.corner >= lo.corner, `${order[i]} corners at least as close to the limit as ${order[i - 1]}`);
    // err runs the OTHER way: easier levels err MORE, so the ladder here is a
    // ceiling-down walk (easy >= normal >= hard), not ascending like ai/corner.
    assert.ok(lo.err >= hi.err, `${order[i - 1]} errs at least as often as ${order[i]}`);
  }
  assert.equal(DIFF.hard.err, 1, "hard is the unscaled baseline rate");
  // The fastest team's TIER_V times the best driver's skill ceiling (1.0) times
  // the top pace scale must stay under the player's own 1.0, or a same-spec AI
  // out-drags the player on the straight — the one cheat players reliably catch.
  const teams = readFileSync(new URL("../../js/data/teams.js", import.meta.url), "utf8");
  const tierTop = parseFloat(teams.match(/TIER_V = \[([0-9.]+)/)[1]);
  assert.ok(tierTop * DIFF.hard.ai < 1, `top AI scale ${(tierTop * DIFF.hard.ai).toFixed(4)} stays under the player`);
  assert.ok(C.BAND_CEIL <= 1, `a rubber-banded AI is capped at ${C.BAND_CEIL}, not above the player`);
});
