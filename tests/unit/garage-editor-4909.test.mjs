// #4909: the Garage animation editor (#garrival) bug hunt — one behaviour test per fixed bug.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { absSrc } from '../helpers/abs-src.mjs';
import { makeDom } from '../helpers/mini-dom.mjs';

const src = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const run = (ctx, f) => vm.runInContext(src(f), ctx, { filename: absSrc(f) });

/* A mini-dom editor with real <select> semantics: options, add(option, before), and a value that reads
 * "" when no option carries it (what the phone showed as a blank picker). */
function editor({ rigs = true } = {}) {
  const dom = makeDom(), doc = dom.document;
  const ctx = vm.createContext({ document: doc, GarageScene: { MOODS: { shipped: {}, goldenhour: {}, rain: {}, night: {}, broadcast: {}, endurance: {} },
    CUES: ['lightsup', 'spotsweep'] } });
  for (const f of ['js/garage/crew-draw.js', 'js/garage/arrival.js']) run(ctx, f);
  if (rigs) run(ctx, 'js/garage/garage-data.js');
  const A = vm.runInContext('GarageArrival', ctx);
  const create = doc.createElement.bind(doc);
  doc.createElement = (tag) => {
    const el = create(tag);
    if (tag === 'select') {
      let v = '';
      Object.defineProperty(el, 'options', { get: () => el.children });
      Object.defineProperty(el, 'value', { get: () => v, set: (x) => { v = el.children.some((o) => o.value === String(x)) ? String(x) : ''; } });
      el.add = (o, before) => el.insertBefore(o, typeof before === 'number' ? el.children[before] : before);
    }
    return el;
  };
  const rows = doc.getElementById('ga-rows'), root = doc.getElementById('garrival');
  root.appendChild(doc.getElementById('garrival-inner')).appendChild(rows);
  const add = (parent, tag, id) => { const e = doc.createElement(tag); if (id) e.id = id; parent.appendChild(e); return e; };
  const row = (id, tag, values) => {
    const r = add(rows, 'div'); r.className = 'set-row'; const el = add(add(r, 'div'), tag, id);
    for (const v of values || []) { const o = add(el, 'option'); o.value = v; }
    if (values) el.value = values[0];
    return el;
  };
  row('ga-enabled', 'input').type = 'checkbox';
  row('ga-speed', 'select', ['0.5', '1', '2']);
  row('ga-angle', 'select', ['cut', 'left', 'right']);
  row('ga-crew-in', 'select', ['current', 'none']); row('ga-crew-out', 'select', ['current', 'none']);
  row('ga-fov', 'input');
  const foot = add(doc.getElementById('garrival-inner'), 'div');
  for (const id of ['ga-preview', 'ga-reset', 'ga-close']) add(foot, 'button', id);
  let saved = null;
  const store = { get: () => saved, set: (_, v) => { saved = v; } };
  const $ = (id) => doc.getElementById(id);
  return { A, $, store, saved: () => saved, setSaved: (v) => { saved = v; } };
}
const change = (el, v) => { if (el.type === 'checkbox') el.checked = v; else el.value = v; el.onchange(); };

test('#4909 bug 2: a value no option offers keeps a picker of its own (PIT OUT 1.6x, a STYLE\'s 4 deg zoom)', () => {
  const h = editor();
  h.A.bindSettings(h.$, h.store);
  h.$('ga-moment-pitOut').onclick();
  assert.equal(h.$('ga-speed').value, '1.6', 'PIT OUT\'s quicker base speed shows, not a blank picker');
  h.$('ga-style-rainready').onclick();
  assert.equal(h.$('ga-zoom').value, '4', 'RAIN READY\'s zoom shows');
  h.$('ga-style-cinema').onclick();
  assert.equal(h.$('ga-zoom').value, '6');
  assert.ok(!h.$('ga-zoom').options.some((o) => o.value === '4'), 'the off-list option goes once nothing needs it');
  h.$('ga-moment-start').onclick();
  assert.equal(h.$('ga-speed').value, '1', 'RACE START reads its own speed');
  assert.equal(h.$('ga-speed').options.filter((o) => o.value === '1.6').length, 0);
});

test('#4909 bug 4: COPY TO ALL MOMENTS copies the look, never a moment\'s on/off switch', () => {
  const h = editor();
  h.A.bindSettings(h.$, h.store);
  h.$('ga-moment-home').onclick();
  change(h.$('ga-enabled'), false);   // RACE END off (PLAY AFTER A RACE folds into it)
  change(h.$('ga-fov'), '62');
  h.$('ga-copy-all').onclick();
  for (const m of ['start', 'pitIn', 'pitOut']) {
    const s = h.A.settingsFor(h.saved(), m);
    assert.equal(s.enabled, true, m + ' stays on');
    assert.equal(s.fov, 62, m + ' takes the look');
  }
  assert.equal(h.A.settingsFor(h.saved(), 'home').enabled, false, 'RACE END stays off');
  // And the other way: an off moment's switch does not spread from an on one.
  h.$('ga-moment-start').onclick();
  h.$('ga-copy-all').onclick();
  assert.equal(h.A.settingsFor(h.saved(), 'home').enabled, false, 'copying from RACE START leaves RACE END off');
});

