import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { makeDom } from '../helpers/mini-dom.mjs';
import { seedStore } from '../helpers/seed-store.mjs';
import { absSrc } from "../helpers/abs-src.mjs";
import { GAME_REL } from "../helpers/game-source.mjs";
const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const sheet = read('js/garage/setup-sheet.js');
const plain = v => JSON.parse(JSON.stringify(v));

function dirtyExitFixture(from) {
  const dom = makeDom(), document = dom.document, saved = new Map(), observers = [];
  const create = document.createElement, byId = document.getElementById, prepared = new WeakSet();
  const prepare = el => {
    if (prepared.has(el)) return el;
    prepared.add(el);
    let text = el.textContent;
    const append = el.appendChild, insert = el.insertBefore;
    el.appendChild = child => { if (child.parentNode) child.remove(); return append(child); };
    el.insertBefore = (child, before) => { if (child.parentNode) child.remove(); return insert(child, before); };
    Object.defineProperty(el, 'nextSibling', { get: () => el.parentNode?.children[el.parentNode.children.indexOf(el) + 1] || null });
    Object.defineProperty(el, 'textContent', { get: () => text, set(value) { text = String(value); for (const child of [...el.children]) el.removeChild(child); } });
    return el;
  };
  document.createElement = tag => prepare(create(tag));
  document.getElementById = id => prepare(byId(id));
  document.createTextNode = text => { const el = document.createElement('span'); el.textContent = text; return el; };
  const store = { get: (k, d) => k === 'garageTab' ? 'livery' : saved.get(k) ?? d, set: (k, v) => saved.set(k, v) };
  const context = vm.createContext({ document, Log: { info() {}, warn() {} }, setTimeout: () => 0, clearTimeout() {},
    MutationObserver: class { constructor(cb) { this.cb = cb; } observe(el) { observers.push({ el, cb: this.cb }); } },
    GameStore: { store }, addEventListener() {}, removeEventListener() {}, GameAudio: {}, ScrollFade: { refresh() {} },
    Car3D: { appearanceParts: p => p, PART_STYLE_FIELDS: { aeroShape: 'aero', floorShape: 'floor' }, FINISH_SURFACE: {} },
    LiveryTex: { NUM_FONT_IDS: ['default'], SPONSOR_PACK_IDS: ['default'], SPINE_LOGO_IDS: ['stripe', 'contours'], FILL_SURFACES: [] },
  });
  context.window = context;
  const run = path => vm.runInContext(read(path), context, { filename: absSrc(path) });
  for (const path of ['js/core/mat4.js', 'js/physics/consts.js', 'js/car/parts.js', 'js/data/teams.js',
    'js/garage/experience.js', 'js/garage/setup-tune.js', 'js/garage/setup-experiments.js', 'js/car/livery-design.js', 'js/garage/livery-design-editor.js']) run(path);
  // Production handlers sliced from js/game.js (GAME_REL keeps the source-pin ratchet's count).
  const game = read(GAME_REL);
  const between = (start, end) => {
    const a = game.indexOf(start), b = game.indexOf(end, a);
    assert.ok(a >= 0 && b > a, 'production handler markers exist');
    vm.runInContext(game.slice(a, b), context, { filename: absSrc(GAME_REL) });
  };
  between('function armConfirm(', '\n// Every menu layer, gone.');
  const G = { $: id => dom.byId(id), els: { select: dom.byId('select'), overlay: dom.byId('overlay') }, store,
    cssCol: () => '#fff', arrToHex: rgb => '#' + rgb.map(n => Math.round(n * 255).toString(16).padStart(2, '0')).join(''),
    hexToArr: hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255),
    getTeamParts: () => ({}), saveTeamParts() {}, getLiveryId: () => 'default', saveLiveryId() {},
    getCustomLiveries: () => [], setCustomLiveries() {}, getLiveries: () => [], invalidateDecalTextures() {},
    teamIdx: 1, driverIdx: 0, soundOn: false, careerOwned: () => false, unlimitedBudget: false, peerSeats: () => [],
    teamSwatch: () => document.createElement('span'), setTeamPicker() {}, openCustomize() {}, livDraftOverride: null, setupCam: { meshKey: '' },
    armConfirm: context.armConfirm, setupPreviewOn: true,
  };
  run('js/garage/setup-sheet.js'); context.G = G;
  const ui = vm.runInContext('SetupUI.create(G)', context);
  const routes = [];
  Object.assign(context, { $: G.$, setupCam: { cancelArrival() {}, skipPitOut: () => false, startPitOut: (done) => done() }, garageReturn: from, soundOn: false,
    loadingScreen: { phase: () => '', busy() {}, stop() {} }, setupPreviewOn: true, recomputePlayerMods() {},
    buildSelect() {}, els: G.els, netLobby: { roomChanged: () => routes.push('vsfriend') },
    careerUi: { openHub: () => routes.push('career') }, raceSettings: { openRaceSettings: () => routes.push('select') },
    closePitWork() { context.leaveGarage(); routes.push('pit'); },
  });
  between('function leaveGarage()', '$("cs-unlimited").onclick =');
  const label = from === 'select' ? 'RACE SETUP' : from === 'pit' ? 'RETURN TO RACE' : from === 'career' ? 'RETURN TO CAREER' : from === 'vsfriend' ? 'RETURN TO LOBBY' : 'CLOSE GARAGE';
  dom.byId('cs-back').textContent = 'BACK'; dom.byId('cs-done').textContent = label;
  ui.buildSetup();
  const createDraft = (dirty = true) => {
    dom.byId('cs-options').querySelector('.cs-liv-create').onclick();
    if (dirty) { const name = dom.byId('cs-options').querySelector('.cs-liv-ed-name'); name.value = 'Unsaved test'; name.oninput(); }
  };
  // mini-dom does not model capture-phase stopImmediatePropagation; dispatch
  // those real registered guards before the real onclick navigation handler.
  const click = id => {
    const button = dom.byId(id); let stopped = false;
    for (const fn of button._listeners.get('click') || []) { fn({ stopImmediatePropagation() { stopped = true; } }); if (stopped) break; }
    if (!stopped) button.onclick();
    for (const o of observers) if (o.el === dom.byId('carsetup')) o.cb();
  };
  return { dom, G, ui, createDraft, click, routes, label };
}

test('all visible garage exit labels and BACK preserve edited drafts until the confirming tap', () => {
  for (const from of ['menu', 'career', 'vsfriend', 'pit', 'select']) for (const id of ['cs-done', 'cs-back']) {
    const h = dirtyExitFixture(from); h.createDraft();
    const draft = h.G.livDraftOverride;
    assert.ok(draft);
    h.click(id);
    assert.equal(h.dom.byId('carsetup').hidden, false, from + '/' + id);
    assert.equal(h.G.livDraftOverride, draft, 'first tap retains the preview and editor');
    assert.equal(h.dom.byId(id).textContent, 'DISCARD EDITS?');
    assert.equal(h.routes.length, 0);
    h.click(id);
    assert.equal(h.dom.byId('carsetup').hidden, true);
    assert.equal(h.G.livDraftOverride, null, 'confirmed close discards the draft preview');
    assert.equal(h.dom.byId(id).textContent, id === 'cs-back' ? 'BACK' : h.label);
    if (from !== 'menu' && !(from === 'select' && id === 'cs-back')) assert.deepEqual(h.routes, [from]);
  }
});

test('an unedited garage draft exits in one tap and an old confirmation cannot authorize a newer draft', () => {
  const clean = dirtyExitFixture('menu'); clean.createDraft(false); clean.click('cs-done');
  assert.equal(clean.dom.byId('carsetup').hidden, true);
  const h = dirtyExitFixture('menu'); h.createDraft(); h.click('cs-done');
  const cancel = h.dom.byId('cs-options').querySelector('.cs-liv-ed-cancel');
  cancel.onclick(); cancel.onclick(); // cancel the original edited draft
  h.createDraft(); h.click('cs-done');
  assert.equal(h.dom.byId('carsetup').hidden, false, 'a previous draft armed the footer, not this draft');
  assert.ok(h.G.livDraftOverride);
  h.click('cs-done'); assert.equal(h.dom.byId('carsetup').hidden, true);
});

