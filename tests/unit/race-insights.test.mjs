import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function fixture() {
  const ctx = vm.createContext({});
  vm.runInContext(readFileSync(new URL('../../js/race/race-insights.js', import.meta.url), 'utf8'), ctx);
  const saves = new Map(), announcements = [];
  const c = { prog: 0, lap: 1, speed: 40, energy: 1, tyreWear: 0, tyreStints: 0, tyre: { id: 'soft' } };
  const G = { player: c, raceT: 0, sectorIdx: 0, state: 'race', track: { total: 300 }, lapsTarget: 5,
    vTop: () => 100, tyres: { on: () => true }, pits: { estimate: () => ({ lossS: 20 }) }, roadWetness: () => 0,
    fmtTime: t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); },
    records: { key: () => 'class' }, store: { get: (k,d) => saves.get(k) ?? d, set: (k,v) => saves.set(k,v) },
    announce: (...args) => announcements.push(args) };
  const api = vm.runInContext('RaceInsights', ctx).create(G);
  const tick = (fields = {}, seconds = 1) => { Object.assign(c, fields); G.raceT += seconds; api.update(c); };
  api.update(c);
  return { api, c, G, saves, tick, announcements };
}
test('race journal records event edges in order without repeating sustained contact', () => {
  const { api, tick } = fixture();
  tick({ contactT: 1, penalty: 5, cutWarn: 1 }); tick({ contactT: .5 });
  assert.deepEqual(Array.from(api.journal(), e => e.kind), ['penalty', 'limits', 'contact']);
  tick({ contactT: 0 }); tick({ contactT: 1 });
  assert.equal(api.journal().length, 4);
  for (let i = 0; i < 150; i++) api.event('test', String(i));
  const rows = api.journal(); assert.equal(rows.length, 128);
  assert.ok(rows.every((r,i) => !i || r.seq > rows[i-1].seq));
  rows[0].text = 'corrupt'; assert.notEqual(api.journal()[0].text, 'corrupt');
});
test('energy forecast requires full clean sectors, excludes the initial partial, and clears on weather change', () => {
  const { api, G, tick } = fixture();
  G.sectorIdx = 1; tick({ prog: 60, energy: .9 }, 2);
  assert.equal(api.forecast().sectors[0], null);
  G.sectorIdx = 2; tick({ prog: 150, energy: .8 }, 3);
  G.sectorIdx = 0; tick({ prog: 240, energy: .7 }, 3);
  G.sectorIdx = 1; tick({ prog: 330, energy: .6 }, 3);
  assert.ok(Math.abs(api.forecast().energyPerLap - .3) < 1e-10);
  G.roadWetness = () => .2; tick({ prog: 350 }, 1);
  assert.equal(api.forecast().energyPerLap, null);
});
test('stint estimate is measured, waits half a lap and stays unknown with wear disabled', () => {
  const { api, G, tick } = fixture();
  tick({ prog: 140, tyreWear: .1 }, 4); assert.equal(api.forecast().remainingLaps, null);
  tick({ prog: 150, tyreWear: .1 }); assert.ok(Math.abs(api.forecast().remainingLaps - 4.5) < 1e-10);
  G.tyres.on = () => false; assert.equal(api.forecast().remainingLaps, null);
  G.tyres.on = () => true; tick({ prog: 170, tyreWear: 0, tyreStints: 1 });
  assert.equal(api.forecast().remainingLaps, null);
});
test('teleports cannot create tyre history or clean sector mastery', () => {
  const { api, G, tick, saves } = fixture();
  api.startDrill('sector'); tick({ prog: 20 });
  G.sectorIdx = 1; tick({ prog: 800 });
  assert.equal(api.forecast().remainingLaps, null);
  assert.equal(api.summary().lastDrill.clean, false);
  assert.equal(saves.has('circuitMastery'), false);
});
test('controlled braking drill finishes once, scores stopping distance and records bounded separate mastery', () => {
  const { api, tick, saves, announcements } = fixture();
  saves.set('circuitMastery', { version: 1, entries: [{ key: 'class:braking:all', best: 12, completed: '999' }] });
  assert.equal(api.startDrill('braking'), true);
  tick({ prog: 20, brakeDemand: 1 }); tick({ prog: 30, speed: .5 }); tick({ speed: 0 });
  const last = api.summary().lastDrill;
  assert.equal(last.clean, true); assert.equal(last.score, 10); assert.match(last.text, /stopped 10 m after braking from 144 km\/h/);
  const entry = saves.get('circuitMastery').entries[0]; assert.equal(entry.completed, 1); assert.equal(entry.best, 10);
  assert.equal(announcements.length, 1); assert.match(announcements[0][0], /PRACTICE DONE — STOPPED 10 M.*NEW BEST/);
  assert.equal(announcements[0][2], 'practice', 'a drill verdict is its own announce tier, not a record announcement');
  const summary = api.summary(); summary.lastDrill.clean = false; assert.equal(api.summary().lastDrill.clean, true);
});
test("the braking verdict measures how much distance went below the car's own hardest braking", () => {
  const { api, tick } = fixture();
  api.startDrill('braking');
  // Enters at 40 m/s and peaks at 8 m/s²: v²/2a = 100 m. The stop runs 125 m
  // because the driver eased to 4 m/s² after the first bite. Steps stay inside
  // the teleport guard (ds <= max(20, 2·speed·dt)) or the attempt reads as a jump.
  tick({ prog: 10, brakeDemand: 1, speed: 40, axEstSm: -8 });
  tick({ prog: 45, brakeDemand: 1, speed: 30, axEstSm: -8 });
  tick({ prog: 80, brakeDemand: 1, speed: 25, axEstSm: -4 });
  tick({ prog: 115, brakeDemand: 1, speed: 20, axEstSm: -4 });
  tick({ prog: 135, brakeDemand: 1, speed: .5, axEstSm: -4 });
  const last = api.summary().lastDrill;
  assert.equal(last.clean, true, last.reason); assert.equal(last.score, 125);
  assert.equal(last.limit, 100); assert.equal(last.slack, 25);
  assert.match(last.text, /stopped 125 m after braking from 144 km\/h · 25 m of it below your hardest braking/);
});
test('a stop held at the peak the whole way reports no slack, and a stop with no braking evidence reports none either', () => {
  const { api, tick } = fixture();
  api.startDrill('braking');
  tick({ prog: 10, brakeDemand: 1, speed: 40, axEstSm: -10 });    // 10 m/s² held to the stop:
  tick({ prog: 45, brakeDemand: 1, speed: 25, axEstSm: -10 });
  tick({ prog: 75, brakeDemand: 1, speed: 15, axEstSm: -10 });
  tick({ prog: 90, brakeDemand: 1, speed: .5, axEstSm: -10 });    // …80 m, exactly v²/2a
  const held = api.summary().lastDrill;
  assert.equal(held.clean, true, held.reason);
  assert.equal(held.limit, 80); assert.equal(held.slack, 0);
  assert.doesNotMatch(held.text, /below your hardest/);
  tick({ speed: 40, brakeDemand: 0, axEstSm: 0 });
  api.startDrill('braking');
  tick({ prog: 125, brakeDemand: 1, speed: 40 });                 // no deceleration reported at all
  tick({ prog: 145, brakeDemand: 1, speed: .5 });
  const bare = api.summary().lastDrill;
  assert.equal(bare.limit, null); assert.equal(bare.slack, null);
  assert.match(bare.text, /^stopped 20 m after braking from 144 km\/h$/);
});
test('a brake tap followed by a coast to a stop is not a controlled stop', () => {
  const { api, tick, saves, announcements } = fixture();
  api.startDrill('braking'); tick({ prog: 20, brakeDemand: 1 });
  for (let i = 1; i <= 8; i++) tick({ prog: 20 + i * 10, brakeDemand: 0, speed: 40 - i * 4.5 });
  tick({ prog: 110, speed: .5 });
  const last = api.summary().lastDrill;
  assert.equal(last.clean, false); assert.equal(last.reason, 'brake released before the stop');
  assert.equal(saves.has('circuitMastery'), false);
  assert.match(announcements.at(-1)[0], /TRY AGAIN: BRAKE RELEASED BEFORE THE STOP/);
  assert.match(api.journal().at(-1).text, /Retry suggested.*brake released/);
});
test('stopping without ever braking firmly fails the braking drill with its reason', () => {
  const { api, tick } = fixture();
  api.startDrill('braking'); tick({ prog: 20, brakeDemand: .2 }); tick({ prog: 30, speed: .5, brakeDemand: .2 });
  assert.equal(api.summary().lastDrill.clean, false);
  assert.equal(api.summary().lastDrill.reason, 'stopped without firm braking');
});
test('a contact marks the drill dirty with the first reason; retry clears observation history', () => {
  const { api, tick, saves } = fixture();
  api.startDrill('braking'); tick({ prog: 20, contactT: 1, brakeDemand: 1, offroad: true }); tick({ prog: 30, speed: .5 });
  assert.equal(api.summary().lastDrill.clean, false); assert.equal(api.summary().lastDrill.reason, 'car contact'); assert.equal(saves.size, 0);
  tick({ speed: 40, contactT: 0, offroad: false }); api.startDrill('braking'); tick({ prog: 50, brakeDemand: 1 }); tick({ prog: 60, speed: .5 });
  assert.equal(api.summary().lastDrill.clean, true);
});
for (const mode of ['braking', 'trail']) test(`rejected ${mode} start preserves the active attempt and measured forecasts`, () => {
  const { api, c, G, tick } = fixture();
  api.startDrill('free'); tick({ prog: 20 });
  G.sectorIdx = 1; tick({ prog: 60, energy: .9, tyreWear: .02 }, 2);
  G.sectorIdx = 2; tick({ prog: 150, energy: .8, tyreWear: .05 }, 3);
  G.sectorIdx = 0; tick({ prog: 240, energy: .7, tyreWear: .08 }, 3);
  G.sectorIdx = 1; tick({ prog: 330, energy: .6, tyreWear: .11 }, 3);
  c.speed = 29.9;
  const forecast = api.forecast(), summary = api.summary(), journal = api.journal();
  assert.ok(forecast.energyPerLap > 0);
  assert.ok(forecast.remainingLaps > 0);
  assert.equal(api.startDrill(mode), false);
  assert.deepEqual(api.forecast(), forecast);
  assert.deepEqual(api.summary(), summary);
  assert.deepEqual(api.journal(), journal);
});
test('a braking drill admitted at the minimum speed can finish using its first brake sample', () => {
  const { api, c, tick, saves } = fixture();
  c.speed = 30;
  assert.equal(api.startDrill('braking'), true);
  tick({ prog: 10, brakeDemand: 1 });
  tick({ prog: 15, speed: .5, brakeDemand: 0 });
  assert.equal(api.summary().lastDrill.clean, true);
  assert.equal(saves.get('circuitMastery').entries[0].completed, 1);
});
for (const [name, field, dirty, clear] of [['contact', 'contactT', 1, 0], ['offroad', 'offroad', true, false], ['retirement', 'retired', true, false]]) {
  test(`a transient ${name} on the first drill sample prevents clean mastery`, () => {
    const { api, tick, saves } = fixture();
    api.startDrill('braking');
    tick({ prog: 10, brakeDemand: 1, [field]: dirty });
    tick({ prog: 15, speed: .5, brakeDemand: 0, [field]: clear });
    assert.equal(api.summary().lastDrill.clean, false);
    assert.equal(saves.has('circuitMastery'), false);
  });
}
test('trail braking needs the car turning while braking and at the release, on a digital brake too', () => {
  const { api, c, tick } = fixture();
  c.speed = 30;
  assert.equal(api.startDrill('trail'), true);
  tick({ prog: 10, brakeDemand: 1 });
  tick({ prog: 20, brakeDemand: 1, steerCommand: .3 });        // stick alone: the car is not turning yet
  tick({ prog: 30, brakeDemand: 0 });
  assert.equal(api.summary().lastDrill, null);
  tick({ prog: 40, brakeDemand: 1, lateralAccel: 6 });         // keyboard brake stays at 1 while the car turns in
  tick({ prog: 50, brakeDemand: 0, lateralAccel: 0 });         // released on a straight: not a trail release
  assert.equal(api.summary().lastDrill, null);
  tick({ prog: 60, brakeDemand: 0, lateralAccel: 5 });
  assert.equal(api.summary().lastDrill.mode, 'trail');
  assert.equal(api.summary().lastDrill.clean, true);
});
test('trail braking that ends in a stop is a failed attempt', () => {
  const { api, c, tick } = fixture();
  c.speed = 30; api.startDrill('trail');
  tick({ prog: 10, brakeDemand: 1, lateralAccel: 5 }); tick({ prog: 20, brakeDemand: 1, speed: .5 });
  assert.equal(api.summary().lastDrill.clean, false);
  assert.equal(api.summary().lastDrill.reason, 'stopped before releasing the brake');
});
test('slalom counts direction changes of the car, not of the stick', () => {
  const { api, tick, announcements } = fixture();
  api.startDrill('slalom');
  for (let i = 0; i <= 8; i++) tick({ prog: 10 + i * 10, steerCommand: i % 2 ? -.4 : .4 });
  assert.equal(api.summary().drill.changes, 0, 'stick wiggle without lateral acceleration is not a direction change');
  tick({ prog: 100, lateralAccel: 5 });
  for (let i = 1; i <= 5; i++) tick({ prog: 100 + i * 10, lateralAccel: i % 2 ? -5 : 5 });
  tick({ prog: 160, lateralAccel: 1 });                        // a straight between changes does not count either way
  assert.equal(api.summary().drill.changes, 5); assert.equal(api.summary().lastDrill, null);
  tick({ prog: 170, lateralAccel: -5 });                       // same side as before the straight: still 5
  assert.equal(api.summary().lastDrill, null);
  tick({ prog: 180, lateralAccel: 5 });
  assert.equal(api.summary().lastDrill.changes, 6);
  assert.equal(api.summary().lastDrill.clean, true);
  assert.match(announcements.at(-1)[0], /PRACTICE DONE — .*6 DIRECTION CHANGES/);
});
test('a sector drill announces its time and a stationary slow car is not a direction change', () => {
  const { api, G, tick, announcements } = fixture();
  api.startDrill('sector'); tick({ prog: 20, lateralAccel: 5, speed: 5 }); tick({ prog: 25, lateralAccel: -5, speed: 5 });
  assert.equal(api.summary().drill.changes, 0);
  G.sectorIdx = 1; tick({ prog: 40, speed: 40 });
  assert.equal(api.summary().lastDrill.clean, true); assert.equal(api.summary().lastDrill.score, 3);
  assert.match(announcements.at(-1)[0], /PRACTICE DONE — 3\.0S/);
});
test('launch drill needs a stopped car and is timed from the first throttle to half of top speed', () => {
  const { api, c, tick, announcements } = fixture();
  assert.equal(api.startDrill('launch'), false); assert.match(announcements.at(-1)[0], /STOP THE CAR/);
  c.speed = 0; assert.equal(api.startDrill('launch'), true);
  tick({ prog: 0, speed: 0 }, 2);                                   // sitting on the line is not timed
  tick({ prog: 1, speed: 5, throttleDemand: 1 }); tick({ prog: 10, speed: 30 }); tick({ prog: 30, speed: 51 });
  const last = api.summary().lastDrill;
  assert.equal(last.clean, true); assert.equal(last.score, 2); assert.equal(last.text, '0 to 180 km/h in 2.00s');
  assert.match(announcements.at(-1)[0], /PRACTICE DONE — 0 TO 180 KM\/H IN 2\.00S/);
});
test('corner drill opens on sustained cornering, bridges a chicane flip, and reports minimum and exit speed', () => {
  const { api, tick, announcements } = fixture();
  api.startDrill('corner');
  tick({ prog: 10, lateralAccel: 4 }); tick({ prog: 20, lateralAccel: 0 });
  assert.equal(api.summary().drill.phase, 0, 'a twitch does not open a corner');
  for (let i = 0; i < 3; i++) tick({ prog: 30 + i * 10, lateralAccel: 8, speed: 30 - i * 2 });
  assert.equal(api.summary().drill.phase, 1);
  tick({ prog: 60, lateralAccel: 0, speed: 24 }); tick({ prog: 70, lateralAccel: 0, speed: 24 });   // unloaded through the flip
  tick({ prog: 80, lateralAccel: -8, speed: 22 });                                              // the second half of the chicane
  assert.equal(api.summary().drill.phase, 1, 'a quick flip stays one corner');
  assert.equal(api.summary().lastDrill, null);
  for (let i = 0; i < 5; i++) tick({ prog: 90 + i * 10, lateralAccel: 0, speed: 30 + i * 3 });
  const last = api.summary().lastDrill;
  assert.equal(last.clean, true); assert.match(last.text, /^\d+\.\ds · min 79 km\/h · exit 151 km\/h$/);
  assert.match(announcements.at(-1)[0], /PRACTICE DONE — .*MIN 79 KM\/H · EXIT 151 KM\/H/);
});
test('a corner drill that stops fails with where it stopped', () => {
  const { api, tick } = fixture();
  api.startDrill('corner'); tick({ prog: 10, speed: .5 });
  assert.equal(api.summary().lastDrill.reason, 'stopped before the corner');
  tick({ speed: 30 }); api.startDrill('corner');
  for (let i = 0; i < 3; i++) tick({ prog: 20 + i * 10, lateralAccel: 8 });
  tick({ prog: 50, speed: .5, lateralAccel: 0 });
  assert.equal(api.summary().lastDrill.reason, 'stopped in the corner');
});
test('a full-lap drill times the lap at the line, announces the start, and fails a backward crossing', () => {
  const { api, c, tick, announcements } = fixture();
  api.startDrill('lap'); tick({ prog: 20 }); tick({ prog: 40 });
  c.lap = 2; tick({ prog: 60 });
  assert.match(announcements.at(-1)[0], /LAP TIMING STARTED/); assert.equal(api.summary().lastDrill, null);
  for (let p = 80; p <= 340; p += 20) tick({ prog: p });
  c.lap = 3; c._lapTimeAtLine = 91.234; tick({ prog: 360 });
  const last = api.summary().lastDrill;
  assert.equal(last.clean, true, JSON.stringify(last)); assert.equal(last.score, 91.234); assert.equal(last.text, 'lap 1:31.23');
  assert.match(announcements.at(-1)[0], /^PRACTICE DONE — LAP 1:31\.23$/);
  api.startDrill('lap'); c._lapTimeAtLine = null;
  c.lap = 4; tick({ prog: 380 }); c.lap = 3; tick({ prog: 385 }); c.lap = 4; tick({ prog: 400 });
  assert.equal(api.summary().lastDrill.clean, false);
  assert.equal(api.summary().lastDrill.reason, 'crossed the line backwards');
});
test('attempts are kept per goal as bounded copies and mastery reads the saved best for this class', () => {
  const { api, tick } = fixture();
  for (let i = 0; i < 12; i++) {
    api.startDrill('braking');
    tick({ prog: 100 * i + 10, brakeDemand: 1, speed: 40 }); tick({ prog: 100 * i + 12 + i * .5, speed: .5 }); tick({ speed: 40, brakeDemand: 0 });
  }
  const tries = api.attempts('braking');
  assert.equal(tries.length, 10); assert.equal(tries[0].score, 3); assert.equal(tries.at(-1).score, 7.5);
  assert.ok(tries.every(a => a.clean), JSON.stringify(tries.filter(a => !a.clean)));
  tries[0].score = 99; assert.equal(api.attempts('braking')[0].score, 3);
  assert.equal(api.attempts('slalom').length, 0);
  assert.equal(JSON.stringify(api.mastery('braking')), '{"best":2,"completed":12}');
  assert.equal(api.mastery('slalom'), null);
  api.reset(); assert.equal(api.attempts('braking').length, 0);
});
test('network status reports measured values and clear disconnected guidance', () => {
  const { api, G } = fixture(); assert.equal(api.network(), null);
  G.netPlay = { status: () => ({ active: true, net: { alive: true, rtt: 60 }, remotes: [{ timing: { delayMs: 130 } }] }) };
  assert.equal(api.network().rttMs, 60); assert.equal(api.network().delayMs, 130);
  G.netPlay.status = () => ({ active: false, reason: 'closed' }); assert.equal(api.network().connected, false);
});
test('ghost speed derives from recorded arc samples and refuses time outside the lap', () => {
  const ctx = vm.createContext({ Log: { info() {}, warn() {} } });
  vm.runInContext(readFileSync(new URL('../../js/car/ghost.js', import.meta.url), 'utf8'), ctx);
  const g = vm.runInContext('Ghost', ctx); assert.equal(g.speedAt(1), null);
  g.setTrack('test'); g.startLap(); for (let i=0;i<12;i++) g.record(i, 20*i, 0); g.finishLap(12);
  assert.equal(g.speedAt(4.5), 20); assert.equal(g.speedAt(-1), null); assert.equal(g.speedAt(13), null);
});
test('the round debrief condenses the journal to what costs race craft, biggest cause first', () => {
  const { api, c, tick } = fixture();
  // Two warnings on lap 1, one on lap 2, a penalty and contact on lap 2.
  tick({ cutWarn: 1 }); tick({ cutWarn: 2 });
  c.lap = 2;
  tick({ cutWarn: 3 }); tick({ penalty: 5 }); tick({ contactT: 1 });
  const d = api.debrief();
  assert.deepEqual(Array.from(d, r => r.kind), ['limits', 'penalty', 'contact'],
    'ordered by what the kind costs in career.js, not by when it happened');
  const limits = d.find(r => r.kind === 'limits');
  assert.equal(limits.count, 3, 'three warnings');
  // JSON, not deepEqual: `laps` is built inside the VM realm, so a strict
  // deepEqual fails on the array prototype even when every element matches.
  assert.equal(JSON.stringify(limits.laps), '[1,2]',
    'the laps the HUD showed (js/ui/hud.js prints c.lap), de-duplicated: two to look at');
  // A stop and a compound change are strategy, not craft, and must not appear.
  tick({ pitState: 'entry' }); tick({ tyre: { id: 'hard' }, pitState: 'none' });
  assert.ok(api.journal().some(e => e.kind === 'pit'), 'the journal still logs them');
  assert.equal(api.debrief().some(r => r.kind === 'pit' || r.kind === 'tyres'), false);
});
test('a faultless race has an empty debrief, and reset clears it', () => {
  const { api, tick } = fixture();
  tick({ prog: 40 }); tick({ prog: 80 });
  assert.equal(JSON.stringify(api.debrief()), '[]', 'nothing happened, so there is nothing to show');
  tick({ contactT: 1 });
  assert.equal(api.debrief().length, 1);
  api.reset();
  assert.equal(JSON.stringify(api.debrief()), '[]');
});
