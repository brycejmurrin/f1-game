import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function fixture() {
  const ctx = vm.createContext({});
  vm.runInContext(readFileSync(new URL('../../js/race/race-insights.js', import.meta.url), 'utf8'), ctx);
  const saves = new Map();
  const c = { prog: 0, lap: 1, speed: 40, energy: 1, tyreWear: 0, tyreStints: 0, tyre: { id: 'soft' } };
  const G = { player: c, raceT: 0, sectorIdx: 0, state: 'race', track: { total: 300 }, lapsTarget: 5,
    vTop: () => 100, tyres: { on: () => true }, pits: { estimate: () => ({ lossS: 20 }) }, roadWetness: () => 0,
    records: { key: () => 'class' }, store: { get: (k,d) => saves.get(k) ?? d, set: (k,v) => saves.set(k,v) }, announce() {} };
  const api = vm.runInContext('RaceInsights', ctx).create(G);
  const tick = (fields = {}, seconds = 1) => { Object.assign(c, fields); G.raceT += seconds; api.update(c); };
  api.update(c);
  return { api, c, G, saves, tick };
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
test('controlled braking drill finishes once and records bounded separate mastery', () => {
  const { api, tick, saves } = fixture();
  saves.set('circuitMastery', { version: 1, entries: [{ key: 'class:braking:all', best: 10, completed: '999' }] });
  assert.equal(api.startDrill('braking'), true);
  tick({ prog: 20, brakeDemand: 1 }); tick({ prog: 30, speed: .5 }); tick({ speed: 0 });
  assert.equal(api.summary().lastDrill.clean, true);
  const entry = saves.get('circuitMastery').entries[0]; assert.equal(entry.completed, 1); assert.equal(entry.best, 2);
  const summary = api.summary(); summary.lastDrill.clean = false; assert.equal(api.summary().lastDrill.clean, true);
});
test('a contact marks the drill dirty; retry clears observation history', () => {
  const { api, tick, saves } = fixture();
  api.startDrill('braking'); tick({ prog: 20, contactT: 1, brakeDemand: 1 }); tick({ prog: 30, speed: .5 });
  assert.equal(api.summary().lastDrill.clean, false); assert.equal(saves.size, 0);
  tick({ speed: 40, contactT: 0 }); api.startDrill('braking'); tick({ prog: 50, brakeDemand: 1 }); tick({ prog: 60, speed: .5 });
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
test('trail braking observes the first brake input before the turning and release phases', () => {
  const { api, c, tick } = fixture();
  c.speed = 30;
  assert.equal(api.startDrill('trail'), true);
  tick({ prog: 10, brakeDemand: 1 });
  tick({ prog: 20, brakeDemand: .3, steerCommand: .3 });
  tick({ prog: 30, brakeDemand: 0 });
  assert.equal(api.summary().lastDrill.mode, 'trail');
  assert.equal(api.summary().lastDrill.clean, true);
});
test('slalom counts six changes after the first steering observation', () => {
  const { api, tick } = fixture();
  api.startDrill('slalom');
  tick({ prog: 10, steerCommand: .4 });
  for (let i = 1; i <= 6; i++) tick({ prog: 10 + i * 10, steerCommand: i % 2 ? -.4 : .4 });
  assert.equal(api.summary().lastDrill.changes, 6);
  assert.equal(api.summary().lastDrill.clean, true);
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