function tuneFixture() {
  const dom = makeDom(), saved = new Map(), timers = new Map(), writes = { n: 0 };
  let timerId = 0;
  const context = vm.createContext({ document: dom.document, GameStore: { store: {
    get: (k, d) => saved.get(k) ?? d, set: (k, v) => { writes.n++; return v === undefined ? saved.delete(k) : saved.set(k, v); },
  } }, setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id) => { timers.delete(id); }, PhysicsConsts: { BB_REF: .56, LAT_MAX: 20 }, csVisitTunes: new Map(), csTuneExperiments: new Map(),
    $: id => dom.byId(id), csLabel: text => { const n = dom.document.createElement('h3'); n.textContent = text; return n; },
    renderStatBars() {}, csTabId: x => x, getTeamParts: () => ({}), GameAudio: {},
    Parts: { RH_GAIN: .06, aeroLoad: (_p, _t, tune) => Math.min(1, Math.max(0, 1 + .06 * (tune?.rake || 0))) }, G: { soundOn: false, $: id => dom.byId(id), getTeamParts: () => ({}) },
  });
  vm.runInContext(read('js/garage/setup-tune.js') + '; globalThis.S = SetupTune;', context, { filename: absSrc("js/garage/setup-tune.js") });
  vm.runInContext(read("js/garage/setup-experiments.js") + ";globalThis.experiments = SetupExperiments.create(G, () => {});", context, { filename: absSrc("js/garage/setup-experiments.js") });
  const team = { id: 'haas', short: 'HAA' }, container = dom.byId('fixture');
  const build = () => { container.replaceChildren(); context.experiments.build(container, team); };
  const button = text => container.querySelectorAll('button').find(b => b.textContent === text);
  const input = k => container.querySelectorAll('input').find(n => n.dataset.csTune === k);
  const runTimers = () => { const due = [...timers.values()]; timers.clear(); for (const fn of due) fn(); };
  return { context, S: context.S, team, build, button, input, container, writes, timers, runTimers };
}
test('a tune slider drag writes the store once: inputs debounce, change commits the final value (perf hunt 9)', () => {
  const f = tuneFixture(), { S, team } = f; f.build();
  const inp = f.input('rideR'), w0 = f.writes.n;
  for (let i = 0; i < 30; i++) { inp.value = 50 + i; inp.oninput(); }
  assert.equal(f.writes.n - w0, 0, 'no store write while the thumb moves');
  inp.onchange();
  assert.ok(f.writes.n - w0 <= 1, `30 inputs + 1 change wrote ${f.writes.n - w0} times`);
  assert.equal(S.get(team.id).rideR, 79, 'the stored value is the final slider value');
  f.runTimers(); assert.equal(f.writes.n - w0, 1, 'no late write after the change');
  inp.value = 62; inp.oninput(); f.runTimers();
  assert.equal(S.get(team.id).rideR, 62, 'a drag with no change event still commits after the debounce');
});
test('visit restore survives tune rebuilds, restores all fields and remains team scoped', () => {
  const f = tuneFixture(), { S, team } = f;
  S.set(team.id, { arbF: 9, arbR: 8, rideF: 30, rideR: 70, brakeBias: 59 });
  const initial = plain(S.get(team.id)); f.build();
  assert.equal(f.button('RESTORE PREVIOUS SETUP').disabled, true);
  f.input('arbF').value = 4; f.input('arbF').oninput();
  f.build(); assert.equal(f.button('RESTORE PREVIOUS SETUP').disabled, false);
  f.button('RESTORE PREVIOUS SETUP').onclick(); assert.deepEqual(plain(S.get(team.id)), initial);
  S.set('ferrari', { arbF: 2 }); assert.equal(S.get('ferrari').arbF, 2);
  f.button('RESET TO WORKS').onclick(); assert.notDeepEqual(plain(S.get(team.id)), initial);
  f.button('RESTORE PREVIOUS SETUP').onclick(); assert.deepEqual(plain(S.get(team.id)), initial);
  team.id = 'ferrari'; f.build(); const ferrariBefore = plain(S.get(team.id));
  f.input('rideR').value = 75; f.input('rideR').oninput(); f.button('RESTORE PREVIOUS SETUP').onclick();
  assert.deepEqual(plain(S.get(team.id)), ferrariBefore); assert.deepEqual(plain(S.get('haas')), initial);
  S.set(team.id, { rideR: 71 }); f.context.experiments.visit(team); f.build();
  f.input('rideR').value = 60; f.input('rideR').oninput(); f.button('RESTORE PREVIOUS SETUP').onclick();
  assert.equal(S.get(team.id).rideR, 71, 'fresh visit captures current setup');
});
test('coach applies a bounded atomic pair, undoes exact snapshot, and invalidates on manual edit', () => {
  const f = tuneFixture(), { S, team } = f; f.build(); const before = plain(S.get(team.id));
  f.button('Poor exit traction').onclick(); f.button('APPLY EXPERIMENT').onclick();
  assert.equal(S.get(team.id).arbF, before.arbF - 1); assert.equal(S.get(team.id).arbR, before.arbR - 1);
  assert.equal(S.balance(team.id), 0); assert.ok(S.mods(team.id).accel > 1); assert.ok(S.mods(team.id).cornering < 1);
  f.build(); f.button('UNDO EXPERIMENT').onclick(); assert.deepEqual(plain(S.get(team.id)), before);
  f.button('Unstable braking entry').onclick(); f.button('APPLY EXPERIMENT').onclick();
  assert.equal(S.get(team.id).brakeBias, before.brakeBias + .5);
  f.input('rideF').value = 31; f.input('rideF').oninput(); assert.equal(f.button('UNDO EXPERIMENT').disabled, true);
  assert.equal(S.experiment('traction', { ...before, arbF: 1 }), null);
  assert.equal(S.experiment('entry', { ...before, brakeBias: 62 }), null);
  assert.equal(S.experiment('wide', { ...before, arbF: 1 }), null);
  const front = S.experiment('wide', before); S.set(team.id, front); assert.ok(S.balance(team.id) < 0);
});

