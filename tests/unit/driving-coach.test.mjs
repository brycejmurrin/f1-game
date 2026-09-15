import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function fixture() {
  const nodes = new Map(['pm-coach-status', 'pm-coach-tip', 'pm-coach-summary'].map(id => [id, { textContent: '' }]));
  const saved = new Map(), announcements = [];
  const c = { speed: 60, lapTime: 0, brakeDemand: 0, throttleDemand: 0 };
  const G = { player: c, state: 'race', raceT: 0, paused: false, announceBusy: false,
    vTop: () => 100, roadWetness: () => 0, cautionInfo: () => ({ level: 0 }),
    store: { get: (key, fallback) => saved.get(key) ?? fallback, set: (key, value) => saved.set(key, value) },
    $: id => nodes.get(id) || null, timeTrial: true, daily: { isActive: () => false }, netPlay: { active: () => false },
    records: { invalidate() {}, config: () => ({}) }, tyres: { on: () => false },
    pits: { ownedTyres: () => [], choices: () => [] }, announce: (...args) => announcements.push(args) };
  const ctx = vm.createContext({
    RaceInsights: { create: () => ({ update() {}, reset() {}, summary: () => ({}), journal: () => [], forecast: () => null, network: () => null, startDrill: () => true }), DRILLS: { free: {} } },
    SettingRow: { paint() {}, disable() {}, wire() {} }, Ghost: {}, IncidentSim: { reset() {} }, DebrisWorld: { reset() {} }
  });
  vm.runInContext(readFileSync(new URL('../../js/race/driving-coach.js', import.meta.url), 'utf8'), ctx);
  const coach = vm.runInContext('DrivingCoach', ctx).create(G);
  const tick = (seconds, fields = {}) => {
    Object.assign(c, fields);
    for (let t = 0; t < seconds - 1e-9; t += .05) { G.raceT += .05; coach.update(.05); }
  };
  const enable = () => coach.toggle();
  return { coach, G, c, nodes, saved, announcements, tick, enable };
}
const braking = { brakeDemand: 1, throttleDemand: 1, axFrac: .9, steerAngle: .1 };
const rear = { rearUtil: .97, frontUtil: .6, slipRear: .12 };

test('coach defaults off, saves the choice, and paints understandable empty feedback', () => {
  const { coach, saved, nodes, tick } = fixture();
  tick(2, braking); assert.equal(coach.feedback().total, 0);
  coach.paint(); assert.match(nodes.get('pm-coach-status').textContent, /Coach off/);
  assert.equal(nodes.get('pm-coach-tip').textContent, 'Your next tip will appear here after you drive.');
  coach.toggle(); assert.equal(saved.get('drivingCoach'), true);
  assert.equal(coach.status().coach.state, 'watching');
  assert.match(nodes.get('pm-coach-summary').textContent, /not a driving score/);
});

test('six recommendations use actual inputs and axle slip without changing car state', () => {
  const { coach, c } = fixture();
  const advice = fields => coach.advice({ ...c, ...fields });
  assert.match(advice({ offroad: true, speed: 1 }), /REJOIN GENTLY/);
  assert.match(advice(braking), /EASE THE BRAKE AS YOU TURN/);
  assert.match(advice({ ...rear, throttleDemand: 1 }), /EASE THE THROTTLE/);
  assert.match(advice({ ...rear, brakeDemand: 1, throttleDemand: 1 }), /EASE THE BRAKE GENTLY/);
  assert.match(advice(rear), /KEEP INPUTS SMOOTH/);
  assert.match(advice({ frontUtil: .97, slipFront: .12, steerAngle: .1 }), /UNWIND/);
  assert.equal(advice({ rearUtil: .99, frontUtil: .6, throttleDemand: 1 }), '', 'load alone does not establish a slide');
  assert.equal(advice({ throttleDemand: 1, brakeDemand: 1 }), '', 'normal auto-throttle with braking is not a mistake');
  assert.equal(advice({ ...rear, throttleDemand: 1, speed: 4 }), '');
  assert.equal(advice({ offroad: true, speed: -2 }), '');
  assert.deepEqual(c, { speed: 60, lapTime: 0, brakeDemand: 0, throttleDemand: 0 });
});

