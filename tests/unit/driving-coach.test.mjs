import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function fixture() {
  const nodes = new Map(['pm-coach-status', 'pm-coach-tip', 'pm-coach-summary', 'pm-drill-status'].map(id => [id, { textContent: '' }]));
  const saved = new Map(), announcements = [];
  // Throttle held: the default car is driving, not coasting (a coasting tip is its own test).
  const c = { speed: 60, lapTime: 0, brakeDemand: 0, throttleDemand: 1 };
  // A 1000 m lap with curated apexes at 100 m, 500 m and 980 m — the last one
  // sits just before the line so the wrap is exercised.
  const G = { player: c, track: { total: 1000, def: { turns: [0.10, 0.50, 0.98] } },
    state: 'race', raceT: 0, paused: false, announceBusy: false,
    vTop: () => 100, roadWetness: () => 0, cautionInfo: () => ({ level: 0 }),
    fmtTime: t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); },
    store: { get: (key, fallback) => saved.get(key) ?? fallback, set: (key, value) => saved.set(key, value) },
    $: id => nodes.get(id) || null, timeTrial: true, daily: { isActive: () => false }, netPlay: { active: () => false },
    records: { invalidate() {}, config: () => ({}) }, tyres: { on: () => false },
    pits: { ownedTyres: () => [], choices: () => [] }, announce: (...args) => announcements.push(args) };
  const ins = { update() {}, reset() {}, summary: () => ({}), journal: () => [], forecast: () => null, network: () => null,
    startDrill: () => true, attempts: () => [], mastery: () => null };
  const ctx = vm.createContext({
    RaceInsights: { create: () => ins, DRILLS: { free: 'Free practice', sector: 'Finish this sector cleanly',
      corner: 'Drive through the next corner', braking: 'Brake to a controlled stop', trail: 'Release the brake into a turn',
      slalom: 'Six clean direction changes' } },
    SettingRow: { paint() {}, disable() {}, wire() {} }, Ghost: {}, IncidentSim: { reset() {} }, DebrisWorld: { reset() {} },
    PhysicsConsts: { BRAKE: 22, REVISION: 'test' }
  });
  vm.runInContext(readFileSync(new URL('../../js/race/driving-coach.js', import.meta.url), 'utf8'), ctx);
  const coach = vm.runInContext('DrivingCoach', ctx).create(G);
  const tick = (seconds, fields = {}) => {
    Object.assign(c, fields);
    for (let t = 0; t < seconds - 1e-9; t += .05) { G.raceT += .05; coach.update(.05); }
  };
  const enable = () => coach.toggle();
  return { coach, G, c, ins, nodes, saved, announcements, tick, enable };
}
const braking = { brakeDemand: 1, throttleDemand: 1, axEstSm: -21.7, axFrac: .64, steerAngle: .1 };   // full brake, dry: the measured plateau
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
  assert.match(advice({ ...rear, throttleDemand: 0 }), /KEEP INPUTS SMOOTH/);
  assert.match(advice({ frontUtil: .97, slipFront: .12, steerAngle: .1 }), /UNWIND/);
  assert.equal(advice({ brakeDemand: 1, axEstSm: -8, axFrac: .24, steerAngle: .1 }), '', 'a trailed brake at a third of the ceiling is the technique, not the mistake');
  assert.equal(advice({ brakeDemand: 0, throttleDemand: .4, axEstSm: -21.7, axFrac: .64, steerAngle: .1 }), '', 'deceleration without the pedal is not a braking tip');
  assert.ok(coach.status().brakeUse >= 0 && coach.status().brakeUse <= 1);
  assert.equal(advice({ rearUtil: .99, frontUtil: .6, throttleDemand: 1 }), '', 'load alone does not establish a slide');
  assert.equal(advice({ throttleDemand: 1, brakeDemand: 1 }), '', 'normal auto-throttle with braking is not a mistake');
  assert.equal(advice({ ...rear, throttleDemand: 1, speed: 4 }), '');
  assert.equal(advice({ offroad: true, speed: -2 }), '');
  assert.deepEqual(c, { speed: 60, lapTime: 0, brakeDemand: 0, throttleDemand: 1 });
});

test('coasting and X-mode tips read the pedals, the flaps and the cornering load, and coasting needs sustained evidence', () => {
  const { coach, c, tick, enable, announcements } = fixture(); enable();
  const advice = fields => coach.advice({ ...c, ...fields });
  assert.match(advice({ throttleDemand: 0 }), /COASTING/);
  assert.equal(advice({ throttleDemand: .1 }), '', 'a breath of throttle is driving');
  assert.equal(advice({ throttleDemand: 0, brakeDemand: .1 }), '');
  assert.equal(advice({ throttleDemand: 0, speed: 30 }), '', 'a slow car is not coasting');
  assert.match(advice({ aeroX: 1, lateralAccel: 8 }), /CLOSE THE WING/);
  assert.equal(advice({ aeroX: 1, lateralAccel: 2 }), '', 'open flaps on a straight are the point of X-mode');
  assert.equal(advice({ aeroX: .2, lateralAccel: 8 }), '', 'flaps closing already');
  assert.equal(advice({ aeroX: 1, lateralAccel: 8, speed: 30 }), '');
  tick(1, { throttleDemand: 0 }); assert.equal(announcements.length, 0, 'a one-second lift is a corner entry');
  tick(.3); assert.equal(announcements.length, 1); assert.equal(coach.feedback().latest.id, 'coasting');
});