test('ARB split balance scales ~0.025 per click', () => {
  const f = tuneFixture(), { S, team } = f;
  const d = S.defaults(team.id);
  S.set(team.id, { arbF: d.arbF + 1, arbR: d.arbR });
  assert.equal(+S.balance(team.id).toFixed(3), 0.025, 'one front ARB click is +0.025 balance');
  S.set(team.id, { arbF: d.arbF + 2, arbR: d.arbR - 1 });
  assert.equal(+S.balance(team.id).toFixed(3), 0.075, 'three clicks of split land at 0.075');
});
test('aero bench reports saturation and no Corner Mode standing gain', () => {
  const f = tuneFixture(); f.S.set(f.team.id, { rideR: 80 }); f.build();
  const text = () => f.container.querySelectorAll('p').map(n => n.textContent).join(' ');
  assert.match(text(), /effective Straight Mode load change \+0\.0 pts/);
  assert.match(text(), /Capped — extra rake adds no further trade/);
  assert.match(text(), /rake adds no standing downforce or grip/);
  f.context.G.xVmaxGain = () => .1; f.context.G.xDfLoss = () => .2;
  f.button('STRAIGHT MODE').onclick(); assert.match(text(), /speed ceiling trade \+10\.0% · downforce loss 20\.0%/);
});
test('live atlas retries same-key failures with bounded backoff and skips unsupported backend', () => {
  const source = read('js/garage/scene.js'), start = source.indexOf('function reuploadTex('), end = source.indexOf('// Squeegeed resin:', start);
  let attempts = 0, now = 0;
  const c = vm.createContext({ roomKeys: () => ({ geom: 'g', live: 'l', dressId: 'd', key: 'k' }), performance: { now: () => now },
    cacheKey: 'k', shellMesh: {}, geomKey: 'g', liveKey: 'l', liveTex: null, liveCanvas: {}, liveMesh: { mid: {} }, liveMeshesReady: true,
    liveFail: 0, liveRetryAt: 0, dressTex: {}, dressFail: 0, dressRetryAt: 0, dressIdKey: 'd', dressFullKey: 'd|b',
    boardKey: () => 'b', paintLive() {}, paintTrace() {}, traceFail: 0, lastTrace: -1e9, GarageExperience: { paintCareer() {} }, LiveryTex: {},
    _gfx: { createTexMesh() {}, createTexture() { attempts++; if (attempts === 1) throw Error('injected'); return {}; } },
    Log: { warn() {} },
  });
  vm.runInContext(source.slice(start, end), c);
  c.rebuild({}, {}, {}, {}); assert.equal(attempts, 1); assert.equal(c.liveTex, null);
  now = 999; c.rebuild({}, {}, {}, {}); assert.equal(attempts, 1);
  now = 1000; c.rebuild({}, {}, {}, {}); assert.equal(attempts, 2); assert.ok(c.liveTex);
  now = 2000; c.rebuild({}, {}, {}, {}); assert.equal(attempts, 2);
  c.liveTex = null; c._gfx.createTexture = () => { attempts++; throw Error('persistent'); };
  for (now = 2000; now <= 8000; now += 1000) c.rebuild({}, {}, {}, {});
  assert.equal(attempts, 5); assert.equal(c.liveFail, 3);
  delete c._gfx.createTexture; c.liveFail = 0;
  c.rebuild({}, {}, {}, {}); assert.equal(attempts, 5);
});
test('garage dress retries missing mesh uploads and retires the old texture if repaint throws', () => {
  const source = read('js/garage/scene.js');
  const sides = ['nx', 'px', 'back', 'door', 'mid'], calls = [], freed = [];
  let now = 0, failDoor = true, failPaint = false, board = 'first';
  const c = vm.createContext({
    roomKeys: () => ({ geom: 'g', live: 'l', dressId: 'd', board, key: board }),
    performance: { now: () => now }, cacheKey: '', geomKey: 'g', shellMesh: {}, liveKey: 'l', liveTex: {},
    liveFail: 0, liveRetryAt: 0, dressIdKey: 'd', dressFullKey: '', dressCanvas: {}, dressTex: null,
    dressMesh: {}, dressMeshesReady: false, dressFail: 0, dressRetryAt: 0, SIDES: sides, LiveryTex: {},
    paintDress: () => ({ canvas: {} }), paintBoards() { if (failPaint) throw Error('paint'); },
    buildDress: () => Object.fromEntries(sides.map(side => [side, { side, idx: [0] }])),
    _gfx: { createTexture: () => ({}), freeTexture(t) { freed.push(t); }, createTexMesh({ side }) {
      calls.push(side);
      if (side === 'door' && failDoor) { failDoor = false; return null; }
      return { side };
    } }, Log: { warn() {} },
  });
  vm.runInContext(source.slice(source.indexOf('function reuploadTex('), source.indexOf('// Squeegeed resin:')), c, { filename: absSrc('js/garage/scene.js') });
  c.rebuild({}, {}, {}, {});
  assert.equal(c.dressTex, null);
  now = 1000; c.rebuild({}, {}, {}, {});
  assert.deepEqual(Object.keys(c.dressMesh), sides);
  assert.deepEqual(calls, ['nx', 'px', 'back', 'door', 'door', 'mid']);
  const old = c.dressTex;
  board = 'changed'; failPaint = true; c.rebuild({}, {}, {}, {});
  assert.equal(c.dressTex, null);
  assert.equal(freed.filter(t => t === old).length, 1);
});
test('coverage cache remeasures same-sized dock changes and panel identity, but not stable frames', () => {
  const source = read('js/garage/setup-camera.js');
  const start = source.indexOf('  const canvasEl = $("game"), panelEl ='), end = source.indexOf('  // FIT THE VISIBLE REGION', start);
  let side = 'right', reads = 0;
  const canvas = { clientWidth: 1000, clientHeight: 700, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 700 }) };
  let panel = { clientWidth: 400, clientHeight: 700, getBoundingClientRect: () => { reads++; return { left: side === 'right' ? 600 : 0, top: 0, width: 400, height: 700 }; } };
  const c = vm.createContext({ $: id => id === 'game' ? canvas : id === 'cs-inner' ? panel : null, home: { active: false }, setupPreviewSpin: false,
    arriving: null, window: {}, document: { documentElement: { getAttribute: () => side } }, _covNow: [], _covWas: [], _covPanel: null, _covCanvas: null, _covCam: null,
    _covX: 0, _covY: 0, _covPr: {}, _covCr: {}, _stampRect: (out, v) => Object.assign(out, v), panelCover: pr => ({ x: pr.left ? .4 : -.4, y: 0 }),
  });
  vm.runInContext('function frame(){' + source.slice(start, end) + ' return panelFrac; }', c);
  assert.equal(c.frame(), .4); assert.equal(c.frame(), .4); assert.equal(reads, 1);
  side = 'left'; assert.equal(c.frame(), -.4); assert.equal(reads, 2);
  panel = { ...panel }; c.frame(); assert.equal(reads, 3);
  // #4974: the per-frame stamp is scalars in reused arrays, never a joined key string.
  assert.ok(!/\+ "x" \+|\+ "\|" \+/.test(source.slice(start, end)), 'the turntable coverage stamp must not build a string every frame');
});
test('deferred garage builds cannot run after hide or clear a newer visit busy state', () => {
  const dom = makeDom(), queue = []; let builds = 0;
  const c = vm.createContext({ document: dom.document, $: id => dom.byId(id), Log: { info() {} },
    els: { select: dom.byId('select'), overlay: dom.byId('overlay') }, G: { teamIdx: 0 }, Teams: { LIST: [{ id: 'haas' }] },
    tuneExperiments: { visit() {} }, SetupTune: { get: () => ({ arbF: 5 }) }, csVisitGeneration: 0, csVisitTunes: new Map(), csTuneExperiments: new Map(),
    requestAnimationFrame: cb => queue.push(cb), buildSetup: () => builds++, syncGarageExitChrome() {},
  });
  vm.runInContext(sheet.slice(sheet.indexOf('function openSetup()'), sheet.indexOf('// THE PAINT EDITOR DOES NOT OUTLIVE')), c);
  c.openSetup(); queue.shift()(); const old = queue.shift();
  dom.byId('carsetup').hidden = true; old(); assert.equal(builds, 0);
  c.openSetup(); queue.shift()(); const stale = queue.shift();
  c.openSetup(); stale(); assert.equal(builds, 0); assert.equal(dom.byId('carsetup').getAttribute('aria-busy'), 'true');
  queue.shift()(); queue.shift()(); assert.equal(builds, 1); assert.equal(dom.byId('carsetup').getAttribute('aria-busy'), null);
});
test('palette rebuild preserves only palette-owned focus, including repeated matches and a new colour', () => {
  const dom = makeDom(), document = dom.document, saved = new Map();
  let buttonsMade = 0;
  // Exercise the complete editor with its actual inserted surface controls.
  // The minimal DOM omits native textContent detachment; model that operation
  // for all created nodes so an old focused palette chip really leaves the tree.
  const create = document.createElement;
  document.createElement = tag => {
    if (tag === 'button') buttonsMade++;
    const el = create(tag); let text = '';
    const append = el.appendChild, insert = el.insertBefore;
    el.appendChild = child => { if (child.parentNode) child.remove(); return append(child); };
    el.insertBefore = (child, before) => { if (child.parentNode) child.remove(); return insert(child, before); };
    Object.defineProperty(el, 'nextSibling', { get: () => el.parentNode?.children[el.parentNode.children.indexOf(el) + 1] || null });
    Object.defineProperty(el, 'textContent', { get: () => text, set(value) {
      text = String(value);
      if (el.contains(document.activeElement)) document.activeElement = document.body;
      for (const child of [...el.children]) el.removeChild(child);
    } });
    return el;
  };
  document.createTextNode = text => { const node = document.createElement('span'); node.textContent = text; return node; };
  const store = { get: (k, d) => k === 'garageTab' ? 'livery' : saved.has(k) ? saved.get(k) : d, set: (k, v) => saved.set(k, v) };
  const context = vm.createContext({ document, Log: { info() {}, warn() {} }, setTimeout: () => 0, clearTimeout() {},
    GameStore: { store }, addEventListener() {}, removeEventListener() {},
    GameAudio: {}, ScrollFade: { refresh() {} }, Car3D: { appearanceParts: p => p, PART_STYLE_FIELDS: { aeroShape: "aero", floorShape: "floor" }, FINISH_SURFACE: {} },
    LiveryTex: { NUM_FONT_IDS: ['default'], SPONSOR_PACK_IDS: ['default'], SPINE_LOGO_IDS: ['stripe', 'contours'], FILL_SURFACES: [] },
  });
  context.window = context;
  const run = path => vm.runInContext(read(path), context, { filename: absSrc(path) });
  for (const path of ['js/core/mat4.js', 'js/physics/consts.js', 'js/car/parts.js', 'js/data/teams.js',
    'js/garage/experience.js', 'js/garage/setup-tune.js', 'js/garage/setup-experiments.js', 'js/garage/surface-inspection.js',
    'js/car/livery-design.js', 'js/garage/livery-design-editor.js']) run(path);
  const team = vm.runInContext('Teams.LIST[1]', context); team.color = [1, 0, 0]; team.color2 = [0, 0, 1];
  const G = { $: id => dom.byId(id), els: { select: dom.byId('select'), overlay: dom.byId('overlay') }, store,
    cssCol: () => '#fff', arrToHex: rgb => '#' + rgb.map(n => Math.round(n * 255).toString(16).padStart(2, '0')).join(''),
    hexToArr: hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255),
    getTeamParts: () => ({}), saveTeamParts() {}, getLiveryId: () => 'default', saveLiveryId() {},
    getCustomLiveries: () => [], setCustomLiveries() {}, getLiveries: () => [], invalidateDecalTextures() {},
    teamIdx: 1, driverIdx: 0, soundOn: false, careerOwned: () => false, unlimitedBudget: false, peerSeats: () => [],
    teamSwatch: () => document.createElement('span'), setTeamPicker() {}, openCustomize() {}, livDraftOverride: null, setupCam: { meshKey: '' },
  };
  context.G = G; run('js/garage/setup-sheet.js');
  const ui = vm.runInContext('SetupUI.create(G)', context); ui.buildSetup(); dom.byId('cs-options').querySelector('.cs-liv-create').onclick();
  const editor = dom.byId('cs-options').querySelector('.cs-liv-editor');
  assert.ok(editor.querySelector('.cs-liv-ed-inspect'), 'actual inserted surface helper participates in the full editor');
  const row = editor.querySelectorAll('.cs-liv-ed-row').find(r => r.querySelector('.cs-liv-ed-lbl')?.textContent === 'PRIMARY');
  const palette = row.querySelector('.cs-liv-pal');
  const initialChips = [...palette.children], initialHandlers = initialChips.map(b => b.onclick);
  const afterBuild = buttonsMade;
  editor.querySelectorAll('button').find(b => b.dataset.csPill === 'spineLogo:contours').onclick();
  let chip = palette.children[0]; chip.focus(); chip.onclick();
  assert.ok(document.activeElement === chip, 'an unchanged palette retains the focused chip itself'); assert.equal(chip.isConnected, true);
  chip = palette.children[1]; chip.focus(); chip.onclick(); assert.equal(document.activeElement.dataset.csColour, '#0000ff');
  assert.equal(palette.children[1].classList.contains('active'), true, 'matching an existing colour updates selection in place');
  assert.equal(palette.children[0].classList.contains('active'), false);
  for (const [field, value] of [['patternWidth', '80'], ['patternRotation', '25'], ['patternRepeat', '8']]) {
    const input = editor.querySelectorAll('input').find(n => n.dataset.livField === field);
    assert.ok(input, field + ' uses the real integrated design control');
    assert.equal(input.disabled, false, field + ' is available for the selected pattern');
    input.value = value; input.oninput(); input.onchange();
  }
  assert.equal(buttonsMade, afterBuild, 'matching colours and pattern adjustments create zero replacement palette buttons');
  assert.deepEqual(palette.children, initialChips);
  assert.deepEqual(palette.children.map(b => b.onclick), initialHandlers, 'unchanged palette handlers remain installed');
  assert.ok(document.activeElement === chip, 'pattern edits leave palette-owned focus untouched');
  const colour = row.querySelector('input'); colour.value = '#00ff00'; const beforeDrag = buttonsMade;
  for (const hex of ['#00fe00', '#00fd00', '#00ff00']) { colour.value = hex; colour.oninput(); }
  assert.equal(buttonsMade, beforeDrag, 'a colour drag (input ticks) rebuilds no palette chips');
  colour.onchange();
  assert.equal(document.activeElement.dataset.csColour, '#0000ff', 'the same matching colour retains focus when another colour appears');
  assert.ok(palette.children.some(b => b.dataset.csColour === '#00ff00'), 'the newly edited colour becomes matchable');
  assert.ok(buttonsMade > afterBuild, 'a changed colour palette rebuilds its choices');
  const native = document.createElement('input'); document.body.appendChild(native); native.focus();
  colour.value = '#ff00ff'; colour.oninput(); colour.onchange(); assert.equal(document.activeElement, native);
});
test('research-only purchase keeps fitted part and explains the exact cap shortfall', () => {
  const dom = makeDom(), row = dom.document.createElement('button'), main = dom.document.createElement('div');
  let money = 100, unlocked = false, fitted = 'old', allowResearch = true;
  const c = vm.createContext({ document: dom.document, row, main, opt: { id: 'new', cost: 80 }, active: false, locked: true,
    team: { id: 'haas' }, activeCat: { id: 'aero' }, unlimited: false, cap: 100,
    G: { soundOn: false }, $: id => dom.byId(id), reject() {},
    getTeamParts: () => ({ aero: fitted }), resolveOpt: () => ({ cost: 20 }), Parts: { getCost: () => 70 },
    Career: { research: () => { if (!allowResearch) return false; unlocked = true; money -= 30; return true; } },
    buildSetup: () => dom.byId('cs-options').replaceChildren(), saveTeamParts: (_id, p) => { fitted = p.aero; },
  });
  const start = sheet.indexOf('    const fitted = getTeamParts(team.id), replacing'), end = sheet.indexOf('\n\n    const reject', start);
  vm.runInContext(sheet.slice(start, end), c); assert.match(main.children[0].textContent, /Research only.*30 cr short/);
  const click = sheet.indexOf('    row.onclick = () => {\n      if (active) return;');
  vm.runInContext(sheet.slice(click, sheet.indexOf('\n    optsEl.appendChild(row);', click)), c);
  row.onclick(); assert.equal(unlocked, true); assert.equal(money, 70); assert.equal(fitted, 'old');
  assert.equal(dom.byId('cs-options').children[0].textContent, 'Unlocked, not fitted — 30 cr over the fitted cap.');
  allowResearch = false; row.onclick(); assert.equal(money, 70); assert.equal(fitted, 'old');
});
test('research cash advisory uses actual research price and active career, without purchase side effects', () => {
  const dom = makeDom(), main = dom.document.createElement('div');
  let active = true, askedPrice = null, planCalls = 0;
  const Career = { inCareer: () => active, researchCost: () => 57, data: () => { throw Error('saved data is not active authority'); },
    planning: () => { planCalls++; return { cash: price => { askedPrice = price; return { afterPurchase: 43, wages: 60, low: 0, unlimited: false }; } }; },
  };
  const c = vm.createContext({ document: dom.document, main, Career, opt: { cost: 20 }, locked: true, unlimited: false, cap: 100,
    team: { id: 'haas' }, activeCat: { id: 'aero' }, getTeamParts: () => ({}), resolveOpt: () => ({ cost: 20 }), Parts: { getCost: () => 70 } });
  const start = sheet.indexOf('    const fitted = getTeamParts(team.id), replacing'), end = sheet.indexOf('\n\n    const reject', start);
  const run = () => vm.runInContext('{' + sheet.slice(start, end) + '}', c);
  run(); assert.equal(askedPrice, 57, 'discounted research price, not fitted cost'); assert.equal(planCalls, 1);
  assert.match(main.children[0].textContent, /43 cr after research.*60 cr upcoming wages.*0 cr before income/);
  assert.match(main.children[0].textContent, /Upcoming wages exceed the remaining cash/);
  assert.match(main.children[0].textContent, /does not block research/);
  main.replaceChildren(); active = false; run(); assert.equal(main.children.length, 0); assert.equal(planCalls, 1);
  active = true; delete Career.planning; run(); assert.equal(main.children.length, 0, 'legacy missing planning API skipped');
  Career.planning = () => ({ cash: () => null }); run(); assert.equal(main.children.length, 0);
  Career.planning = () => ({ cash: () => ({ afterPurchase: 100, wages: 60, low: 40, unlimited: true }) }); run();
  assert.equal(main.children.length, 0, 'unlimited funds have no spending cash warning');
});