test('brief transients and suspended frames cannot trigger a tip; sustained evidence can', () => {
  const { coach, tick, enable, c, announcements } = fixture(); enable();
  tick(.3, braking); tick(.1, { brakeDemand: 0 }); tick(.3, braking);
  assert.equal(announcements.length, 0);
  tick(.2); assert.equal(announcements.length, 1);
  assert.equal(announcements[0][2], 'coach');
  assert.equal(coach.feedback().latest.id, 'trail');
  assert.equal(coach.status().coach.total, 1);
  const savedCar = JSON.stringify(c); tick(.3); assert.equal(JSON.stringify(c), savedCar);
  coach.reset(); Object.assign(c, braking); coach.update(30);
  assert.equal(coach.feedback().total, 0);
});

test('global spacing and per-tip cooldown prevent repeated reminders', () => {
  const { coach, tick, enable, announcements } = fixture(); enable();
  tick(.5, braking); assert.equal(announcements.length, 1);
  tick(7, { ...rear, brakeDemand: 0, throttleDemand: 1 }); assert.equal(announcements.length, 1);
  tick(2); assert.equal(announcements.length, 2);
  tick(18, { rearUtil: 0, slipRear: 0, ...braking }); assert.equal(announcements.length, 2);
  tick(4); assert.equal(announcements.length, 3);
  assert.equal(coach.feedback().counts.find(r => r.id === 'trail').count, 2);
});

test('cautions and race messages discard pending evidence rather than queue a stale tip', () => {
  for (const block of ['message', 'caution', 'contact']) {
    const { coach, G, c, tick, enable, announcements } = fixture(); enable(); tick(.4, braking);
    if (block === 'message') G.announceBusy = true;
    if (block === 'caution') G.cautionInfo = () => ({ level: 1 });
    if (block === 'contact') c.contactT = .5;
    tick(2); assert.equal(coach.feedback().state, 'waiting'); assert.equal(announcements.length, 0);
    G.announceBusy = false; G.cautionInfo = () => ({ level: 0 }); c.contactT = 0;
    tick(.2); assert.equal(announcements.length, 0);
    tick(.3); assert.equal(announcements.length, 1);
  }
});

test('pause, pits, finish and retirement suppress coaching, and toggle resets pending evidence', () => {
  for (const fields of [{ paused: true }, { pitState: 'box' }, { finished: true }, { retired: true }]) {
    const { coach, G, c, tick, enable, announcements } = fixture(); enable();
    if ('paused' in fields) G.paused = true; else Object.assign(c, fields);
    tick(2, braking); assert.equal(announcements.length, 0);
    assert.notEqual(coach.feedback().state, 'watching');
  }
  const { coach, tick, enable, announcements } = fixture(); enable(); tick(.4, braking);
  coach.toggle(); coach.toggle(); tick(.2); assert.equal(announcements.length, 0);
  tick(.3); assert.equal(announcements.length, 1);
});

test('feedback snapshots cannot corrupt session counts; reset clears history but keeps the preference', () => {
  const { coach, tick, enable, nodes } = fixture(); enable(); tick(.5, braking);
  const view = coach.feedback(); view.latest.text = 'changed'; view.counts[0].count = 999;
  assert.equal(coach.feedback().total, 1); assert.notEqual(coach.feedback().latest.text, 'changed');
  coach.paint(); assert.match(nodes.get('pm-coach-tip').textContent, /Release the brake gradually/);
  assert.match(nodes.get('pm-coach-summary').textContent, /1 tip recorded/);
  coach.reset(); assert.equal(coach.feedback().total, 0); assert.equal(coach.feedback().latest, null);
  assert.equal(coach.feedback().enabled, true);
});
