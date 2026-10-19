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
  // ONE CARD FOR ONE LAP. A 90 s lap against a 100 s pole earns a medal AND
  // beats an unset record, and these were two announce() calls — five seconds
  // of banner for one line crossing, and before the queue took a second entry
  // of equal priority, one of them was simply eaten.
  assert.match(vm.runInContext('document.getElementById("announce-text").textContent',g.ctx),
    /MEDAL — NEW RECORD 1:30\.00$/,"the medal and the record must arrive as one sentence");
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
  for(const t of [0,19.999,20,20.001,39.999,40,40.001,60,400]) {   // 400: the road lags the ramp (WeatherArc wetAt) and settles past dur
    g.G.weatherArc.t=t;
    g.G.raceWeather=t<20?"dry":t<40?"wet":"rain";   // an enum poke: the tick re-reads the stage off wetness
    assert.equal(g.G.records.current(),configuration,"scheduled weather progress keeps the same event identity");
    g.apex.step(0,1);   // A3: settle frame.wetness to the lerp (look=drive)
    const w=g.G.trackWetness();
    samples.push({t,w,fw:g.G.frame.wetness,grip:g.G.gripMult({tread:0})});
    assert.ok(Math.abs(g.G.frame.wetness-w)<1e-6,
      "frame.wetness must track trackWetness at t="+t+" (fw="+g.G.frame.wetness+" w="+w+")");
  }
  assert.equal(samples[0].grip,1);assert.equal(samples.at(-1).grip,.72);
  for(let i=1;i<samples.length;i++)assert.ok(samples[i].grip<=samples[i-1].grip);
  assert.ok(Math.abs(samples[3].grip-samples[1].grip)<.001);
  assert.ok(Math.abs(samples[6].grip-samples[4].grip)<.001);
  g.apex.weather("dry");assert.equal(g.G.weatherArc,null);assert.equal(g.G.trackWetness(),0);
});

test("A3: settled frame.wetness matches trackWetness for dry/wet/rain pins",async()=>{
  await g.race("monza","day","dry");g.apex.headless(true);
  for (const [wx, want] of [["dry",0],["wet",0.5],["rain",1]]) {
    g.apex.weather(wx);
    g.apex.step(0,1);
    assert.equal(g.G.raceWeather,wx);
    assert.equal(g.G.trackWetness(),want);
    assert.equal(g.G.frame.wetness,want,
      wx+" must settle look=drive (frame.wetness===trackWetness)");
  }
  g.apex.weather("dry");
});

test("a race can be armed for practice, which unlocks checkpoints and spoils the session",async()=>{
  await g.race("monza");g.apex.go();g.step(2);
  // The gate the feature shipped with: a scored race offers nothing.
  assert.equal(g.G.practice,false,"a race is scored until the player says otherwise");
  assert.equal(g.G.coach.mark(),false);
  assert.equal(g.G.coach.rewind(),false,"rewind is gated with everything else");
  assert.equal(g.G.coach.canArm(),true,"but a plain race CAN be armed");
  assert.equal(g.G.coach.armPractice(),true);
  assert.equal(g.G.practice,true);
  assert.equal(g.G.coach.canArm(),false,"arming is one-way, so the control retires");
  // The reason this could not ship before: invalidate() was a no-op outside a
  // time trial, so a rewound lap stayed eligible for the board.
  assert.equal(g.G.records.accept(),false,"an armed session cannot set a record");
  assert.equal(g.G.coach.mark(),true,"checkpoints follow the practice flag, not the session type");
});

test("the START drill can be set where it says to: on the grid, before the lights",async()=>{
  // Not g.race(): that presses go(). startRace() leaves the field on the grid.
  g.G.daily.stop();g.G.timeTrial=false;g.G.practice=false;await g.G.startRace();g.apex.headless(true);
  assert.equal(g.G.state,"count","still on the grid");
  assert.equal(g.G.coach.canArm(),true,"the pause menu offers ARM during the countdown");
  assert.equal(g.G.coach.armPractice(),true);
  assert.equal(g.G.coach.canPractice(),true,"SET and the drill picker are live on the grid");
  assert.equal(g.G.coach.insights.startDrill("start"),true,"a stopped car with a field around it");
  assert.equal(g.G.coach.mark(),true,"a checkpoint taken on the grid");
});

