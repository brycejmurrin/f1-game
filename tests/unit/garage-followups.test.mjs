import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { makeDom } from '../helpers/mini-dom.mjs';
const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const sheet = read('js/garage/setup-sheet.js');
const plain = v => JSON.parse(JSON.stringify(v));
function tuneFixture() {
  const dom = makeDom(), saved = new Map();
  const context = vm.createContext({ document: dom.document, GameStore: { store: {
    get: (k, d) => saved.get(k) ?? d, set: (k, v) => v === undefined ? saved.delete(k) : saved.set(k, v),
  } }, PhysicsConsts: { BB_REF: .56, LAT_MAX: 20 }, csVisitTunes: new Map(), csTuneExperiments: new Map(),
    $: id => dom.byId(id), csLabel: text => { const n = dom.document.createElement('h3'); n.textContent = text; return n; },
    renderStatBars() {}, csTabId: x => x, getTeamParts: () => ({}), GameAudio: {},
    Parts: { RH_GAIN: .06, aeroLoad: (_p, _t, tune) => Math.min(1, Math.max(0, 1 + .06 * (tune?.rake || 0))) }, G: { soundOn: false, $: id => dom.byId(id), getTeamParts: () => ({}) },
  });
  vm.runInContext(read('js/garage/setup-tune.js') + '; globalThis.S = SetupTune;', context);
  vm.runInContext(read("js/garage/setup-experiments.js") + ";globalThis.experiments = SetupExperiments.create(G, () => {});", context);
  const team = { id: 'haas', short: 'HAA' }, container = dom.byId('fixture');
  const build = () => { container.replaceChildren(); context.experiments.build(container, team); };
  const button = text => container.querySelectorAll('button').find(b => b.textContent === text);
  const input = k => container.querySelectorAll('input').find(n => n.dataset.csTune === k);
  return { context, S: context.S, team, build, button, input, container };
}
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
  const source = read('js/garage/scene.js'), start = source.indexOf('function uploadLive('), end = source.indexOf('// Squeegeed resin:', start);
  let attempts = 0, now = 0;
  const c = vm.createContext({ roomKeys: () => ({ geom: 'g', live: 'l', dressId: 'd', key: 'k' }), performance: { now: () => now },
    cacheKey: 'k', shellMesh: {}, geomKey: 'g', liveKey: 'l', liveTex: null, liveCanvas: {}, liveMesh: { mid: {} },
    liveFail: 0, liveRetryAt: 0, dressTex: {}, dressFail: 0, dressRetryAt: 0, dressIdKey: 'd', dressFullKey: 'd|b',
    boardKey: () => 'b', paintLive() {}, GarageExperience: { paintCareer() {} }, LiveryTex: {},
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
test('coverage cache remeasures same-sized dock changes and panel identity, but not stable frames', () => {
  const source = read('js/garage/setup-camera.js');
  const start = source.indexOf('  const canvasEl = $("game"), panelEl ='), end = source.indexOf('  // FIT THE VISIBLE REGION', start);
  let side = 'right', reads = 0;
  const canvas = { clientWidth: 1000, clientHeight: 700, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 700 }) };
  let panel = { clientWidth: 400, clientHeight: 700, getBoundingClientRect: () => { reads++; return { left: side === 'right' ? 600 : 0, top: 0, width: 400, height: 700 }; } };
  const c = vm.createContext({ $: id => id === 'game' ? canvas : id === 'cs-inner' ? panel : null, home: { active: false }, setupPreviewSpin: false,
    arriving: null, window: {}, document: { documentElement: { getAttribute: () => side } }, _covKey: '', _covPanel: null, _covCanvas: null, _covCam: null,
    _covX: 0, _covY: 0, _covPr: {}, _covCr: {}, _stampRect: (out, v) => Object.assign(out, v), panelCover: pr => ({ x: pr.left ? .4 : -.4, y: 0 }),
  });
  vm.runInContext('function frame(){' + source.slice(start, end) + ' return panelFrac; }', c);
  assert.equal(c.frame(), .4); assert.equal(c.frame(), .4); assert.equal(reads, 1);
  side = 'left'; assert.equal(c.frame(), -.4); assert.equal(reads, 2);
  panel = { ...panel }; c.frame(); assert.equal(reads, 3);
});
test('deferred garage builds cannot run after hide or clear a newer visit busy state', () => {
  const dom = makeDom(), queue = []; let builds = 0;
  const c = vm.createContext({ document: dom.document, $: id => dom.byId(id), Log: { info() {} },
    els: { select: dom.byId('select'), overlay: dom.byId('overlay') }, G: { teamIdx: 0 }, Teams: { LIST: [{ id: 'haas' }] },
    tuneExperiments: { visit() {} }, SetupTune: { get: () => ({ arbF: 5 }) }, csVisitGeneration: 0, csVisitTunes: new Map(), csTuneExperiments: new Map(),
    requestAnimationFrame: cb => queue.push(cb), buildSetup: () => builds++,
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
    GameAudio: {}, ScrollFade: { refresh() {} }, Car3D: { FINISH_SURFACE: {} },
    LiveryTex: { NUM_FONT_IDS: ['default'], SPONSOR_PACK_IDS: ['default'], SPINE_LOGO_IDS: ['stripe', 'contours'], FILL_SURFACES: [] },
  });
  context.window = context;
  const run = path => vm.runInContext(read(path), context, { filename: path });
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
    teamSwatch: () => document.createElement('span'), setTeamPicker() {}, openCustomize() {}, livDraftOverride: null, _spMeshKey: '',
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
  const colour = row.querySelector('input'); colour.value = '#00ff00'; colour.oninput(); colour.onchange();
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
 const G={$:()=>pause,quitToMenu:()=>calls.push(['quit',h.S.get('haas').arbF]),openGarageFrom:from=>calls.push(['garage',from])};
 const ui=h.T.mountPause(G);assert.equal(h.T.mountPause(G),ui,'mount is idempotent');assert.equal(ui.section.hidden,true);
 h.begin();await h.T.attempt('baseline');h.T.record({mode:'launch',clean:true,score:3},h.context());await h.T.attempt('candidate');
 const buttons=ui.section.querySelectorAll('button');buttons.find(b=>b.textContent==='RETURN TO SETUP COMPARISON').onclick();assert.equal(h.T.active(),true);assert.equal(h.T.summary().receipts.length,2);assert.equal(h.T.summary().receipts[0].valid,true);assert.equal(h.T.summary().receipts[1].valid,false);assert.deepEqual(calls.map(x=>x[0]),['quit','garage']);
 buttons.find(b=>b.textContent==='CANCEL SETUP COMPARISON').onclick();assert.equal(calls[2][0],'quit');assert.equal(calls[2][1],h.candidate.arbF,'session stops before store restoration');assert.deepEqual(plain(h.S.get('haas')),plain(h.baseline));assert.equal(h.T.active(),false);assert.equal(ui.section.hidden,true);ui.dispose();
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