test('#4909 bug 5: COPY TO ALL MOMENTS and RESET tell the camera options which moment', () => {
  const h = editor(), calls = [];
  h.A.bindSettings(h.$, h.store, { copied: (m) => calls.push('copy:' + m), reset: (m) => calls.push('reset:' + m) });
  h.$('ga-moment-pitIn').onclick();
  h.$('ga-copy-all').onclick();
  h.$('ga-reset').onclick();
  assert.deepEqual(calls, ['copy:pitIn', 'reset:pitIn']);

  const ctx = vm.createContext({});
  for (const f of ['js/core/mat4.js', 'js/data/garage-camera-options.js']) run(ctx, f);
  const O = vm.runInContext('GarageCameraOptions', ctx);
  let saved = null;
  const store = { get: () => saved, set: (_, v) => { saved = v; } };
  const pick = O.SHOT_IDS.find((id) => id !== O.forMoment(null, 'start').shot);
  O.write(store, { moments: { pitIn: { shot: pick, stayInside: false } } });
  O.copyMoment(store, 'pitIn');
  for (const m of O.MOMENT_IDS) assert.deepEqual([O.forMoment(saved, m).shot, O.forMoment(saved, m).stayInside], [pick, false], m);
  O.resetMoment(store, 'pitIn');
  assert.equal(O.forMoment(saved, 'pitIn').own, false, 'RESET hands the moment back to the shared ENTRY pick');
  assert.equal(O.forMoment(saved, 'start').shot, pick, 'the other moments keep theirs');
});

test('#4909 bug 6: RACE END\'s angle map draws the rig\'s home path', () => {
  const h = editor();
  const rig = h.A.RIG_IDS.find((id) => h.A.rigSample(id, 'home', 0.5) && h.A.angleMap(id, null, 'home') !== h.A.angleMap(id, null, 'in'));
  assert.ok(rig, 'some Blender rig has its own home keys');
  h.A.bindSettings(h.$, h.store);
  h.$('ga-moment-home').onclick();
  change(h.$('ga-angle'), rig);
  assert.equal(h.$('ga-angle-map').innerHTML, h.A.angleMap(rig, null, 'home'));
});

test('#4909 bug 7: before the rig samples land the map is labelled as the CUT it draws', () => {
  const h = editor({ rigs: false });
  h.A.bindSettings(h.$, h.store);
  change(h.$('ga-angle'), 'crane');
  assert.equal(h.$('ga-angle').value, 'crane');
  assert.doesNotMatch(h.$('ga-angle-map').getAttribute('aria-label'), /Blender/);
  assert.equal(h.$('ga-angle-map').innerHTML, h.A.angleMap('cut', null, 'out'));
});

test('#4909 bug 3: a moment tab switch while EDIT holds a preview moves the preview to it', () => {
  const ctx = vm.createContext({});
  for (const f of ['js/garage/crew-draw.js', 'js/garage/arrival.js']) run(ctx, f);
  const Arrival = vm.runInContext('GarageArrival', ctx);
  const cam = src('js/garage/setup-camera.js');
  const block = cam.slice(cam.indexOf('// THE ARRIVAL PREVIEW'), cam.indexOf('const arrivalCar'));
  const els = new Map();
  const $ = (id) => { if (!els.has(id)) els.set(id, { hidden: true, setAttribute() {}, focus() {} }); return els.get(id); };
  const G = { setupPreviewOn: false, store: { get: (k, d) => (k === 'garageArrival' ? { moments: { pitOut: { fov: 70 } } } : d) } };
  const c = vm.createContext({ $, G, GarageArrival: Arrival, driveOut: null, endHome() {}, sequenceLook() {}, reducedMotion: () => false,
    Log: { info() {} }, requestAnimationFrame() {}, render() {}, window: { addEventListener() {} } });
  vm.runInContext(block + '\n;globalThis.__h = { startArrivalPreview, previewMoment, previewEdit, get preview() { return preview; } };', c, { filename: absSrc('js/garage/setup-camera.js') });
  const fn = (n) => c.__h[n];
  assert.equal(fn('startArrivalPreview')('start'), true);
  fn('previewMoment')('pitOut');
  assert.equal(fn('preview').moment, 'start', 'a playing (not editing) preview is left alone');
  fn('previewEdit')(true);
  fn('previewMoment')('pitOut');
  const p = fn('preview');
  assert.deepEqual([p.moment, p.dir, p.cfg.fov, p.editing], ['pitOut', 'out', 70, true], 'the held frame now shows PIT OUT\'s own settings');
  assert.ok(p.t <= Arrival.duration(p.cfg, p.dir));
  assert.match(cam, /momentChanged: \(m\) => \{ previewMoment\(m\);/, 'bindSettings\' tab switch reaches it');
});

test('#4909 bug 1: phone landscape keeps the moment tabs on one 44px line and drops the note', () => {
  const css = src('css/tuner.css');
  const block = css.slice(css.indexOf('/* PHONE LANDSCAPE (844x390, #4909)'));
  const media = block.slice(0, block.indexOf('\n}\n') + 3);
  assert.match(media, /@media \(orientation: landscape\) and \(max-height: 420px\)/);
  assert.match(media, /#garrival-inner\.editor-workspace > \.ew-note \{ display: none; \}/);
  assert.match(media, /\[data-editor-sequences\] > button \{ white-space: nowrap;/);
  assert.doesNotMatch(media, /min-height:\s*(?!var\(--ew-tap\))\d/, 'no tap target shrinks below the 44px floor');
});
