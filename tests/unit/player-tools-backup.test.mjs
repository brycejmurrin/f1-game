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
  for (const path of ['js/core/mat4.js','js/physics/consts.js','js/garage/setup-tune.js','js/input/controller-profiles.js']) vm.runInContext(fs.readFileSync(ROOT + '/' + path, 'utf8'), ctx, { filename: path });
  const api = vm.runInContext(source + ';SettingsExport', ctx, { filename: 'js/ui/settings-export.js' });
  const tune = vm.runInContext('SetupTune.defaults("mercedes")', ctx);
  return { api, tune: plain(tune), disk, writes, store, G: { gfx: { isMobile: false } }, ctx,
    settings: (driving, display) => api.applySettings({ format: api.FORMAT, settings: { driving, display } }),
    garage: (value) => api.applyGarage({ format: api.GARAGE_FORMAT, garage: { 'setupPresets.mercedes': value } }),
  };
}
const profile = (claimed = false) => ({ v: 1, devices: [{ id: 'Wheel A', axes: { steer: 0, throttle: 2, brake: 3 }, buttons: { pause: [9, null] } }], legacyClaimed: claimed });
const library = (h) => ({ v: 1, items: [{ id: 'wet', name: 'Wet race', trackId: 'monza', at: 1234, tune: h.tune }] });

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

test('import UI retains its existing durable-success reload path', () => {
  assert.match(source, /if \(!r\.applied\)[\s\S]*?reloading = true; b\.disabled = true;[\s\S]*?location\.reload\(\)/);
  assert.ok(!source.includes('Input.setControllerProfiles('), 'no extra live reapply added to a reload-based importer');
});