function measuredFixture() {
  const dom = makeDom(), saved = new Map(), revisions = new Map();
  const store = { get: (k,d) => saved.has(k) ? structuredClone(saved.get(k)) : d,
    set(k,v) { return this.write(k,v).durable; }, keyRevision: k => revisions.get(k) || 0,
    write(k,v) { saved.set(k, structuredClone(v)); revisions.set(k,(revisions.get(k)||0)+1); return {ok:true,durable:true}; } };
  const ctx = vm.createContext({ document: dom.document, GameStore:{store}, PhysicsConsts:{BB_REF:.56} });
  for (const file of ['setup-tune','setup-presets','setup-trials']) vm.runInContext(read('js/garage/'+file+'.js'),ctx);
  const S=vm.runInContext('SetupTune',ctx), P=vm.runInContext('SetupPresets',ctx), T=vm.runInContext('SetupTrials',ctx);
  const context=()=>({unscored:true,stableWeather:true,physics:'rev1',car:'haas',parts:{engine:'a'},track:'monza',point:0,weather:{type:'dry',wet:0},tyres:{id:'medium',wear:0,temp:85},fuel:1,energy:1,assists:{traction:false}});
  const baseline=S.get('haas'),candidate={...baseline,arbF:baseline.arbF+1};
  const begin=(launch=async()=>({ok:true,context:context()}))=>T.create({teamId:'haas',store,baseline,candidate,launch});
  return {dom,store,ctx,S,P,T,context,baseline,candidate,begin};
}
test('preset contexts normalize bounded provenance, preserve old libraries and preview precise part differences',()=>{
  const h=measuredFixture();const row=h.P.save(h.store,'haas','Dry',h.baseline,'monza',{v:1,physics:'rev1',track:'monza',parts:{engine:'a'},note:'x'.repeat(300)}).row;
  assert.equal(row.context.note.length,160);
  const normalized=h.P.normalize(JSON.parse(JSON.stringify({v:1,items:[row]})));assert.equal(normalized.items[0].context.parts.engine,'a');
  const same=h.P.preview(h.store,'haas',row.id,{v:1,physics:'rev1',track:'monza',parts:{engine:'a'}});assert.equal(same.contextChanges.length,0);
  const changed=h.P.preview(h.store,'haas',row.id,{v:1,physics:'rev1',track:'monza',parts:{engine:'b'}});assert.match(changed.contextChanges.join(' '),/Part engine: a → b/);
  delete row.context;h.store.write('setupPresets.haas',{v:1,items:[row]});const legacy=h.P.preview(h.store,'haas',row.id);assert.match(legacy.contextChanges.join(' '),/unknown/);assert.equal(h.P.apply(h.store,'haas',legacy).ok,true);
});
test('measured launches require three clean baseline, A/A and candidate repeats; show median and spread only for equivalent starts',async()=>{
 const h=measuredFixture();h.begin();for(const arm of ['baseline','control','candidate'])for(const score of [3,3.2,3.1]){assert.equal(await h.T.attempt(arm),true);assert.equal(h.T.record({mode:'launch',clean:true,score},h.context()),true);}
 const s=h.T.summary();assert.equal(s.comparable,true);assert.equal(s.delta,0);assert.equal(s.groups.control.n,3);assert.ok(Math.abs(s.groups.baseline.spread-.2)<1e-10);
 assert.equal(h.T.record({mode:'launch',clean:true,score:1},h.context()),false,'duplicate settlement ignored');h.T.cancel();
});
test('each changed starting condition and missing conditions exclude receipts and suppress comparison',async()=>{
 for(const key of ['physics','car','parts','track','point','weather','tyres','fuel','energy','assists']){
  const h=measuredFixture();let next=h.context();h.begin(async()=>({ok:true,context:next}));await h.T.attempt('baseline');h.T.record({mode:'launch',clean:true,score:3},h.context());
  next={...h.context(),[key]:'changed'};await h.T.attempt('candidate');h.T.record({mode:'launch',clean:true,score:2},h.context());const s=h.T.summary();assert.equal(s.receipts[1].valid,false,key);assert.match(s.receipts[1].issues.join(' '),new RegExp(key));assert.equal(s.delta,null);h.T.cancel();
 }
 const h=measuredFixture();h.begin(async()=>({ok:true,context:{}}));await h.T.attempt('baseline');h.T.record({mode:'launch',clean:true,score:1},{});assert.equal(h.T.summary().receipts[0].valid,false);
});
test('unclean attempts, mid-run weather/tune changes and retries are excluded',async()=>{
 const h=measuredFixture();h.begin();await h.T.attempt('baseline');h.T.record({mode:'launch',clean:false,score:3,reason:'contact'},h.context());
 await h.T.attempt('candidate');h.T.record({mode:'launch',clean:true,score:2},{...h.context(),weather:'wet'});
 await h.T.attempt('baseline');h.T.invalidate('rewind');assert.equal(h.T.summary().receipts.filter(r=>r.valid).length,0);assert.match(h.T.summary().receipts[2].issues.join(' '),/rewind/);h.T.cancel();
});
test('cancel restores only its owned mechanical sheet and pending launch receives a revocable lease',async()=>{
 const h=measuredFixture();h.begin();await h.T.attempt('candidate');h.T.cancel();assert.deepEqual(plain(h.S.get('haas')),plain(h.baseline));
 h.begin();await h.T.attempt('candidate');h.S.set('haas',{arbF:11});h.T.cancel();assert.equal(h.S.get('haas').arbF,11,'later user edit preserved');
 let finish,lease;h.begin(o=>{lease=o.isCurrent;return new Promise(r=>finish=r);});const pending=h.T.attempt('candidate');assert.equal(lease(),true);h.T.cancel();assert.equal(lease(),false);finish({ok:true,context:h.context()});assert.equal(await pending,false);assert.equal(h.T.active(),false);
});
test('comparison controls are reachable in actual DOM and capture the candidate on explicit Begin',async()=>{
 const h=measuredFixture(),host=h.dom.makeElement('div');h.dom.body.appendChild(host);let starts=0;
 h.T.mount(host,{teamId:'haas',store:h.store,baseline:h.baseline,candidateNow:()=>h.S.get('haas'),launch:async()=>{starts++;return {ok:true,context:h.context()};}});
 const buttons=host.querySelectorAll('button');h.S.set('haas',{arbF:10});buttons.find(b=>b.textContent==='BEGIN COMPARISON').onclick();
 await buttons.find(b=>b.textContent==='RUN CANDIDATE').onclick();await Promise.resolve();assert.equal(starts,1);assert.equal(h.S.get('haas').arbF,10);assert.equal(h.T.summary().pending,true);h.T.cancel();
});

