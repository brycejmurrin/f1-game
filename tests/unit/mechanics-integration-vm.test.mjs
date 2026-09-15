import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");
let g;
before(async()=>{g=await createGame({track:"monza"});});
after(()=>g?.close());
async function tt() {
  g.G.daily.stop(); g.G.timeTrial=true; g.G.raceWeather="dry";
  await g.G.startRace(); g.apex.go(); g.apex.headless(true);
}

test("a time trial binds records after the fitted car is ready and segregates changed physics",async()=>{
  await tt();
  const R=g.G.records, Ghost=vm.runInContext("Ghost",g.ctx);
  assert.equal(R.key(),R.current(),"initial fingerprint must match the actual ready car");
  Ghost.startLap();for(let i=0;i<12;i++)Ghost.record(i*7, i*100,0);
  R.finish(90,[],100);
  assert.equal(Ghost.bestTime(),90);assert.equal(g.G.ttRecord,90);
  const first=R.key(), old=g.G.WHEELBASE;
  g.G.WHEELBASE=old+.1;
  assert.equal(R.accept(),false,"a modified lap must not enter either class");
  assert.notEqual(first,R.key());assert.equal(Ghost.hasGhost(),false);
  g.G.WHEELBASE=old;
  R.begin();assert.equal(Ghost.bestTime(),90,"previous-class best survives");
});

test("weather grip is continuous through the old discrete transition boundaries",async()=>{
  await g.race("monza");g.apex.headless(true);
  g.apex.weatherArc("dry","rain",60);
  const samples=[], configuration=g.G.records.current();
  for(const t of [0,19.999,20,20.001,39.999,40,40.001,60]) {
    g.G.weatherArc.t=t;
    g.G.raceWeather=t<20?"dry":t<40?"wet":"rain";
    assert.equal(g.G.records.current(),configuration,"scheduled weather progress keeps the same event identity");
    samples.push({t,w:g.G.roadWetness(),grip:g.G.gripMult({tread:0})});
  }
  assert.equal(samples[0].grip,1);assert.equal(samples.at(-1).grip,.72);
  for(let i=1;i<samples.length;i++)assert.ok(samples[i].grip<=samples[i-1].grip);
  assert.ok(Math.abs(samples[3].grip-samples[1].grip)<.001);
  assert.ok(Math.abs(samples[6].grip-samples[4].grip)<.001);
  g.apex.weather("dry");assert.equal(g.G.weatherArc,null);assert.equal(g.G.roadWetness(),0);
});

test("practice restores the driving checkpoint and cannot be armed in a normal race or daily",async()=>{
  await g.race("monza");assert.equal(g.G.coach.mark(),false);
  await tt();g.apex.reset(.1,35,0);g.apex.go();g.step(2);
  const p=g.G.player, x=p.px,z=p.pz,s=p.s, log=JSON.stringify(p.tyreLog);
  assert.equal(g.G.coach.mark(),true);g.step(30);
  p.practiceTemporaryTimer = 9;
  p.tyreLog=[{code:"X",lap0:3,lap1:null}];
  assert.equal(g.G.coach.retry(),true);
  assert.equal(JSON.stringify(p.tyreLog),log,"stint history follows the restored tyre state");
  assert.equal(p.practiceTemporaryTimer,undefined,"post-checkpoint primitive state is discarded");
  assert.equal(p.px,x);assert.equal(p.pz,z);assert.equal(p.s,s);
  assert.equal(p.incidentInvalidLap,true);assert.equal(g.G.coach.practiceActive(),true);
  await tt();assert.equal(g.G.coach.practiceActive(),false);
  const old=g.G.PACE, originalTeam=g.G.teamIdx, storedWear=g.G.store.get("tyreWear","off");
  const daily=g.G.daily.open("2026-09-14");
  await g.settle(()=>g.G.track?.def.id===daily.trackId && g.G.records.key()===g.G.records.current(),4000);
  assert.equal(daily.class,"standard");assert.equal(g.G.PACE,.84);
  assert.equal(g.G.coach.mark(),false);
  g.G.PACE=1.2;assert.equal(g.G.records.accept(),false,"custom physics cannot enter the standard class");
  g.G.PACE=.84;
  assert.equal(g.G.store.get("tyreWear","off"),storedWear,"starting a daily must not overwrite a preference");
  const open=g.G.daily.open("2026-09-14","open");
  await g.settle(()=>g.G.track?.def.id===open.trackId && g.G.records.key()===g.G.records.current(),4000);
  assert.equal(open.class,"open");assert.equal(g.G.PACE,old);assert.equal(g.G.teamIdx,originalTeam);
  g.G.daily.stop();
});


test("driving trace reads actual brake demand and feedback remains observational",async()=>{
  await tt();g.apex.reset(.1,35,0);g.apex.go();
  g.apex.act({steer:.4,throttle:false,brake:true},1/60,4);
  const p=g.G.player, status=g.G.coach.status();
  assert.equal(status.brake,1);assert.equal(status.throttle,0);
  const before=JSON.stringify(p);
  const message=g.G.coach.advice({...p,offroad:false,speed:g.G.vTop()*.6,brakeDemand:1,axFrac:.9,steerAngle:.1});
  assert.match(message,/EASE THE BRAKE/);
  assert.equal(JSON.stringify(p),before);
});
