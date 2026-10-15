// Player-tool settings/garage backups exercise the real source and normalizers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(ROOT, 'js/ui/settings-export.js'), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));
function boot() {
  const disk = new Map(), writes = [], full = (k) => k.startsWith('apex26.') ? k : 'apex26.' + k;
  const store = {
    get: (k, fallback) => disk.has(full(k)) ? JSON.parse(disk.get(full(k))) : fallback,
    set(k, value) { disk.set(full(k), JSON.stringify(value)); writes.push(k); return true; },
    raw: (k) => disk.get(full(k)) ?? null,
    rawSet(k, value) { disk.set(full(k), String(value)); writes.push(k); return true; },
    rawDel(k) { disk.delete(full(k)); return true; },
  };
  const ctx = vm.createContext({ console, JSON, Math, Object, Array, Number, Map, Set, Date, String, isFinite,
    GameStore: { store }, GameAudio: { tuneDefaults: () => ({}), layerDefaults: () => ({}) },
    Log: { info() {}, warn() {}, enabled: () => false },
    Input: { keysAreDefault: () => true, padsAreDefault: () => true, setControllerProfiles() { throw Error('no immediate reapply: UI reload contract'); } },
    navigator: { userAgent: 'player-tools-backup-vm' }, GfxQuality: { defaultId: () => 'high' },
    localStorage: { get length() { return disk.size; }, key: (i) => Array.from(disk.keys())[i], getItem: (k) => disk.get(k) ?? null },
  });
  ctx.window = ctx;
  for (const path of ['js/core/mat4.js','js/physics/consts.js','js/garage/setup-tune.js','js/garage/setup-presets.js','js/input/controller-profiles.js']) vm.runInContext(fs.readFileSync(ROOT + '/' + path, 'utf8'), ctx, { filename: path });
  const api = vm.runInContext(source + ';SettingsExport', ctx, { filename: 'js/ui/settings-export.js' });
  const tune = vm.runInContext('SetupTune.defaults("mercedes")', ctx);
  return { api, tune: plain(tune), disk, writes, store, G: { gfx: { isMobile: false } }, ctx,
    settings: (driving, display) => api.applySettings({ format: api.FORMAT, settings: { driving, display } }),
    garage: (value) => api.applyGarage({ format: api.GARAGE_FORMAT, garage: { 'setupPresets.mercedes': value } }),
  };
}
const profile = (claimed = false) => ({ v: 1, devices: [{ id: 'Wheel A', axes: { steer: 0, throttle: 2, brake: 3 }, buttons: { pause: [9, null] } }], legacyClaimed: claimed });
const library = (h) => ({ v: 1, items: [{ id: 'wet', name: 'Wet race', trackId: 'monza', at: 1234, tune: h.tune }] });

test('new settings export canonical defaults and strict authored lanes', () => {
  const h = boot(), all = plain(h.api.collect('all', h.G)), changes = plain(h.api.collect('changes', h.G));
  assert.equal(all.settings.driving.conditionCues, false);
  assert.deepEqual(all.settings.driving.padProfiles, { v: 1, devices: [], legacyClaimed: false });
  assert.equal(all.settings.display.xrInput, 'controllers');
  for (const key of ['driving.conditionCues','driving.padProfiles','display.xrInput']) assert.ok(!changes.changed.includes(key));
  const result = h.settings({ conditionCues: true, padProfiles: profile() }, { xrInput: 'existing' });
  assert.equal(result.applied, 3); assert.equal(result.skipped, 0);
  assert.equal(h.store.get('conditionCues'), true);
  assert.equal(h.store.raw('xrInput'), 'existing');
  assert.deepEqual(plain(h.store.get('padProfiles')), profile());
  const bad = h.settings({ conditionCues: 'true' }, { xrInput: 'wheel' });
  assert.equal(bad.applied, 0); assert.equal(bad.skipped, 2);
  assert.equal(h.store.get('conditionCues'), true); assert.equal(h.store.raw('xrInput'), 'existing');
});

test('ALL and CHANGED round-trip physical profiles without immediate input reapplication', () => {
  for (const mode of ['all','changes']) for (const claimed of [true, false]) {
    const a = boot(), b = boot();
    a.store.set('padProfiles', profile(claimed)); a.store.set('conditionCues', true); a.store.rawSet('xrInput', 'existing');
    const file = plain(a.api.collect(mode, a.G));
    assert.equal(b.api.applySettings(file, b.G).failed, 0);
    assert.deepEqual(plain(b.store.get('padProfiles')), profile(claimed), mode + ' preserves version and explicit legacy state');
    assert.equal(b.store.get('conditionCues'), true); assert.equal(b.store.raw('xrInput'), 'existing');
  }
  const h = boot();
  h.store.set('padProfiles', { v: 1, devices: [], legacyClaimed: true });
  const changed = plain(h.api.collect('changes', h.G));
  assert.deepEqual(changed.settings.driving.padProfiles, { legacyClaimed: true });
  const fresh = boot(); fresh.api.applySettings(changed, fresh.G);
  assert.deepEqual(plain(fresh.store.get('padProfiles')), { v: 1, devices: [], legacyClaimed: true });
});