test('transient condition drift stays excluded even when restored before completion; same-value user writes release ownership',async()=>{
 const h=measuredFixture();h.begin();await h.T.attempt('baseline');h.T.observe({...h.context(),weather:'wet'});h.T.observe(h.context());h.T.record({mode:'launch',clean:true,score:3},h.context());assert.match(h.T.summary().receipts[0].issues.join(' '),/weather changed/);
 h.T.cancel();h.begin();await h.T.attempt('candidate');h.S.set('haas',h.candidate);h.T.cancel();assert.deepEqual(plain(h.S.get('haas')),plain(h.candidate),'same-value explicit write is a later owner, not permission to restore baseline');
});
test('A/A control drift suppresses observed delta and attempt receipts are bounded',async()=>{
 const h=measuredFixture();h.begin();for(const arm of ['baseline','control','candidate'])for(let i=0;i<3;i++){await h.T.attempt(arm);h.T.record({mode:'launch',clean:true,score:arm==='control'?5:3},h.context());}
 assert.equal(h.T.summary().comparable,false);assert.equal(h.T.summary().delta,null);
 for(let i=0;i<3;i++){await h.T.attempt('baseline');h.T.record({mode:'launch',clean:true,score:3},h.context());}
 assert.equal(await h.T.attempt('baseline'),false);assert.equal(h.T.summary().receipts.filter(x=>x.arm==='baseline').length,6);h.T.cancel();
});