test('a track-limits warning is coached at once, but not the count the coach first saw nor the reset after a penalty', () => {
  const { coach, c, G, tick, enable, announcements } = fixture(); enable();
  c.cutWarn = 2; tick(.5); assert.equal(announcements.length, 0, 'an existing count is history, not a new warning');
  c.cutWarn = 3; tick(.05); assert.equal(announcements.length, 1); assert.equal(coach.feedback().latest.id, 'limits');
  assert.match(announcements[0][0], /TRACK LIMITS/);
  tick(9.5); c.cutWarn = 0; tick(.5); assert.equal(announcements.length, 1, 'the game announces the penalty that reset the ladder');
  tick(21);
  G.announceBusy = true; c.cutWarn = 1; tick(2); assert.equal(announcements.length, 1, 'held while a race message shows');
  G.announceBusy = false; tick(.1); assert.equal(announcements.length, 2);
  tick(31);
  G.announceBusy = true; c.cutWarn = 2; tick(3.2); G.announceBusy = false; tick(.5);
  assert.equal(announcements.length, 2, 'a warning older than three seconds is stale');
  assert.equal(coach.feedback().counts.find(r => r.id === 'limits').count, 2);
});

test('a tip records the curated turn it happened at, wrapping across the start line', () => {
  const { coach, c, G, tick, enable } = fixture(); enable();
  c.s = 100; tick(.5, braking);                       // the apex itself
  assert.equal(coach.feedback().latest.turn, 1);
  c.s = 975; tick(31);                                // 5 m before Turn 3's apex, and past the cooldown
  assert.equal(coach.feedback().latest.turn, 3);
  c.s = 5; tick(31);                                  // 25 m PAST that apex, over the line — still Turn 3
  assert.equal(coach.feedback().latest.turn, 3);
  c.s = 300; tick(31);                                // mid-straight: 200 m from the nearest apex, outside the 150 m window
  assert.equal(coach.feedback().latest.turn, null, 'a tip on a straight names no turn');
  assert.equal(JSON.stringify(coach.feedback().turns.map(r => [r.turn, r.count])), '[[3,2],[1,1]]');
  const view = coach.feedback(); view.turns[0].count = 99;
  assert.equal(coach.feedback().turns[0].count, 2, 'the review is a copy');
  G.track = null; c.s = 100; tick(31);
  assert.equal(coach.feedback().latest.turn, null, 'a circuit with no curated turns simply has no location');
});

test('the turn window is a distance, not a share of the lap, so a long circuit keeps its straights', () => {
  const { coach, c, G, tick, enable } = fixture(); enable();
  G.track = { total: 10000, def: { turns: [0.5] } };   // a 10 km lap with one apex, at 5000 m
  c.s = 5100; tick(.5, braking);
  assert.equal(coach.feedback().latest.turn, 1, '100 m past the apex is that turn on any circuit');
  c.s = 5300; tick(31);
  assert.equal(coach.feedback().latest.turn, null, '300 m out is 3% of this lap — a fraction window would have called it Turn 1');
});

test('a repeated tip names the practice goal that drills it, and the review reads as advice', () => {
  const { coach, c, tick, enable, nodes } = fixture(); enable();
  c.s = 100;
  tick(.5, braking); assert.equal(coach.feedback().suggest, null, 'one tip is not a pattern');
  tick(31); assert.equal(coach.feedback().suggest, null);
  tick(31);
  const suggest = coach.feedback().suggest;
  assert.equal(suggest.id, 'trail'); assert.equal(suggest.mode, 'trail');
  assert.equal(suggest.goal, 'Release the brake into a turn');
  assert.equal(suggest.goalLabel, 'TRAIL BRAKING', 'the review names the goal the way the picker does');
  assert.equal(suggest.count, 3);
  coach.paint();
  const summary = nodes.get('pm-coach-summary').textContent;
  assert.match(summary, /3 tips recorded this session/);
  assert.match(summary, /Most at Turn 1 \(3\)/);
  assert.match(summary, /Braking into turns came up 3 times\. The TRAIL BRAKING practice goal drills it\./);
  assert.match(summary, /not a driving score/);
  coach.reset();
  assert.equal(coach.feedback().suggest, null); assert.equal(coach.feedback().turns.length, 0);
});

test('counts rank the most repeated tip first so the panel does not ask the driver to compare numbers', () => {
  const { coach, c, tick, enable } = fixture(); enable();
  c.s = 300;
  tick(.5, braking); tick(31); tick(31);                                  // three trail tips
  tick(10, { ...rear, brakeDemand: 0, throttleDemand: 1, axEstSm: 0 });   // …and one on power, after the 8 s quiet window
  const counts = coach.feedback().counts;
  assert.equal(JSON.stringify(counts.map(r => [r.id, r.count])), '[["trail",3],["power",1]]');
});

test('checkpoint messages name the practice goal, and the pause menu lists attempts and the saved best', () => {
  const { coach, ins, announcements, nodes } = fixture();
  assert.equal(coach.mark(), true); assert.match(announcements.at(-1)[0], /^PRACTICE: FREE PRACTICE — LAPS NOT SAVED$/);
  assert.equal(coach.retry(), true); assert.match(announcements.at(-1)[0], /^TRY AGAIN: FREE PRACTICE$/);
  ins.attempts = () => [{ clean: false, score: 3, reason: 'left the track' }, { clean: true, score: 2.5 }, { clean: true, score: 2.1 }];
  ins.mastery = () => ({ best: 1.9, completed: 4 });
  ins.summary = () => ({ lastDrill: { mode: 'free', clean: false, reason: 'left the track' } });
  coach.paint();
  assert.match(nodes.get('pm-drill-status').textContent, /retry suggested · left the track\. This session: 3 attempts, 2 clean, best 2\.1s\. Saved best: 1\.9s over 4 clean runs\.$/);
  ins.attempts = () => []; ins.mastery = () => null; ins.summary = () => ({ lastDrill: null });
  coach.paint();
  assert.equal(nodes.get('pm-drill-status').textContent, 'Repeat any section at your own pace.');
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
