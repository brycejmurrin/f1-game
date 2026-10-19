// Coach drills, tips and the lap report in the real game VM.
// Split from mechanics-integration-vm.test.mjs (T3-16): each file boots its own game.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");
let g;
// Order-coupling found by the split: in the shared-boot file these drills ran after the daily-open test,
// which leaves the game on the daily circuit (albert_park). The corner and recover-key drills are tuned to
// that lap (the "Curva Grande" in the corner title is Monza's name), so the boot is explicit.
before(async()=>{g=await createGame({track:"albert_park"});});
after(()=>g?.close());
async function tt() {
  g.G.daily.stop(); g.G.timeTrial=true; g.G.raceWeather="dry";
  await g.G.startRace(); g.apex.go(); g.apex.headless(true);
}

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
    // The banner is a radio card: the words live in #announce-text (the VM's
    // inert DOM does not compose a parent's textContent from its children).
    assert.match(h.sandbox.document.getElementById("announce-text").textContent,/EASE THE BRAKE AS YOU TURN/);

  } finally { h.close(); }
});

test("a tip is filed under the curated turn it happened at, on real circuit geometry",async()=>{
  // Its own instance for the same reason as the test above: one tip announces,
  // and announceT is a lexical `let` inside game.js that only a render frame
  // decays — so a second tip in the same boot would wait forever.
  const h=await createGame({track:"monza"});
  try {
    h.G.daily.stop();h.G.timeTrial=true;h.G.raceWeather="dry";await h.G.startRace();h.apex.go();h.apex.headless(true);
    const coach=h.G.coach; if(!coach.feedback().enabled)coach.toggle();
    coach.reset();
    // def.turns is a frac-keyed def table, and AGENTS.md's trap is that reading
    // one in the wrong frame lands 2/3 of a lap away. A synthetic fixture cannot
    // catch that; only a real circuit can.
    const turns=h.G.track.def.turns;
    assert.ok(turns&&turns.length>=8,"monza carries curated turns");
    // Frame check: curvature peaks are found independently by __apex.corners(),
    // so agreement is evidence these fractions need no shift. A shifted frame
    // would put essentially none of them on a peak.
    const peaks=h.apex.corners(), near=t=>Math.min(...peaks.map(p=>{const d=(((t-p)%1)+1)%1;return Math.abs(d>.5?d-1:d);}));
    const aligned=turns.filter(t=>near(t)<.01).length;
    assert.ok(aligned>=Math.ceil(turns.length/2),`only ${aligned}/${turns.length} curated turns sit on a curvature peak`);
    // Placed on the APPROACH to turn 4, not on its apex: a car left at an apex
    // with no steering drives off the road, and that is a different tip.
    h.apex.reset(turns[3]-.015,45,0);h.apex.go();
    for(let i=0;i<60*3&&!coach.feedback().latest;i++)h.apex.act({throttle:false,brake:false,steer:0},1/60,1);
    const at=coach.feedback().latest;
    assert.ok(at,"a coasting tip fired on the approach");assert.equal(at.id,"coasting");
    assert.equal(at.turn,4,"the fourth curated apex is Turn 4");
    assert.equal(h.G.player.offroad,false,"…and it was a coasting tip, not an off-track one");
    assert.equal(JSON.stringify(coach.feedback().turns),'[{"turn":4,"count":1}]');
  } finally { h.close(); }
});

test("launch drill: a standing start is timed from the first throttle to half of top speed",async()=>{
  await tt();g.apex.reset(.02,0,0);g.apex.go();
  const ins=g.G.coach.insights;
  assert.equal(ins.startDrill("launch"),true);
  drive({throttle:false,brake:false,steer:0},30);            // sitting still is not timed
  drive(straight,60*12);
  const last=ins.summary().lastDrill;
  assert.ok(last&&last.mode==="launch",JSON.stringify(ins.summary()));
  assert.equal(last.clean,true,JSON.stringify(last));
  assert.ok(last.score>1&&last.score<8,`launch ${last.score}s`);
  assert.match(last.text,/^0 to \d+ km\/h in \d\.\d\ds$/);
});

