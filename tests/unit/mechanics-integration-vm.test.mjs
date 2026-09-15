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
  const message=g.G.coach.advice({...p,offroad:false,speed:g.G.vTop()*.6,brakeDemand:1,axEstSm:-21,steerAngle:.1});
  assert.match(message,/EASE THE BRAKE/);
  assert.equal(JSON.stringify(p),before);
});

// Drive the real car through each drill. The judgements below are about what
// the car did (lateral acceleration, deceleration, distance), which is why a
// pad-sized steer that never reaches an input threshold still passes the slalom.
const drive=(input,frames,onFrame)=>{for(let i=0;i<frames;i++){g.apex.act(typeof input==="function"?input(i):input,1/60,1);if(onFrame)onFrame(i);}};
const straight={throttle:true,brake:false,steer:0};
async function armed(mode,speed){await tt();g.apex.reset(.02,speed,0);g.apex.go();drive(straight,5);assert.equal(g.G.coach.insights.startDrill(mode),true);return g.G.coach.insights;}

test("braking drill: a tap and a coast fails with its reason; a held brake passes and scores the stopping distance",async()=>{
  let ins=await armed("braking",50);
  drive(i=>({throttle:false,brake:i<3,steer:0}),60*40,()=>{});
  let last=ins.summary().lastDrill;
  assert.ok(last,"the coast reached a stop");assert.equal(last.clean,false);assert.equal(last.reason,"brake released before the stop");
  assert.equal(g.G.store.get("circuitMastery",null),null);
  ins=await armed("braking",50);
  drive({throttle:false,brake:true,steer:0},60*6);
  last=ins.summary().lastDrill;
  assert.equal(last.clean,true);
  const ideal=50*50/(2*vm.runInContext("PhysicsConsts",g.ctx).BRAKE);   // v²/2a from the physics constant, before the smoothing lag
  assert.ok(last.score>ideal*.9&&last.score<ideal*1.6,`stopping distance ${last.score} m near v²/2a=${ideal.toFixed(0)} m`);
  assert.equal(g.G.store.get("circuitMastery").entries.at(-1).completed,1);
  assert.match(ins.journal().at(-1).text,/Completed: Brake to a controlled stop · stopped \d+ m after braking/);
});

test("slalom drill: a pad-sized steer the stick threshold never saw completes on the car's real direction changes",async()=>{
  const ins=await armed("slalom",40);
  let maxCommand=0;
  drive(i=>({throttle:true,brake:false,steer:Math.sin(i/60*2*Math.PI*1.1)>0?.35:-.35}),60*8,()=>{maxCommand=Math.max(maxCommand,Math.abs(g.G.player.steerCommand||0));});
  assert.ok(maxCommand<.2,`shaped command ${maxCommand.toFixed(3)} stays under the old stick gate`);
  const last=ins.summary().lastDrill;
  assert.ok(last&&last.mode==="slalom","six changes were counted");
  assert.equal(last.clean,true,"stayed on the track: "+JSON.stringify(last));
});

test("the braking-into-turn tip fires from a full dry-track brake, which the friction-circle gate never reached",async()=>{
  // Own instance: the announce timer only decays in a render frame, which the VM
  // cannot run, so the medal the record test above seeded would hold the shared
  // game's coach in "waiting" forever.
  const h=await createGame({track:"monza"});
  try {
    h.G.daily.stop();h.G.timeTrial=true;h.G.raceWeather="dry";await h.G.startRace();h.apex.go();h.apex.headless(true);
    const coach=h.G.coach; if(!coach.feedback().enabled)coach.toggle();
    coach.reset();h.apex.reset(.02,45,0);h.apex.go();
    for(let i=0;i<5;i++)h.apex.act(straight,1/60,1);
    assert.equal(h.G.announceBusy,false,"nothing on screen before the brake");
    let fired=null,seen=null;
    for(let i=0;i<60*2&&!fired;i++){
      h.apex.act({throttle:false,brake:true,steer:.5},1/60,1);
      const f=coach.feedback(),p=h.G.player;
      seen={state:f.state,speed:p.speed,brakeUse:coach.status().brakeUse,steerAngle:p.steerAngle,off:p.offroad};
      if(f.latest)fired={...f.latest,axFrac:p.axFrac,brakeUse:coach.status().brakeUse,off:p.offroad};
    }
    assert.ok(fired,"a tip fired: "+JSON.stringify(seen));assert.equal(fired.id,"trail");
    assert.ok(fired.axFrac<.8,`axFrac ${fired.axFrac} never clears the old 0.8 gate in the dry`);
    assert.ok(fired.brakeUse>.8);
    assert.equal(fired.off,false,"the tip came on the tarmac, not as an off-track recovery");
    assert.match(h.sandbox.document.getElementById("announce").textContent,/EASE THE BRAKE AS YOU TURN/);
  } finally { h.close(); }
});
