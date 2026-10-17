import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../../js/race/setup-trial-session.js', import.meta.url), 'utf8');
const recordBox = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../../js/race/session-records.js', import.meta.url), 'utf8'), recordBox);
const PHYS = Array.from(vm.runInContext('SessionRecords.PHYS', recordBox));
const plain = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const tune = { arbF: 6, arbR: 6, rideF: 25, rideR: 60, brakeBias: 56 };
  const state = { tune, parts: { engine: 'works', tyres: 'soft' }, begins: 0, invalidated: 0, starts: 0 };
  const G = { state: 'menu', flow: 'gp', session: 'race', teamIdx: 0, driverIdx: 0, trackIdx: 0,
    raceWeather: 'dry', raceTimeOfDay: 'day', raceChangeable: false, weatherArc: null, raceLaps: 4, lapsTarget: 4,
    difficulty: 'normal', practice: false, duel: false, player: null, cars: [],
    track: { def: { id: 'bahrain', revision: 3 }, n: 100, total: 5000 },
    daily: { isActive: () => false }, netPlay: { active: () => false },
    recordControls: () => ({ autoThrottle: false, gearsManual: true, steerMode: 'buttons', aero: 'auto' }),
    getTeamParts: () => state.parts,
    records: { config: () => ({ physics: 12, tune: PHYS.map(k => G[k]), car: G.player && G.player.mods }),
      invalidate: () => state.invalidated++ }, PACE: .84, DRIFT: 0, raceLineAssist: 0,
    FRONT_GRIP: .94, PLAYER_GRIP: 1.15, ROAD_FOLLOW: 0, STEER_EXPO: 2.4,
    STEER_MAX_SLIP: .29, STEER_SPEED_REF: 41.7, WHEELBASE: 3.6, YAW_DAMP: 1, YAW_INERTIA: .58,
    coach: { beginSetupTrial: () => { state.begins++; return true; } },
    tyres: { info: () => ({ fuel: 1 }), level: () => 'off' } };
  const fresh = () => {
    G.player = { team: { id: 'haas', tier: 4 }, driverId: 'haas:0', code: 'OCO', seat: 0,
      s: 4986, x: 2, prog: -14, lap: 0, speed: 0, energy: 1, fuelLap: 0, fuelRestartLaps: 0,
      tyre: { id: 'soft' }, tread: 0, tyreWear: 0, tyreWearF: 0, tyreWearR: 0, tyreTs: 70, tyreTb: 70,
      tyreGrain: 0, tyreBlister: 0, tyreLap0: 0, tyreStints: 1, fuelId: 'standard',
      boostOn: false, otE: 0, otT: 0, aeroX: 0, mods: { accel: state.tune.arbF / 6 } };
    G.cars = [G.player]; G.state = 'count';
  };
  G.startRace = async () => { state.starts++; fresh(); };
  const box = vm.createContext({ PhysicsConsts: { REVISION: 12 }, Teams: { LIST: [{ id: 'haas' }] }, SetupTune: { get: () => state.tune } });
  vm.runInContext(source, box);
  const runtime = vm.runInContext('SetupTrialSession', box).create(G);
  const options = () => ({ teamId: 'haas', tune: plain(state.tune), mode: 'launch', isCurrent: () => true });
  return { G, state, runtime, options, fresh };
}
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('fresh normal TT launch is solo, unscored, weather-preserving and A/A context-identical', async () => {
  const { G, state, runtime, options } = fixture();
  G.raceWeather = 'wet';
  const first = await runtime.restart(options());
  assert.equal(first.ok, true); assert.equal(state.starts, 1); assert.equal(state.begins, 1);
  assert.equal(G.session, 'tt'); assert.equal(G.practice, true); assert.equal(G.raceWeather, 'wet');
  for (const field of ['physics', 'car', 'parts', 'track', 'point', 'weather', 'tyres', 'fuel', 'energy', 'assists']) assert.ok(first.context[field]);
  assert.equal(first.context.tyres.level, 'off'); assert.equal(first.context.fuel.fraction, 1);
  assert.equal(first.context.unscored, true); assert.equal(first.context.stableWeather, true);
  const control = await runtime.restart(options());
  assert.equal(control.ok, true); assert.deepEqual(plain(control.context), plain(first.context));
  state.tune = { ...state.tune, arbF: 9 };
  const candidate = await runtime.restart(options());
  assert.equal(candidate.ok, true);
  assert.deepEqual(plain(candidate.context), plain(first.context), 'candidate-derived mods do not contaminate static identity');
  assert.equal(state.invalidated, 3);
});

test('completion context refreshes all static physics/settings but freezes actual initial consumables and point', async () => {
  const { G, state, runtime, options } = fixture();
  const started = await runtime.restart(options());
  G.player.speed = 40; G.player.energy = .4; G.player.fuelLap = 1; G.player.tyreWear = .2;
  assert.deepEqual(plain(runtime.context()), plain(started.context));
  G.DRIFT = .1;
  assert.notDeepEqual(plain(runtime.context().physics), plain(started.context.physics));
  state.parts = { ...state.parts, engine: 'changed' };
  assert.equal(runtime.context().parts.engine, 'changed');
  G.raceChangeable = true;
  assert.equal(runtime.context().stableWeather, false);
});