test("corner drill: a pure-pursuit test driver through Curva Grande completes with minimum and exit speeds",async()=>{
  await tt();g.apex.reset(.285,35,0);g.apex.go();drive(straight,5);
  const ins=g.G.coach.insights, Tracks=vm.runInContext("Tracks",g.ctx), smp={p:[0,0,0],t:[0,0,1],r:[1,0,0],hw:7};
  // Test-side driver only: aim at the centreline a speed-scaled distance ahead. Positive steer is a right turn.
  const pursue=()=>{const p=g.G.player,look=Math.max(15,p.speed*.9);Tracks.sample(g.G.track,(p.s+look)%g.G.track.total,smp);
    let err=Math.atan2(smp.p[0]-p.px,smp.p[2]-p.pz)-p.head;while(err>Math.PI)err-=2*Math.PI;while(err<-Math.PI)err+=2*Math.PI;
    return {steer:Math.max(-1,Math.min(1,-err*2.5)),throttle:p.speed<36,brake:p.speed>39};};
  assert.equal(ins.startDrill("corner"),true);
  drive(pursue,60*12);
  const last=ins.summary().lastDrill;
  assert.ok(last&&last.mode==="corner","the corner closed: "+JSON.stringify(ins.summary()));
  assert.equal(last.clean,true,JSON.stringify(last));
  assert.match(last.text,/^\d+\.\ds · min \d+ km\/h · exit \d+ km\/h$/);
  assert.ok(g.G.store.get("circuitMastery").entries.some(e=>/:corner:all$/.test(e.key)));
});

test("the recover key restores the practice checkpoint instead of rescuing the car",async()=>{
  await tt();g.apex.reset(.1,35,0);g.apex.go();g.step(2);
  assert.equal(g.G.coach.mark(),true);
  const s0=g.G.player.s; g.step(60); assert.ok(g.G.player.s>s0+20);
  for(const type of ["keydown","keyup"])g.sandbox.dispatchEvent(vm.runInContext(`new KeyboardEvent(${JSON.stringify(type)},{code:"KeyR",key:"r"})`,g.ctx));
  g.step(1);
  assert.ok(Math.abs(g.G.player.s-s0)<2,`restored to ${g.G.player.s} from ${s0}`);
  assert.equal(g.G.coach.practiceActive(),true);
  assert.match(g.G.coach.insights.journal().at(-1).text,/Free practice — unscored/);
});

test("the lap report runs on a real circuit's turns and a real recorded ghost",async()=>{
  const h=await createGame({track:"monza"});
  try {
    h.G.daily.stop();h.G.timeTrial=true;h.G.raceWeather="dry";await h.G.startRace();h.apex.go();h.apex.headless(true);
    const coach=h.G.coach, Ghost=vm.runInContext("Ghost",h.ctx), total=h.G.track.total, turns=h.G.track.def.turns;
    if(!coach.feedback().enabled)coach.toggle();
    coach.reset();
    // A reference lap at a constant 50 m/s around the real arc.
    const LAP=total/50;
    Ghost.startLap();
    for(let i=0;i<=400;i++)Ghost.record(i/400*LAP, i/400*total, 0);
    Ghost.finishLap(LAP,{});
    assert.ok(Ghost.hasGhost(),"the reference lap stored");
    // Walk the player around the same arc at the same pace, losing 1.5 s inside
    // turn 4's segment alone. Scripted motion, real module, real turn table.
    const p=h.G.player;
    let t=0;
    const lossFrom=turns[3]*total, lossTo=turns[4]*total;
    for(let i=0;i<=2000;i++){
      const s=i/2000*total;
      t=s/50+(s>=lossFrom?Math.min(1.5,(s-lossFrom)/(lossTo-lossFrom)*1.5):0);
      p.s=s;h.G.raceT=t;coach.update(1/60);
    }
    p.s=turns[0]*total+5;h.G.raceT=t+LAP*turns[0];coach.update(1/60);   // back to turn 1: the lap closes
    const report=coach.status().lapReport;
    assert.ok(report,"a lap closed on real geometry");
    assert.equal(report.segments.length,turns.length,"one segment per curated turn");
    assert.equal(report.worst.turn,4,"the loss was inside turn 4's segment: "+JSON.stringify(report.segments.slice(0,3)));
    assert.ok(Math.abs(report.worst.lost-1.5)<.3,`turn 4 lost ${report.worst.lost}`);
    const others=report.segments.filter(r=>r.turn!==4);
    assert.ok(others.every(r=>Math.abs(r.lost)<.3),"every other segment is on the reference pace: "+JSON.stringify(others));
  } finally { h.close(); }
});