test('pause comparison return preserves completed receipts, excludes incomplete run and safely stops before cancellation restore',async()=>{
 const h=measuredFixture(),pause=h.dom.makeElement('div'),body=h.dom.makeElement('div');body.className='sheet-body';pause.appendChild(body);h.dom.body.appendChild(pause);const calls=[];
 let held=null;const G={$:()=>pause,quitToMenu:then=>{calls.push(['quit',h.S.get('haas').arbF]);held=then;},openGarageFrom:from=>calls.push(['garage',from])};
 const release=()=>{assert.equal(calls.at(-1)[0],'quit','nothing opens before the quit tail runs (a software raster defers it)');const t=held;held=null;t();};
 const ui=h.T.mountPause(G);assert.equal(h.T.mountPause(G),ui,'mount is idempotent');assert.equal(ui.section.hidden,true);
 h.begin();await h.T.attempt('baseline');h.T.record({mode:'launch',clean:true,score:3},h.context());await h.T.attempt('candidate');
 const buttons=ui.section.querySelectorAll('button');buttons.find(b=>b.textContent==='RETURN TO SETUP COMPARISON').onclick();release();assert.equal(h.T.active(),true);assert.equal(h.T.summary().receipts.length,2);assert.equal(h.T.summary().receipts[0].valid,true);assert.equal(h.T.summary().receipts[1].valid,false);assert.deepEqual(calls.map(x=>x[0]),['quit','garage']);
 buttons.find(b=>b.textContent==='CANCEL SETUP COMPARISON').onclick();assert.equal(calls[2][0],'quit');assert.equal(calls[2][1],h.candidate.arbF,'session stops before store restoration');release();assert.equal(calls[3][0],'garage');assert.deepEqual(plain(h.S.get('haas')),plain(h.baseline));assert.equal(h.T.active(),false);assert.equal(ui.section.hidden,true);ui.dispose();
});
test('explicit cancellation calls runtime cancellation while its async launch lease is still valid',async()=>{
 const h=measuredFixture();let lease,finish,cancelled=false;h.T.create({teamId:'haas',store:h.store,baseline:h.baseline,candidate:h.candidate,launch:o=>{lease=o.isCurrent;return new Promise(r=>finish=r);},cancelRuntime:()=>{cancelled=lease();}});
 const pending=h.T.attempt('candidate');h.T.cancel();assert.equal(cancelled,true);assert.equal(lease(),false);finish({ok:true,context:h.context()});assert.equal(await pending,false);
});

test('pause comparison controls cannot quit a later ordinary session with no runtime ownership',async()=>{
 const h=measuredFixture(),pause=h.dom.makeElement('div'),body=h.dom.makeElement('div');body.className='sheet-body';pause.appendChild(body);h.dom.body.appendChild(pause);let owns=true,quits=0;
 const ui=h.T.mountPause({$:()=>pause,setupTrialContext:()=>owns?h.context():null,quitToMenu:()=>quits++,openGarageFrom(){}});h.begin();await h.T.attempt('baseline');assert.equal(ui.section.hidden,false);owns=false;ui.refresh();assert.equal(ui.section.hidden,true);
 for(const b of ui.section.querySelectorAll('button'))b.onclick();assert.equal(quits,0);h.T.cancel();ui.dispose();
});

// ── Batch #5094 (garage bay): the zoom takes the distance off the turntable (#5034), a camera
// restore drives the AERO button and one Escape closes one layer (#5045), and the decal
// stations ink against every paint the mesh puts under them (#5039). ──
const CAM = "js/garage/setup-camera.js", SHEET = "js/garage/setup-sheet.js", cam = read(CAM);
const at = (f) => ({ filename: absSrc(f) });
function slice(src, from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, "found " + from);
  return src.slice(a, b);
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const button = () => {
  const attrs = {}, val = { textContent: "" };
  return { attrs, val, classList: { toggle() {} }, setAttribute: (k, v) => { attrs[k] = v; }, querySelector: () => val };
};

// ── #5034 ──
function zoomRig(state) {
  const c = vm.createContext({ clamp, SP_DIST_MAX: 15, spDistMin: () => 4.6, home: { active: false },
    setSetupSpin(on) { c.setupPreviewSpin = !!on; }, ...state });
  vm.runInContext(slice(cam, "function setupZoom(mul) {", "// Move the rig sideways"), c, at(CAM));
  return c;
}
test("a zoom on the spinning turntable moves the DRAWN distance and stops the spin (#5034)", () => {
  // Measured at 844x390 (#5034): stored 8.35, drawn 7.12 with the sheet docked.
  for (const [mul, dir] of [[1 / 1.1, -1], [1.1, 1]]) {
    const c = zoomRig({ setupPreviewSpin: true, setupPreviewDist: 6.0, _spEffDist: 7.12 });
    c.setupZoom(mul);
    assert.equal(c.setupPreviewSpin, false, "the zoom stops the turntable");
    assert.ok((c.setupPreviewDist - 7.12) * dir >= 7.12 * 0.05, "one press moves the drawn distance by 5 % or more: " + c.setupPreviewDist);
  }
});
test("a zoom with the turntable off, or on the Home camera, keeps its own distance (#5034)", () => {
  const off = zoomRig({ setupPreviewSpin: false, setupPreviewDist: 8, _spEffDist: 5 });
  off.setupZoom(1.1);
  assert.equal(off.setupPreviewDist, 8 * 1.1);
  const home = zoomRig({ setupPreviewSpin: true, setupPreviewDist: 8, _spEffDist: 5, home: { active: true } });
  home.setupZoom(1.1);
  assert.equal(home.setupPreviewDist, 8 * 1.1);
  assert.equal(home.setupPreviewSpin, true, "the Home turntable is not the garage's to stop");
  const max = zoomRig({ setupPreviewSpin: false, setupPreviewDist: 14.9, _spEffDist: 14.9 });
  max.setupZoom(1.1);
  assert.equal(max.setupPreviewDist, 15);
});

