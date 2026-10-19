import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { absSrc } from "../helpers/abs-src.mjs";
const root = path.resolve(new URL('../..', import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const copy = (v) => JSON.parse(JSON.stringify(v));
function careerHarness() {
  const disk = new Map(), revisions = new Map();
  const store = { get: (k, d) => disk.has(k) ? copy(disk.get(k)) : d, set(k, v) { disk.set(k, copy(v)); revisions.set(k, (revisions.get(k) || 0) + 1); return true; }, keyRevision: (k) => revisions.get(k) || 0 };
  store.write = (k, v) => ({ ok: store.set(k, v), durable: true });
  const ctx = vm.createContext({ console, Log: { info() {}, warn() {}, debug() {} }, GameStore: { store, CAREER_V: 2, seasonDriverId: (t, i) => t + ':' + i, migrateCareer: (c) => c }, Tracks: { LIST: [{ id: 'a' }], SEASON: [{ id: 'a' }] } });
  ctx.window = ctx;
  for (const f of ['js/core/mat4.js', 'js/core/hash32.js', 'js/physics/consts.js', 'js/data/teams.js', 'js/data/driver-ratings.js', 'js/car/parts.js', 'js/career/team-identity.js', 'js/career/regulations.js', 'js/career/career.js']) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
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
test('early identity uses the existing pre-catalog budget and never depends on optional UI globals', () => {
  const ctx = vm.createContext({});
  for (const f of ['js/data/teams.js', 'js/career/team-identity.js']) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const T = vm.runInContext('Teams', ctx), I = vm.runInContext('CareerTeamIdentity', ctx);
  const row = { id: 'mine', c1: [2, -1, 0.5, 99], c2: [0, 1, 0], finShape: 'future-fin' };
  for (let i = 0; i < 120; i++) row['future' + i] = 'x';
  const early = T.cleanLivery(row);
  assert.deepEqual(copy(early.c1), [1, 0, 0.5]);
  assert.equal(early.finShape, 'future-fin', 'without tables, bounded safe strings remain extension data');
  assert.equal(early.future94, 'x');
  assert.equal(early.future95, undefined, 'the existing fallback is 64 + 32 accepted optional entries');
  const many = Array.from({ length: 24 }, (_, i) => ({ id: 'paint' + i, c1: [0, 0, 0], c2: [1, 1, 1], finish: 'satin' }));
  const beforeUI = copy(I.value('livery.custom.custom', many));
  assert.equal(beforeUI.length, 24, 'the former 20-row fallback no longer clips early identities');
  assert.equal(beforeUI[23].finish, 'satin', 'string pills survive before UI loading');
  ctx.SettingsExport = { garageValue() { throw new Error('identity must not call the UI'); } };
  assert.deepEqual(copy(I.value('livery.custom.custom', many)), beforeUI);
  assert.equal(I.value('customLogo', null), null);
  assert.equal(I.value('livery.custom', 'x'.repeat(65)), undefined);
  // Node22/24 vm caches an earlier unresolved lexical global after warming.
  // Publish this late catalog as var, as the real-store fixture already does,
  // so the same-context early→late regression tests policy rather than that VM
  // artifact. The next startup test also covers untransformed const scripts.
  vm.runInContext(read('js/car/liveries.js').replace(/^const\b/gm, 'var'), ctx, { filename: absSrc('js/car/liveries.js') });
  const fields = vm.runInContext('Liveries.FIELDS', ctx);
  const late = T.cleanLivery(row);
  assert.equal(Object.keys(late).length, 3 + fields.length + 32, 'budget is read at call time, never frozen during early evaluation');
  ctx.Car3D = { FIN_SHAPE_IDS: ['none'] };
  assert.equal(T.cleanLivery(row).finShape, undefined, 'table availability deliberately validates known enum fields');
  assert.equal(I.value('customTeam', null), null);
  assert.equal(I.value('not-an-identity-key', null), undefined);
});

test('page startup evaluates career before the catalog but loads and persists identity after it', () => {
  const { C, ctx, store, disk } = careerHarness();
  assert.equal(C.data(), null, 'evaluating Career does not load/adopt an identity');
  assert.equal(disk.size, 0, 'early module evaluation cannot persist a clipped representation');
  // The page calls Career.load from game.js, after the earlier catalog script.
  const manifest = read('tools/manifest.cjs');
  assert.ok(manifest.indexOf('"js/car/liveries.js"') < manifest.indexOf('"js/game.js"'));
  assert.match(read('js/game.js'), /Career\.load\(\);\s*\/\/ resolve \+ migrate the career save once at boot/);
  vm.runInContext(read('js/car/liveries.js'), ctx, { filename: absSrc('js/car/liveries.js') });
  const fields = vm.runInContext('Liveries.FIELDS', ctx);
  const row = { id: 'mine', c1: [0, 0, 0], c2: [1, 1, 1] };
  for (let i = 0; i < 32; i++) row['future' + i] = 'x';
  for (const field of fields) row[field] = [0.2, 0.4, 0.6];
  store.set('livery.custom.custom', [row]);
  C.start({ flavour: 'myteam', slot: 0, seed: 7 }); C.engage(true);
  C.load(); C.engage(true);
  assert.deepEqual(copy(C.identityValue('livery.custom.custom', [])), [row]);
  assert.deepEqual(disk.get('career.myteam.0').myTeamIdentity['livery.custom.custom'], [row], 'the first adoption and persisted reload both use the full catalog budget');
  const identity = vm.runInContext('CareerTeamIdentity', ctx);
  const cleaned = identity.value('livery.custom.custom', [row]);
  cleaned[0].c1[0] = 1;
  assert.equal(row.c1[0], 0, 'identity rebuilds arrays instead of aliasing import data');
});