test("rewind steps the player back about ten seconds, and never rewinds a penalty",async()=>{
  await tt();g.apex.reset(.1,35,0);g.apex.go();g.step(2);
  const p=g.G.player;
  assert.equal(g.G.coach.rewind(),false,"nothing buffered yet");
  g.step(700);                      // FRAMES, not seconds: 700/60 ~ 11.7 s, past the 10 s window
  const sBefore=p.s;
  assert.equal(g.G.coach.rewindReady(),true);
  p.penalty=5;p.cuts=2;             // picked up AFTER the oldest sample
  assert.equal(g.G.coach.rewind(),true);
  assert.ok(p.s<sBefore,"the car is back up the road");
  assert.equal(p.incidentInvalidLap,true,"the lap it lands on cannot count");
  assert.equal(p.penalty,5,"a penalty is not undone by rewinding");
  assert.equal(p.cuts,2,"nor is the track-limits ladder");
  assert.equal(g.G.coach.practiceActive(),true,"rewinding is practising");
  assert.equal(g.G.coach.rewind(),false,"the buffer is spent, not replayed");
  // A REWIND MUST NOT DIRTY THE ATTEMPT IT EXISTS TO RETRY. RaceInsights fails
  // an in-progress drill when the clock or arc jumps backwards ("position
  // jumped") — which is what a rewind is — so rewind() re-arms the drill the
  // way retry() does. Without that the drill comes back already unclean, for a
  // reason that names the mechanism rather than anything the driver did.
  const d=g.G.coach.insights.summary().lastDrill;
  assert.ok(!d||d.reason!=="position jumped","the rewind itself must not fail the drill");
});

test("rewind never hands the player's wheel back to the AI (flying-start hand-over role flags)",async()=>{
  await tt();g.apex.reset(.1,35,0);g.apex.go();g.step(2);
  const p=g.G.player;
  p.human=false;                    // every buffered sample sees the hand-over's AI role
  g.step(700);
  p.human=true;                     // …then the wheel is the player's again
  assert.equal(g.G.coach.rewind(),true);
  assert.equal(p.human,true,"the restored sample's human=false is not carried back");
  assert.equal(p.isPlayer,true);
});

test("rewinding a race with other cars puts the WHOLE race back, not just the player",async()=>{
  g.G.duel=true;                        // 2 cars is enough to prove a field rewinds
  await g.race("monza");g.apex.go();g.step(2);
  assert.equal(g.G.coach.armPractice(),true);
  const p=g.G.player, rival=g.G.cars.find(c=>!c.isPlayer);
  assert.ok(rival,"a rival is on track");
  g.step(700);                          // fill the 10 s window
  assert.equal(g.G.coach.rewindReady(),true);
  const pS=p.s, rS=rival.s, t0=g.G.raceT;
  g.step(240);                          // 4 s more, so everything has moved on
  assert.ok(rival.s!==rS,"the rival covered ground before the rewind");
  assert.ok(g.G.raceT>t0,"and the clock ran");
  // The player picks up a penalty AFTER the sample; the rival picks one up too.
  p.penalty=5; rival.penalty=3;
  assert.equal(g.G.coach.rewind(),true);
  // THE POINT OF THIS TEST: the rival goes back with the player.
  assert.ok(p.s<=pS+1e-6,"the player is back where it was");
  assert.ok(rival.s<=rS+1e-6,"AND SO IS THE RIVAL — not left where it drove to");
  assert.ok(g.G.raceT<=t0+1e-6,"the race clock came back too, so gaps still read true");
  // The asymmetry is deliberate: the player keeps the consequence of running
  // wide (there is a lesson to protect), the rival is just part of the world.
  assert.equal(p.penalty,5,"the player's penalty does not rewind");
  assert.notEqual(rival.penalty,3,"the rival's DOES — it is part of the world being rewound");
  g.G.duel=false;
});

test("aiPlace clears the teleport accumulators, exactly as jump() does",async()=>{
  // jump() gained this block after a MEASURED bug: a wedge-then-jump carried
  // ~3 s of rescueT into the new spot and fired a surprise auto-rescue.
  // aiPlace() never did, so an AI placed into a scripted scenario could rescue
  // itself somewhere it had never been stuck.
  await g.race("monza");g.apex.go();g.step(2);
  const rival=g.G.cars.find(c=>!c.isPlayer), idx=g.G.cars.indexOf(rival);
  rival.rescueT=3; rival.wallT=2; rival.wasOnWall=true;
  rival.wrongT=1.5; rival.wrongWay=true; rival.offT=2.5;
  assert.ok(g.apex.aiPlace(idx,.4,60,0),"the placement is accepted");
  assert.equal(rival.rescueT,0,"rescueT does not follow the car to the new spot");
  assert.equal(rival.wallT,0);assert.equal(rival.wasOnWall,false);
  assert.equal(rival.wrongT,0);assert.equal(rival.wrongWay,false);assert.equal(rival.offT,0);
  assert.equal(rival.rPrevHead,rival.head,"the yaw anchor moves too, or the car swings into place");
  assert.equal(rival.rPrevS,rival.s,"and the arc anchor");
});