test('scored modes, unstable weather and ordinary races are refused before any start', async () => {
  for (const change of [g => { g.flow = 'career'; }, g => { g.flow = 'season'; },
    g => { g.daily.isActive = () => true; }, g => { g.netPlay.active = () => true; },
    g => { g.netRoom = true; }, g => { g.raceChangeable = true; }, g => { g.weatherArc = { from: 'dry', to: 'wet' }; },
    g => { g.state = 'race'; }, g => { g.duel = true; }]) {
    const { G, state, runtime, options } = fixture(); change(G);
    assert.equal((await runtime.restart(options())).ok, false);
    assert.equal(state.starts, 0); assert.equal(state.begins, 0);
  }
});

test('parts, tune, physics and settings changes while awaiting restart never arm the drill', async () => {
  for (const change of [h => { h.state.parts = { engine: 'changed' }; }, h => { h.state.tune = { ...h.state.tune, arbF: 7 }; },
    h => { h.G.PACE = .9; }, h => { h.G.difficulty = 'hard'; }, h => { h.G.raceWeather = 'wet'; }]) {
    const h = fixture(), pending = defer();
    h.G.startRace = () => pending.promise;
    const result = h.runtime.restart(h.options());
    assert.equal(h.runtime.pending(), true);
    change(h); h.fresh(); pending.resolve(true);
    assert.equal((await result).ok, false); assert.equal(h.state.begins, 0);
    assert.equal(h.runtime.context(), null); assert.equal(h.G.practice, true, 'rejected comparison stays unscored');
  }
});

test('cancel and caller ownership release prevent late arming', async () => {
  for (const cancel of [h => h.runtime.cancel(), h => { h.owned = false; }]) {
    const h = fixture(), pending = defer(); h.owned = true;
    h.G.startRace = () => pending.promise;
    const result = h.runtime.restart({ ...h.options(), isCurrent: () => h.owned });
    cancel(h); h.fresh(); pending.resolve(true);
    assert.equal((await result).ok, false); assert.equal(h.state.begins, 0);
    assert.equal(h.runtime.context(), null); assert.equal(h.runtime.pending(), false);
  }
});

test('superseded restart cannot clear or arm a newer successful operation', async () => {
  const h = fixture(), pending = defer(); h.G.startRace = () => pending.promise;
  const old = h.runtime.restart(h.options());
  h.G.startRace = async () => h.fresh();
  const newer = await h.runtime.restart(h.options());
  assert.equal(newer.ok, true); assert.equal(h.state.begins, 1);
  pending.resolve(true); assert.equal((await old).ok, false);
  assert.equal(h.state.begins, 1); assert.deepEqual(plain(h.runtime.context()), plain(newer.context));
});

test('failed/canceled entry and unverifiable rolling or non-solo grids never arm', async () => {
  for (const outcome of [false, { kind: 'canceled' }, { kind: 'failed' }]) {
    const h = fixture(); h.G.startRace = async () => { h.fresh(); return outcome; };
    assert.equal((await h.runtime.restart(h.options())).ok, false); assert.equal(h.state.begins, 0);
  }
  for (const change of [g => { g.player.speed = 30; }, g => { g.cars.push({}); },
    g => { g.player.energy = undefined; }, g => { g.player.tyre = null; },
    g => { g.getTeamParts = () => null; }, g => { g.tyres.level = () => 'real'; }]) {
    const h = fixture(); h.G.startRace = async () => { h.fresh(); change(h.G); };
    assert.equal((await h.runtime.restart(h.options())).ok, false); assert.equal(h.state.begins, 0);
  }
});


test('explicit SessionEntry outcome is authoritative and changed mode is not made practice', async () => {
  const h = fixture();
  h.G.startRace = () => {
    h.fresh();
    const request = Promise.resolve(undefined);
    request.outcome = Promise.resolve({ kind: 'failed', value: undefined });
    return request;
  };
  assert.equal((await h.runtime.restart(h.options())).ok, false);
  assert.equal(h.state.begins, 0);
  const next = fixture(), waiting = defer();
  next.G.startRace = () => waiting.promise;
  const start = next.runtime.restart(next.options());
  next.G.flow = 'career'; next.G.session = 'race'; next.G.practice = false;
  waiting.resolve(true);
  assert.equal((await start).ok, false);
  assert.equal(next.G.practice, false); assert.equal(next.state.invalidated, 0);
});


test('cold records stub can load real config during normal start without invalidating unchanged physics', async () => {
  const h = fixture(), realConfig = h.G.records.config;
  h.G.records.config = () => ({});
  h.G.startRace = async () => { h.fresh(); h.G.records.config = realConfig; };
  const result = await h.runtime.restart(h.options());
  assert.equal(result.ok, true);
  assert.deepEqual(plain(result.context.physics), { revision: 12, tuners: PHYS.map(k => h.G[k]) },
    'the complete actual SessionRecords PHYS list is represented');
  assert.equal(h.state.begins, 1);
});

test('every facade physics tuner stays guarded across cold-stub bundle replacement', async () => {
  for (const field of PHYS) {
    const h = fixture(), realConfig = h.G.records.config;
    h.G.records.config = () => ({});
    h.G.startRace = async () => { h.G[field] += .01; h.fresh(); h.G.records.config = realConfig; };
    const result = await h.runtime.restart(h.options());
    assert.equal(result.ok, false, field + ' mutation must reject the comparison');
    assert.equal(h.state.begins, 0);
  }
});