test('profile imports reject unsupported or malformed containers and enforce 16-device cap', () => {
  const h = boot(); h.store.set('padProfiles', profile());
  const invalid = [null, [], {}, { v: 2, devices: [] }, { v: 1 }, { devices: 'not array' }, { devices: [], legacyClaimed: 'false' },
    { v: 1, devices: Array.from({ length: 17 }, (_, i) => ({ id: 'pad' + i })) },
    { v: 1, devices: [{ id: '' }] }, { v: 1, devices: [{ id: 'same' }, { id: 'same' }] }];
  for (const value of invalid) {
    const before = h.disk.get('apex26.padProfiles'), result = h.settings({ padProfiles: value });
    assert.equal(result.applied, 0); assert.equal(result.skipped, 1); assert.equal(h.disk.get('apex26.padProfiles'), before);
  }
  const capped = { v: 1, devices: Array.from({ length: 16 }, (_, i) => ({ id: 'pad' + i, axes: {}, buttons: {} })), legacyClaimed: false };
  assert.equal(h.settings({ padProfiles: capped }).applied, 1);
  assert.equal(h.store.get('padProfiles').devices.length, 16);
});

test('profile normalizer uses real bounded clean policy for axes and bindings', () => {
  const h = boot();
  h.settings({ padProfiles: { devices: [{ id: 'X'.repeat(150), axes: { steer: 99, throttle: 2, poison: 1 }, buttons: { pause: [9, 99, 5], '!': [3] } }] } });
  const map = plain(h.store.get('padProfiles'));
  assert.equal(map.devices[0].id.length, 120);
  assert.deepEqual(map.devices[0].axes, { throttle: 2 });
  assert.deepEqual(map.devices[0].buttons, { pause: [9, null] });
});

test('named setups export and import in garage only, retaining mechanical values', () => {
  const a = boot(), b = boot(), value = library(a);
  assert.equal(a.api.isGarageKey('setupPresets.mercedes'), true);
  assert.equal(a.api.isGarageKey('setupPresets.'), false);
  assert.equal(a.garage(value).applied, 1);
  const file = plain(a.api.collectGarage());
  assert.deepEqual(file.garage['setupPresets.mercedes'], value);
  assert.equal(b.api.applyGarage(file).applied, 1);
  assert.deepEqual(plain(b.store.get('setupPresets.mercedes')), value);
  assert.ok(!JSON.stringify(a.api.collect('all', a.G)).includes('setupPresets.mercedes'));
  const twelve = { v: 1, items: Array.from({ length: 12 }, (_, i) => ({ ...value.items[0], id: 'p' + i })) };
  assert.equal(a.garage(twelve).applied, 1); assert.equal(a.store.get('setupPresets.mercedes').items.length, 12);
  assert.equal(a.garage({ v: 1, items: [] }).applied, 1);
});

test('strict preset shape rejects whole malformed or unsupported library without replacing stored data', () => {
  const h = boot(), good = library(h); h.garage(good);
  const row = good.items[0];
  const badRows = [null, { ...row, id: 'bad id' }, { ...row, id: undefined }, { ...row, name: '' }, { ...row, name: 'x'.repeat(33) },
    { ...row, trackId: 4 }, { ...row, trackId: undefined }, { ...row, trackId: 'x'.repeat(129) }, { ...row, at: '123' }, { ...row, at: Infinity },
    { ...row, tune: { ...row.tune, arbF: 100 } }, { ...row, tune: { ...row.tune, arbF: '6' } }, { ...row, tune: { ...row.tune, future: 1 } }, { ...row, future: true }];
  const invalid = [null, [], {}, { v: 2, items: [] }, { v: 1, items: {} }, { ...good, future: true },
    { v: 1, items: Array.from({ length: 13 }, (_, i) => ({ ...row, id: 'p' + i })) },
    { v: 1, items: [row, row] }, ...badRows.map((bad) => ({ v: 1, items: [bad] }))];
  for (const value of invalid) {
    const before = h.disk.get('apex26.setupPresets.mercedes'), result = h.garage(value);
    assert.equal(result.applied, 0); assert.equal(result.skipped, 1); assert.equal(h.disk.get('apex26.setupPresets.mercedes'), before);
  }
});

test('import UI retains its existing durable-success reload path', () => {
  assert.match(source, /if \(!r\.applied\)[\s\S]*?reloading = true; b\.disabled = true;[\s\S]*?location\.reload\(\)/);
  assert.ok(!source.includes('Input.setControllerProfiles('), 'no extra live reapply added to a reload-based importer');
});
