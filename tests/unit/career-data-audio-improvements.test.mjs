import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root = path.resolve(new URL('../..', import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const copy = (v) => JSON.parse(JSON.stringify(v));
function careerHarness() {
  const disk = new Map(), revisions = new Map();
  const store = { get: (k, d) => disk.has(k) ? copy(disk.get(k)) : d, set(k, v) { disk.set(k, copy(v)); revisions.set(k, (revisions.get(k) || 0) + 1); return true; }, keyRevision: (k) => revisions.get(k) || 0 };
  store.write = (k, v) => ({ ok: store.set(k, v), durable: true });
  const ctx = vm.createContext({ console, Log: { info() {}, warn() {}, debug() {} }, GameStore: { store, CAREER_V: 2, seasonDriverId: (t, i) => t + ':' + i, migrateCareer: (c) => c }, Tracks: { LIST: [{ id: 'a' }], SEASON: [{ id: 'a' }] } });
  ctx.window = ctx;
  for (const f of ['js/core/mat4.js', 'js/core/hash32.js', 'js/physics/consts.js', 'js/data/teams.js', 'js/data/driver-ratings.js', 'js/car/parts.js', 'js/career/team-identity.js', 'js/career/regulations.js', 'js/career/career.js']) vm.runInContext(read(f), ctx, { filename: f });
  vm.runInContext('Teams.LIST.push(Teams.sanitizeCustom(Teams.DEFAULT_CUSTOM))', ctx);
  return { C: vm.runInContext('Career', ctx), ctx, store, disk, Teams: vm.runInContext('Teams', ctx) };
}
test('two MY TEAM identities persist independently and never overwrite GP appearance', () => {
  const { C, store } = careerHarness();
  const team = (name) => ({ id: 'custom', name, short: name.slice(0, 3), color: [1, 0, 0], color2: [0, 0, 1], drivers: [{ name: 'You', code: 'YOU', num: 44 }] });
  store.set('customTeam', team('GP')); C.start({ flavour: 'myteam', slot: 0, seed: 7 }); C.engage(true);
  assert.equal(C.data().team, 'custom');
  assert.equal(C.setIdentityValue('customTeam', team('ALPHA')), true);
  C.start({ flavour: 'myteam', slot: 1, seed: 9 }); C.engage(true); C.setIdentityValue('customTeam', team('BETA'));
  C.useSlot('myteam', 0); assert.equal(C.identityValue('customTeam', null).name, 'ALPHA');
  store.set('customTeam', team('FOREIGN GP')); assert.equal(C.identityValue('customTeam', null).name, 'ALPHA');
  C.useSlot('myteam', 1); assert.equal(C.identityValue('customTeam', null).name, 'BETA');
  C.load(); C.engage(true); assert.equal(C.identityValue('customTeam', null).name, 'BETA');
  C.engage(false); assert.equal(C.identityValue('customTeam', store.get('customTeam')).name, 'FOREIGN GP');
  assert.equal(C.setIdentityValue('customLogo', 'javascript:bad'), false);
});
test('contract comparison is pure and final signing agrees on seat, deal, works parts and cap', () => {
  const { C, ctx } = careerHarness(); C.start({ teamId: 'haas', seed: 7 }); C.engage(true);
  const c = C.data(); c.offers = [{ teamId: 'mclaren', years: 2, salary: 125, goal: { type: 'beatMate', value: 0 } }]; c.owned.push('extra_research');
  const before = JSON.stringify(c), preview = C.offerPreview(0);
  assert.equal(JSON.stringify(c), before, 'preview/cancel changes no career data');
  assert.ok(preview.lostResearch.includes('extra_research'));
  assert.deepEqual(copy(preview.fitted), copy(vm.runInContext("Parts.getFactorySetup(Teams.LIST.find(t=>t.id==='mclaren'))", ctx)), 'preview matches actual unrestricted works build');
  const deal = C.acceptOffer(0, preview); assert.deepEqual(copy(deal), copy(preview.deal));
  assert.equal(C.data().seat, preview.seat); assert.deepEqual(copy(C.data().fitted), copy(preview.fitted));
  assert.equal(C.budget(), preview.cap);
  const mate = C.driverOverride('mclaren', preview.seat === 0 ? 1 : 0);
  assert.equal(mate && mate.code || preview.teammate.code, preview.teammate.code);
});
test('a reviewed contract cannot sign after an offer or career-state change', () => {
  const { C } = careerHarness(); C.start({ teamId: 'haas', seed: 4 }); C.engage(true);
  C.data().offers = [{ teamId: 'haas', years: 1, salary: 80, goal: { type: 'champPos', value: 20 } }];
  const preview = C.offerPreview(0); C.data().offers[0].salary = 81;
  const before = JSON.stringify(C.data()); assert.equal(C.acceptOffer(0, preview), null); assert.equal(JSON.stringify(C.data()), before);
});
test('winter report records actual applied driver/team deltas and reload never reapplies them', () => {
  const { C } = careerHarness(); C.start({ teamId: 'haas', seed: 71 }); C.engage(true);
  C.data().results = [{ r: 0, p: 1, pts: 25, craft: 1 }]; C.data().season.round = 1;
  const beforeDev = copy(C.data().dev); C.rollover();
  const report = copy(C.data().winterReport), developed = copy(C.data().dev);
  assert.equal(report.year, 2026); assert.equal(report.drivers.filter((d) => d.player).length, 1);
  const mine = report.drivers.find((d) => d.player); assert.equal(mine.axes.craft.after - mine.axes.craft.before, mine.axes.craft.delta);
  assert.equal(mine.axes.craft.delta, 3, 'clean season craft applies the bounded +3 rating development');
  assert.notDeepEqual(developed, beforeDev);
  C.load(); assert.deepEqual(copy(C.data().winterReport), report); assert.deepEqual(copy(C.data().dev), developed);
});
test('stale primary slot revision prevents signing or repainting before any career mutation', () => {
  const { C, store } = careerHarness(); C.start({ teamId: 'haas', seed: 7 }); C.engage(true);
  C.data().offers = [{ teamId: 'mclaren', years: 1, salary: 99, goal: { type: 'beatMate', value: 0 } }]; const p = C.offerPreview(0);
  store.set('career.driver.0', { anotherTab: true }); const before = JSON.stringify(C.data());
  assert.equal(C.acceptOffer(0, p), null); assert.equal(JSON.stringify(C.data()), before);
});
test('legacy team identity is adopted once, independently per slot', () => {
  const { C, store } = careerHarness(); C.start({ flavour: 'myteam', seed: 3 });
  const old = copy(C.data()); delete old.myTeamIdentity; store.set('career.myteam.0', old);
  store.set('customTeam', { id: 'custom', name: 'LEGACY', drivers: [{ name: 'You', code: 'YOU', num: 1 }] }); C.load(); C.engage(true);
  assert.equal(C.identityValue('customTeam', null).name, 'LEGACY');
  store.set('customTeam', { id: 'custom', name: 'GP CHANGED', drivers: [{ name: 'You', code: 'YOU', num: 1 }] }); C.load(); C.engage(true);
  assert.equal(C.identityValue('customTeam', null).name, 'LEGACY');
});
test('contract preview preserves authored works research across era bans without changing the live legality predicate', () => {
  const { C, ctx } = careerHarness(); C.start({ teamId: 'haas', seed: 4 }); C.engage(true);
  const c = C.data(); c.year = 2030; C.applyRegs(); c.offers = [{ teamId: 'mclaren', years: 1, salary: 80, goal: { type: 'beatMate', value: 0 } }];
  const legal = vm.runInContext('Parts.legality()', ctx), key = vm.runInContext('Parts.legalityKey()', ctx);
  const p = C.offerPreview(0); assert.equal(vm.runInContext('Parts.legality()', ctx), legal); assert.equal(vm.runInContext('Parts.legalityKey()', ctx), key);
  ctx.preview = p; const rawEngine = vm.runInContext('Parts.FACTORY_PRESETS.mclaren.engine', ctx); assert.equal(p.fitted.engine, rawEngine, 'banned works engine is retained as researched ownership');
  C.acceptOffer(0, p); ctx.fitted = C.data().fitted; assert.deepEqual(copy(p.resolvedFitted), copy(vm.runInContext("Parts.resolveSetup(fitted, Teams.LIST.find(t=>t.id==='mclaren')).setup", ctx))); assert.equal(C.data().fitted.engine, rawEngine); assert.equal(vm.runInContext('Parts.legality()', ctx), legal);
});