test("the duel rival is not bumped on the axis that makes it concede",async()=>{
  // AWARENESS runs backwards for a benchmark rival (js/physics/ai-drive.js):
  //   letPassDelay = lerp(4.2, 1.8, awareness)  -> higher yields SOONER
  //   awareMul     = lerp(1.25, 0.7, awareness) -> higher attacks LESS
  // The first cut of DUEL_BUMP raised it by 10, buying a rival that concedes
  // quicker and attacks less often — the opposite of the intent.
  const Duel=g.sandbox.Duel, DR=g.sandbox.DriverRatings;
  assert.equal(Duel.BUMP.awareness,0,"awareness is deliberately not bumped");
  assert.ok(Duel.BUMP.craft>0,"craft is — it raises BOTH attack and defend");
  const base=DR.get("VER",0,null), bumped=DR.get("VER",0,Duel.BUMP);
  assert.ok((bumped.awareness||0)<=(base.awareness||0),
    "so a duel rival never ends up more willing to concede than the stock driver");
});

test("a duel trims the grid to the player and one bumped rival",async()=>{
  g.G.duel=true;
  await g.race("monza");g.apex.go();g.step(2);
  assert.equal(g.G.cars.length,2,"player plus one rival, like quali and TT trim to one");
  const rival=g.G.cars.find(c=>!c.isPlayer);
  assert.ok(rival,"the rival is a real entry from the built field");
  assert.equal(rival.duelRival,true);
  assert.ok(rival.code&&rival.team,"it keeps its driver code and team, not a synthetic seat");
  // The bump has to reach the axes the AI actually drives on, or it is decoration.
  assert.ok(rival.craft>0&&rival.craft<=1,"racecraft axes stay normalised 0..1");
  assert.ok(rival.awareness>0&&rival.awareness<=1);
  assert.ok(rival.skill>0&&rival.skill<=1,"skill stays a ground-speed scalar");
  // THE BUMP MUST BE A REAL LIFT, not just a field that got written. Compared
  // against the same driver's UNBUMPED rating, which is what the rest of the
  // grid would have raced on.
  const DR=g.sandbox.DriverRatings;
  const base=DR.get(rival.code,rival.tier,null);
  assert.ok(rival.craft>(base.craft||75)/100,"craft is lifted above the stock rating");
  // NOT awareness. This assertion used to require it to be lifted, which pinned
  // the bug: awareness is the CAUTION axis, and raising it makes the rival
  // concede sooner (letPassDelay) and attack less (awareMul). See Duel.BUMP.
  assert.ok(rival.awareness<=(base.awareness||75)/100+1e-9,
    "awareness is not lifted — raising it would make the rival concede sooner");
  assert.ok(rival.experience>(base.experience||75)/100,"experience is, for attack persistence");
  // PACE IS THE SMALLEST LIFT on purpose (js/race/duel.js): a same-spec car
  // out-dragging the player down a straight is the tell players catch first.
  const dCraft=rival.craft-(base.craft||75)/100, dPace=rival.skill-DR.skill(base,0.5);
  assert.ok(dCraft>dPace,"the difficulty is in racecraft, not top speed");
  // AND IT HAS TO DRIVE. A 2-car field is a size the AI's gap logic has never
  // raced at — the rival must actually cover ground, not stall on the grid.
  const s0=rival.s, lap0=rival.lap|0;
  g.step(900);                      // 15 s of racing
  assert.ok(rival.s!==s0||((rival.lap|0)>lap0),"the rival moves under AI control");
  assert.ok(Number.isFinite(rival.speed)&&rival.speed>0,"and carries a real speed");
  assert.ok(Number.isFinite(g.G.player.s),"the player's arc stays finite beside it");
  g.G.duel=false;
  await g.race("monza");
  assert.ok(g.G.cars.length>2,"clearing the setting restores a full grid");
});

test("a DUEL setting does not trim a season round to two cars (ed11e6108)",async()=>{
  // DUEL is a sticky SETTING but a one-off FORMAT: the sheet only hides its row
  // in a championship, so a duel chosen once trimmed the next season round to
  // the player and one rival (and paid it a full points table).
  const G=g.G, S=g.sandbox.SeasonCal, T=g.sandbox.Tracks;
  await g.race("monza");const fullGrid=G.cars.length;
  const cfg0=JSON.parse(JSON.stringify(S.config())), season0=G.season;
  try {
    G.duel=true;
    G.timeTrial=false;G.seasonMode=true;
    const ap=S.applyConfig(Object.assign({},cfg0,{quali:false,sprint:false}));   // straight to the grid, no session in between
    assert.ok(ap.ok&&ap.season,"the season setup applies");G.season=ap.season;
    G.trackIdx=S.trackIndex(0);
    const before=G.cars;
    await G.startRace();
    assert.notStrictEqual(G.cars,before,"anti-vacuity: startRace built this round's field");
    assert.equal(G.flow,"season");assert.equal(G.track.def.id,T.LIST[S.trackIndex(0)].id);
    assert.equal(G.cars.length,fullGrid,"a season round races the full grid whatever DUEL says");
    assert.equal(G.cars.filter(c=>c.duelRival).length,0,"and nobody is bumped into a duel rival");
  } finally {
    G.duel=false;G.seasonMode=false;S.setConfig(cfg0);G.season=season0;
  }
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