// ── #5045 ──
test("restoring the camera after INSPECT puts the AERO button back with the flaps (#5045)", () => {
  const aero = button(), spots = [];
  const c = vm.createContext({ $: (id) => (id === "cs-aero" ? aero : null), GarageScene: { spot: (n) => spots.push(n) },
    setSetupSpin() {}, setupPreviewXOn: false, setupPreviewAeroX: 0 });
  vm.runInContext(slice(cam, "function setSetupAero(on, opts) {", "function setupZoom(")
    + slice(cam, "function restoreCamera(s) {", "function setHomeView("), c, at(CAM));
  const saved = { az: 1, el: 0.2, dist: 8, spin: false, orbit: [0, 0, 0], target: [0, 0, 0], pan: [0, 0, 0],
    minDist: 0, free: false, xOn: false, aeroX: 0, view: "side" };
  c.setSetupAero(true);   // AERO pressed during the inspection
  assert.equal(aero.attrs["aria-pressed"], "true");
  c.restoreCamera(saved);
  assert.equal(c.setupPreviewXOn, false);
  assert.equal(aero.attrs["aria-pressed"], "false", "aria-pressed follows the restored flaps");
  assert.equal(aero.val.textContent, "CORNER MODE", "and so does the label");
  assert.deepEqual(spots, ["side"]);
});

test("the Garage camera disclosure survives pointerdown on preparation and arrangement tools", () => {
  const dom = makeDom();
  let open = true, pointerdown;
  const c = vm.createContext({
    G: { setupPreviewOn: true }, setupCamPanelOpen: () => open, setSetupCamPanel: value => { open = value; },
    document: { addEventListener(type, fn, capture) {
      assert.equal(type, "pointerdown"); assert.equal(capture, true); pointerdown = fn;
    } },
  });
  const source = slice(cam, 'document.addEventListener("pointerdown", (e) => {', "}, true);") + "}, true);";
  vm.runInContext(source, c, at(CAM));
  const preparation = dom.makeElement("div");
  preparation.id = "arrange-prepare";
  for (const owner of [preparation, dom.byId("screen-arranger"), dom.byId("cs-stack")]) {
    const button = dom.makeElement("button"); owner.appendChild(button);
    pointerdown({ target: button });
    assert.equal(open, true);
  }
  pointerdown({ target: dom.byId("game") });
  assert.equal(open, false, "starting an orbit still dismisses the panel");
});

test("one Escape with the CAMERA panel open over the paint editor closes the panel only (#5045)", () => {
  const game = read(GAME_REL);
  const sheetFirst = game.indexOf("SetupUI.create(G, customLiv)") < game.indexOf("SetupCamera.create(G");
  assert.ok(game.includes("SetupUI.create(G, customLiv)") && game.includes("SetupCamera.create(G"), "both modules are created by the entry file");
  const panel = { hidden: false }, cancel = { clicks: 0, click() { this.clicks++; } }, listeners = [];
  const c = vm.createContext({
    $: (id) => (id === "cs-cam-panel" ? panel : null), G: { setupPreviewOn: true }, csLivCreating: true,
    setupCamPanelOpen: () => !panel.hidden, setSetupCamPanel: (open) => { panel.hidden = !open; },
    document: { querySelector: (sel) => (sel.includes(".cs-liv-ed-cancel") ? cancel : null) },
    window: { addEventListener: (type, fn) => listeners.push(fn) },
  });
  const sheetEsc = slice(sheet, 'window.addEventListener("keydown", (e) => {\n  if (e.key !== "Escape" || !csLivCreating', "}, true);") + "}, true);";
  const camEsc = slice(cam, 'window.addEventListener("keydown", (e) => {\n  // …but only when the GARAGE is the top layer', "}, true);") + "}, true);";
  for (const [src, f] of sheetFirst ? [[sheetEsc, SHEET], [camEsc, CAM]] : [[camEsc, CAM], [sheetEsc, SHEET]]) vm.runInContext(src, c, at(f));
  assert.equal(listeners.length, 2);
  const press = () => {
    const e = { key: "Escape", defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
    for (const fn of listeners) fn(e);
    return e;
  };
  assert.equal(press().defaultPrevented, true, "the key is claimed");
  assert.equal(panel.hidden, true, "the panel closes");
  assert.equal(cancel.clicks, 0, "CANCEL is not pressed by the same key");
  press();
  assert.equal(cancel.clicks, 1, "the next Escape is the editor's");
});

// ── #5039 ──
function loadLivery() {
  const ctx = { console, Math, Object, Array, Float32Array, Uint16Array, Uint32Array, JSON, Number, String, Boolean, isFinite, isNaN, Map, Set, WeakMap };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/data/teams.js", "js/car/parts.js", "js/car/livery-design.js",
                   "js/car/livery-graphics.js", "js/car/livery-stations.js", "js/car/crest-draw.js", "js/car/liverytex.js"])
    vm.runInContext(read(f), ctx, at(f));
  return { S: vm.runInContext("LiveryStations", ctx), T: vm.runInContext("LiveryTex", ctx), Teams: vm.runInContext("Teams", ctx) };
}
const L = loadLivery(), INK_TARGET = 6.5;
const REG = { noseTip: { id: "noseTip" }, cockpitSide: { id: "cockpitSide" }, podTop: { id: "podTop" }, haloTop: { id: "haloTop" } };
function paintStations(colors) {
  const marks = {}, fills = {};
  L.S.paint({}, REG, { teamId: "cadillac", colors, c1: colors.c1, accent: [0.9, 0.1, 0.1], names: ["TITLE", "B", "C", "D", "E", "F"], num: 1,
    fillRegion: (ctx, R, colour) => { fills[R.id] = colour; },
    drawWordmark: (ctx, text, R, ink, opts) => { marks[R.id] = { ink, halo: opts.halo }; },
    inkOn: L.T.inkOn, haloIf: (i) => (i.worst < INK_TARGET ? [1, 1, 1] : null) });
  return { marks, fills };
}
const reads = (mark, bgs, label) => {
  const worst = Math.min(...bgs.map((b) => L.T.contrast(mark.ink, b)));
  assert.ok(worst >= INK_TARGET || mark.halo, label + ": ink clears " + INK_TARGET + " on every paint under it, or carries a halo (worst " + worst.toFixed(2) + ")");
};
test("cockpit code and pod-top sponsor read on both flanks of a left/right split (#5039)", () => {
  const cad = L.Teams.LIST.find((t) => t.id === "cadillac");
  const white = [0.95, 0.95, 0.96], black = [0.04, 0.04, 0.05];
  assert.ok(JSON.stringify(cad).includes('"bodySplit":"lr"'), "Cadillac ships the lr split this guards");
  const { marks } = paintStations({ c1: white, c2: black, bodySplit: "lr" });
  reads(marks.cockpitSide, [white, black], "cockpit code");
  reads(marks.podTop, [white, black], "pod-top sponsor");
});
test("cockpit code and pod-top sponsor read on an upper / lower zone (#5039)", () => {
  const black = [0.04, 0.04, 0.05], silver = [0.76, 0.78, 0.82], white = [0.95, 0.95, 0.96];
  const up = paintStations({ c1: black, upper: silver }).marks;
  reads(up.cockpitSide, [black, silver], "cockpit code, upper");
  reads(up.podTop, [black, silver], "pod-top sponsor, upper");
  reads(paintStations({ c1: white, lower: black }).marks.cockpitSide, [white, black], "cockpit code, lower");
  // A one-paint car keeps its plain ink: no halo it did not need.
  const plain = paintStations({ c1: black }).marks;
  assert.equal(plain.cockpitSide.halo, null);
  assert.equal(plain.podTop.halo, null);
});
test("NOSE TIP wears the NOSE CAP colour when the livery sets one, else the accent (#5039)", () => {
  const nose = [1, 1, 1], c1 = [0.04, 0.04, 0.05];
  assert.deepEqual(paintStations({ c1, nose }).fills.noseTip, nose);
  assert.deepEqual(paintStations({ c1 }).fills.noseTip, [0.9, 0.1, 0.1]);
  assert.equal(paintStations({ c1, nose, decalNoseTip: "off" }).fills.noseTip, undefined);
});

// #5879: attempt() writes the trial tune into the saved setup; a reload mid-comparison used to keep it for good.
function reloadable(saved, opts = {}) {
  const dom = makeDom(), timers = [];
  const localStorage = {
    get length() { return saved.size; }, key: i => [...saved.keys()][i],
    getItem: k => saved.get(k) ?? null,
    setItem(k, v) {
      const other = [...saved].filter(([key]) => key !== k).reduce((n, [key, val]) => n + key.length + val.length, 0);
      if (opts.refuse === k || other + k.length + v.length > opts.quota) {
        throw Object.assign(new Error("Storage full"), { name: "QuotaExceededError" });
      }
      saved.set(k, v);
      if (opts.committed) opts.committed(k);
    },
    removeItem: k => saved.delete(k),
  };
  const ctx = vm.createContext({ document: dom.document, localStorage, Career: opts.career, PhysicsConsts:{BB_REF:.56}, setTimeout: fn => timers.push(fn) });
  seedStore(ctx);
  for (const file of ['setup-tune','setup-presets','setup-trials']) vm.runInContext(read('js/garage/'+file+'.js'),ctx,{filename:absSrc('js/garage/'+file+'.js')});
  timers.splice(0).forEach(fn => fn());
  return { dom, store: ctx.GameStore.store, S: vm.runInContext('SetupTune',ctx), T: vm.runInContext('SetupTrials',ctx) };
}
test('a reload mid-comparison restores the tuned setup, keeps a later hand edit, and cancel clears the record',()=>{
  for (const edited of [false, true]) {
    const saved = new Map(); let h = reloadable(saved); const works = plain(h.S.get('haas'));
    h.S.set('haas', {...works, arbF: works.arbF + 2}); const tuned = plain(h.S.get('haas'));
    h.T.create({teamId:'haas',store:h.store,baseline:works,candidate:tuned,launch:()=>new Promise(()=>{})});
    h.T.attempt('baseline'); assert.deepEqual(plain(h.S.get('haas')), works, 'the trial wrote the baseline');
    if (edited) h.S.set('haas', {...works, arbF: works.arbF + 4});
    const want = plain(h.S.get('haas'));
    h = reloadable(saved);
    assert.deepEqual(plain(h.S.get('haas')), edited ? want : tuned, edited ? 'a later hand edit is left alone' : 'reload restores the tuned setup');
    assert.equal(h.store.get('setupTrialRecover', null) ?? null, null, 'the recovery record is consumed');
  }
  const saved = new Map(), h = reloadable(saved);
  h.T.create({teamId:'haas',store:h.store,baseline:h.S.get('haas'),candidate:h.S.get('haas'),launch:()=>new Promise(()=>{})});
  h.T.attempt('candidate'); assert.notEqual(h.store.get('setupTrialRecover', null), null); h.T.cancel();
  assert.equal(h.store.get('setupTrialRecover', null) ?? null, null, 'cancel clears the record');
});

test('setup comparison persists recovery before changing the sheet or launching from Garage', async () => {
  const saved = new Map(), opts = { quota: 125 }, h = reloadable(saved, opts);
  const baseline = h.S.get('haas'), candidate = h.S.set('haas', { arbF: 8 });
  const host = h.dom.makeElement('div');
  let starts = 0, between;
  h.T.mount(host, { teamId: 'haas', store: h.store, baseline, candidateNow: () => candidate,
    launch: async () => { starts++; return { ok: true, context: {} }; } });
  const button = label => host.querySelectorAll('button').find(b => b.textContent === label);
  button('BEGIN COMPARISON').onclick();
  await button('RUN BASELINE').onclick();
  assert.match(h.T.summary().reason, /storage/i);
  assert.equal(starts, 0);
  assert.equal(reloadable(saved).S.get('haas').arbF, 8);
  opts.quota = 4096;
  opts.committed = k => { if (k === 'apex26.setupTrialRecover') between = new Map(saved); };
  opts.refuse = 'apex26.setup.haas';
  await button('RUN BASELINE').onclick();
  assert.equal(starts, 0, 'a refused sheet write cannot start the drill');
  assert.equal(reloadable(between).S.get('haas').arbF, 8, 'interrupted after the journal, the sheet still belongs to the player');
  opts.refuse = null;
  button('RUN BASELINE').onclick();
  assert.equal(starts, 1);
  assert.equal(h.S.get('haas').arbF, baseline.arbF);
  assert.equal(reloadable(saved).S.get('haas').arbF, 8, 'the committed trial sheet can now be recovered');
});

test('refused cancellation and boot restore keep the prior setup recoverable, including older journals', () => {
  const saved = new Map(), opts = {}, h = reloadable(saved, opts);
  const baseline = h.S.get('haas'), before = h.S.set('haas', { arbF: 8 });
  h.T.create({ teamId: 'haas', store: h.store, baseline, candidate: before, launch: () => new Promise(() => {}) });
  h.T.attempt('baseline');
  const stamped = new Map(saved);
  opts.refuse = 'apex26.setup.haas';
  assert.equal(h.T.cancel(), false);
  for (const legacy of [false, true]) {
    const disk = new Map(saved);
    if (legacy) {
      disk.set('apex26.setup.haas', JSON.stringify(baseline));
      disk.set('apex26.setupTrialRecover', JSON.stringify({ teamId: 'haas', key: 'setup.haas', before, owned: baseline }));
    }
    const blocked = reloadable(disk, opts);
    assert.equal(blocked.S.get('haas').arbF, baseline.arbF);
    assert.ok(disk.has('apex26.setupTrialRecover'));
    assert.equal(blocked.T.create({ teamId: 'haas', store: blocked.store, baseline, candidate: before, launch() {} }), false);
    assert.equal(reloadable(disk).S.get('haas').arbF, 8);
    assert.equal(disk.has('apex26.setupTrialRecover'), false);
  }
  // An explicit same-value hand edit creates an ordinary sheet again.
  stamped.set('apex26.setup.haas', JSON.stringify(baseline));
  assert.equal(reloadable(stamped).S.get('haas').arbF, baseline.arbF);
});

test('a free-play, career slot or career seed switch keeps recovery with the trial that wrote the sheet', async () => {
  for (const change of ['free-play to career', 'career slot', 'career seed']) {
    let active = change !== 'free-play to career', slot = 1, seed = 101;
    const opts = { career: { inCareer: () => active, slot: () => ({ flavour: 'gp', i: slot }), data: () => ({ team: 'haas', seed }) } };
    const saved = new Map(), h = reloadable(saved, opts);
    const baseline = h.S.get('haas'), before = h.S.set('haas', { arbF: 8 });
    const start = () => h.T.create({ teamId: 'haas', store: h.store, baseline, candidate: before, launch: () => new Promise(() => {}) });
    start();
    h.T.attempt('baseline');
    if (change === 'career seed') seed++; else if (change === 'career slot') slot++; else active = true;
    h.T.cancel();
    assert.ok(saved.has('apex26.setupTrialRecover'), change);
    assert.equal(start(), false, 'another garage cannot replace the outstanding journal');
    assert.equal(h.S.get('haas').arbF, baseline.arbF, 'another scoped setup is untouched');
    active = change !== 'free-play to career'; slot = 1; seed = 101;
    assert.equal(reloadable(saved, opts).S.get('haas').arbF, 8);
  }
});
