import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { makeDom } from '../helpers/mini-dom.mjs';
const code = fs.readFileSync(new URL('../../js/ui/experience.js', import.meta.url), 'utf8');
const ctx = vm.createContext({}); vm.runInContext(code + ';globalThis.api=UiExperience;', ctx);
test('Home solo practice stays in sync with the coach and does not offer goals requiring rivals', () => {
  const dom = makeDom({ tagFor: id => id === 'practice-goal' ? 'select' : 'div' });
  let selected = 'lap', opens = 0;
  const coach = { paint() {}, practiceGoal: () => selected, setPracticeGoal(id) { selected = id; return true; } };
  const sandbox = { document: dom.document, MutationObserver: class { observe() {} },
    HomeWorld: { create: () => ({ end() {}, active: () => false, state: () => ({}) }) },
    GameStore: { store: { get: (_key, value) => value, set() {} } }, TitleFx: { mode: () => 'on' },
    AppearanceStudio: { scene: () => ({ mode: 'garage', motion: 'still' }), homeCamera: () => 'auto', onSceneChange() {} },
    addEventListener() {} };
  sandbox.window = sandbox;
  const local = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL('../../js/race/race-insights.js', import.meta.url), 'utf8'), local);
  vm.runInContext(code + ';globalThis.api=UiExperience;', local);
  const G = { $: dom.byId, state: 'menu', setupPreviewOn: false };
  local.api.create(G, { coach, trackReady: () => true, openPractice: () => opens++ });
  const goal = dom.byId('practice-goal'), button = dom.byId('mb-practice');
  const offered = Array.from(goal.children, option => option.value);
  assert.ok(offered.includes('lap') && offered.includes('launch'));
  for (const id of ['start', 'slipstream', 'overtake', 'defend', 'backmarkers']) assert.ok(!offered.includes(id), id);
  button.onclick(); assert.equal(goal.value, 'lap'); assert.equal(opens, 1);
  assert.equal(local.api.isPracticePick(), true);
  goal.value = 'corner'; goal.onchange(); assert.equal(selected, 'corner');
  coach.setPracticeGoal('sector'); button.onclick(); assert.equal(goal.value, 'sector');
  coach.setPracticeGoal('overtake'); button.onclick(); assert.equal(goal.value, 'free'); assert.equal(selected, 'free');
  assert.equal(dom.byId('practice-brief').hidden, false);
  local.api.leavePracticePick();
  assert.equal(local.api.isPracticePick(), false);
  assert.equal(dom.byId('practice-brief').hidden, true, 'Daily or another door must drop the Practice Session plate');
});
test('pause context reads live classification and distinguishes online practice', () => {
  const p = {lap: 2}, G = { player:p, ranked:[{},p], track:{def:{name:'Monza'}}, session:'race', lapsTarget:12, practice:true, netPlay:{active:()=>true} };
  const b = ctx.api.raceBrief(G);
  assert.equal(b.title, 'Monza'); assert.match(b.detail,/P2/); assert.match(b.detail,/LAP 2 \/ 12/); assert.match(b.detail,/PRACTICE/); assert.match(b.detail,/RACE CONTINUES/);
  G.timeTrial = true; G.session = 'tt'; G.netPlay.active=()=>false;
  assert.doesNotMatch(ctx.api.raceBrief(G).detail,/P2|\/ 12|ONLINE/);
});
test('task doors retain canonical close and settings destinations', () => {
  const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
  for(const id of ['mb-watch','mb-practice','mb-photo','menu-explore','pm-strategy','pm-review','pm-photo','pm-checkpoint-save']) assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/id="menu-explore"[\s\S]*id="mb-watch"[\s\S]*id="mb-practice"[\s\S]*id="mb-photo"[\s\S]*id="mb-garage"/);
  assert.doesNotMatch(html,/id="menu-secondary"[\s\S]*id="mb-photo"/);
  assert.doesNotMatch(html,/id="menu-secondary"[\s\S]*id="mb-garage"/);
  assert.match(html,/id="mb-photo"[\s\S]*CAPTURE/);
  assert.match(code,/function setDoorLabel/);
  assert.match(code,/sub && sub\.parentNode/,
    "setDoorLabel must tolerate game-vm's detached querySelector stub");
  assert.doesNotMatch(code,/photoButton\.textContent\s*=/);
  assert.match(html,/id="photo-studio"[^>]*data-esc-close="ps-close"/);
  assert.match(code,/openSettingsPage\("driving", "pm-pit-panel"\)/);
  assert.match(code,/openSettingsPage\("driving", "pm-session-review"\)/);
});

test('Home varies real environments and shots per visit, preserving the shot through redraws', () => {
  let saved=0; const writes=[];
  const store={get:()=>saved,set:(_key,v)=>{saved=v;writes.push(v);}};
  const picker=ctx.api.homeVariation(store);
  assert.deepEqual(JSON.parse(JSON.stringify(picker.enter('auto','auto'))),{mode:'garage',shot:'hero'});
  picker.enter('auto','auto'); picker.peek('auto','auto');
  assert.equal(writes.length,1,'redraw, resize, and preview do not advance the visit');
  picker.leave(); assert.equal(picker.enter('auto','auto').mode,'track');
  picker.leave(); assert.equal(picker.enter('garage','side').shot,'side');
  picker.leave(); assert.equal(picker.enter('auto','auto').mode,'pitlane');
  const reload=ctx.api.homeVariation(store);
  assert.equal(reload.enter('auto','auto').mode,'studio','variation persists across reload');
  assert.deepEqual(writes,[1,2,3,4,5]);
});

test('Invalid visit metadata is bounded; a fixed Home camera survives changing environments', () => {
  const picker=ctx.api.homeVariation({get:()=>Infinity,set:()=>{}});
  assert.equal(picker.enter('track','front').shot,'front');
  picker.leave(); assert.equal(picker.enter('night','front').shot,'front');
});

test('an unready outdoor Photo request retains its caller instead of acquiring a garage camera', () => {
  let opened=0,waiting=0; const settings={hidden:false}, garage={hidden:true}, pause={hidden:false};
  const G={paused:false,$:id=>({pmsettings:settings,carsetup:garage,pausemenu:pause})[id]};
  const deps={source:'home',trackHome:true,trackReady:false,onWaiting:()=>waiting++,photoStudio:{open:()=>{opened++;return true;}}};
  assert.equal(ctx.api.openPhoto(G,deps),false);
  assert.equal(opened,0);assert.equal(waiting,1);assert.equal(settings.hidden,false);assert.equal(pause.hidden,false);assert.equal(G.paused,false);
});

test('Photo retains the selected mixed environment after Settings covers Home, then the next Home visit advances once', () => {
  let next=0,writes=0;const picker=ctx.api.homeVariation({get:()=>next,set:(_key,value)=>{next=value;writes++;}});
  const original=picker.enter('auto','auto');picker.leave();
  for(let i=0;i<4;i++)assert.deepEqual(JSON.parse(JSON.stringify(picker.enter('auto','auto',true))),JSON.parse(JSON.stringify(original)));
  assert.equal(writes,1,'opening Photo or resizing it cannot select a different renderer owner');
  picker.leave();assert.equal(picker.enter('auto','auto').mode,'track');assert.equal(writes,2);
  picker.enter('auto','auto');assert.equal(writes,2,'the normal Home redraw still holds its visit');
});

test('Home Photo keeps its manual camera through resize and temporary hiding, then releases it on DONE', () => {
  const dom = makeDom();
  for (const id of ['photo-studio', 'pmsettings', 'pm-panel-appearance', 'carsetup']) dom.byId(id).hidden = true;
  dom.byId('menu-buttons')._rect = { left: 900, top: 120, right: 1350, bottom: 780, width: 450, height: 660 };
  let current = { shot: 'garage-before-Home', dist: 8 }, saved = null, owned = false;
  const setupCam = {
    captureCamera: () => ({ ...current }), restoreCamera: value => { current = { ...value }; },
    beginHome(_mode, opts) { if (!owned) saved = { ...current }; owned = true; current = { shot: opts.shot, dist: 8.35 }; return true; },
    endHome() { if (owned) { current = saved; owned = false; } }, homeState: () => owned ? {} : null, renderHome: () => true,
  };
  const sandbox = { document: dom.document, MutationObserver: class { observe() {} }, innerWidth: 1440, innerHeight: 900,
    HomeWorld: { create: () => ({ end() {}, active: () => false, wantsTrack: () => false, state: () => ({}) }) },
    GarageExperience: { freePane: () => ({ left: 0, right: .6, top: 0, bottom: 1 }) },
    GameStore: { store: { get: (_key, value) => value, set() {} } }, TitleFx: { mode: () => 'on' },
    AppearanceStudio: { scene: () => ({ mode: 'garage', motion: 'still' }), homeCamera: () => 'hero', onSceneChange() {} },
    addEventListener() {}, setTimeout, clearTimeout, Log: { warn() {} } };
  sandbox.window = sandbox;
  const local = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL('../../js/race/race-insights.js', import.meta.url), 'utf8'), local);
  vm.runInContext(code + ';globalThis.api=UiExperience;', local);
  const ui = local.api.create({ $: dom.byId, state: 'menu', setupPreviewOn: false }, { setupCam, trackReady: () => true });
  ui.renderHome(1 / 60); dom.byId('photo-studio').hidden = false; ui.renderHome(1 / 60);
  current = { shot: 'manual-top-orbit', dist: 4.6 };
  sandbox.innerWidth = 900; sandbox.innerHeight = 1440; ui.renderHome(1 / 60);
  assert.deepEqual(current, { shot: 'manual-top-orbit', dist: 4.6 });
  dom.document.hidden = true; assert.equal(ui.renderHome(1 / 60), false);
  dom.document.hidden = false; ui.renderHome(1 / 60);
  assert.deepEqual(current, { shot: 'manual-top-orbit', dist: 4.6 });
  dom.byId('overlay').hidden = true; ui.renderHome(1 / 60);
  dom.byId('overlay').hidden = false; ui.renderHome(1 / 60);
  assert.deepEqual(current, { shot: 'manual-top-orbit', dist: 4.6 });
  dom.byId('photo-studio').hidden = true; ui.renderHome(1 / 60);
  assert.equal(current.shot, 'hero', 'DONE resumes the configured Home shot');
  dom.byId('photo-studio').hidden = false; ui.renderHome(1 / 60);
  assert.equal(current.shot, 'hero', 'a later photo cannot inherit the discarded manual pose');
  ui.stopHome(); assert.deepEqual(current, { shot: 'garage-before-Home', dist: 8 });
});

test('narrow resize does not stopHome/beginHome; debounced settle only calls gfx.resize', () => {
  assert.match(code, /const sig = s\.mode \+ ":" \+ s\.shot \+ ":" \+ motion \+ ":" \+ photoOpen;/);
  assert.doesNotMatch(code, /const sig = [^;\n]*innerWidth/);
  assert.match(code, /HOME_RESIZE_MS/);
  assert.match(code, /viewKey\s*=\s*String\(homeViewGen\)/);
  const dom = makeDom();
  for (const id of ['photo-studio', 'pmsettings', 'pm-panel-appearance', 'carsetup']) dom.byId(id).hidden = true;
  let begins = 0, ends = 0, resizes = 0, owned = false;
  const timers = [];
  const setupCam = {
    captureCamera: () => ({}), restoreCamera() {},
    beginHome() { begins++; owned = true; return true; },
    endHome() { ends++; owned = false; }, homeState: () => owned ? {} : null, renderHome: () => true,
  };
  const listeners = {};
  const sandbox = { document: dom.document, MutationObserver: class { observe() {} }, innerWidth: 1280, innerHeight: 720,
    HomeWorld: { create: () => ({ end() {}, active: () => false, wantsTrack: () => false, state: () => ({}) }) },
    GarageExperience: { freePane: () => ({ left: 0, right: .6, top: 0, bottom: 1 }) },
    GameStore: { store: { get: (_key, value) => value, set() {} } }, TitleFx: { mode: () => 'on' },
    AppearanceStudio: { scene: () => ({ mode: 'garage', motion: 'still' }), homeCamera: () => 'hero', onSceneChange() {} },
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    setTimeout(fn, ms) { const id = timers.length; timers.push({ fn, ms }); return id; },
    clearTimeout(id) { if (timers[id]) timers[id].fn = null; },
    Log: { warn() {} } };
  sandbox.window = sandbox;
  const local = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL('../../js/race/race-insights.js', import.meta.url), 'utf8'), local);
  vm.runInContext(code + ';globalThis.api=UiExperience;', local);
  const gfx = { resize() { resizes++; } };
  const ui = local.api.create({ $: dom.byId, state: 'menu', setupPreviewOn: false, gfx }, { setupCam, trackReady: () => true });
  ui.renderHome(1 / 60);
  assert.equal(begins, 1);
  sandbox.innerWidth = 500; sandbox.innerHeight = 900;
  ui.renderHome(1 / 60);
  assert.equal(begins, 1, 'viewport change alone must not beginHome again');
  assert.equal(ends, 0, 'viewport change alone must not endHome');
  assert.equal(dom.byId('overlay').dataset.homeReady, '1', 'homeReady stays while session lives');
  assert.ok(listeners.resize && listeners.resize.length, 'resize listener registered');
  listeners.resize.forEach((fn) => fn());
  assert.equal(resizes, 0, 'resize is debounced');
  assert.equal(timers.length, 1);
  timers[0].fn();
  assert.equal(resizes, 1, 'settle calls gfx.resize once');
  assert.equal(begins, 1);
});

test('previewScene skips software GL and downscales capture edges', async () => {
  assert.match(code, /previewSoftGfx/);
  assert.match(code, /PREVIEW_MAX_EDGE\s*=\s*512/);
  assert.doesNotMatch(code, /previewKey\s*=\s*\[[^\]]*innerWidth/);
  const dom = makeDom();
  for (const id of ['photo-studio', 'carsetup']) dom.byId(id).hidden = true;
  dom.byId('pmsettings').hidden = false;
  dom.byId('pm-panel-appearance').hidden = false;
  let begins = 0, frames = [];
  const setupCam = {
    captureCamera: () => ({}), restoreCamera() {},
    beginHome() { begins++; return true; }, endHome() {}, homeState: () => ({}), renderHome: () => true,
  };
  const sandbox = { document: dom.document, MutationObserver: class { observe() {} }, innerWidth: 1280, innerHeight: 720,
    HomeWorld: { create: () => ({ end() {}, active: () => false, wantsTrack: () => false, state: () => ({}) }) },
    GarageExperience: { freePane: () => ({ left: 0, right: .6, top: 0, bottom: 1 }) },
    GameStore: { store: { get: (_key, value) => value, set() {}, rev: 1 } }, TitleFx: { mode: () => 'on' },
    AppearanceStudio: {
      scene: () => ({ mode: 'garage', motion: 'still', shot: 'hero' }), homeCamera: () => 'hero', onSceneChange() {},
      setPreviewFrame(url) { frames.push(url); return true; },
    },
    addEventListener() {}, setTimeout, clearTimeout, queueMicrotask,
    requestAnimationFrame: (fn) => { fn(); return 1; },
    ImageData: class ImageData { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } },
    Uint8ClampedArray, Log: { warn() {}, debug() {} },
    performance: { now: () => 0 },
  };
  sandbox.window = sandbox;
  const local = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL('../../js/race/race-insights.js', import.meta.url), 'utf8'), local);
  vm.runInContext(code + ';globalThis.api=UiExperience;', local);
  // Soft path: no beginHome / no frame
  const softGfx = { softPresent: () => true, backendState: () => ({ softwareGL: true }) };
  const uiSoft = local.api.create({ $: dom.byId, state: 'menu', setupPreviewOn: false, gfx: softGfx, teamIdx: 0 },
    { setupCam, trackReady: () => true });
  await uiSoft.previewScene({ mode: 'garage', shot: 'hero' });
  assert.equal(begins, 0, 'software GL skips garage capture');
  assert.equal(frames.length, 0);
  // Hardware path: capture downscales a 1024 edge to PREVIEW_MAX_EDGE
  begins = 0; frames = [];
  const pixels = { width: 1024, height: 768, data: new Uint8ClampedArray(1024 * 768 * 4) };
  const hardGfx = {
    softPresent: () => false, backendState: () => ({ softwareGL: false }),
    warming: () => false, capturePixels: async () => pixels,
  };
  // Fresh module instance so previewMode latch from soft skip does not suppress hard
  const local2 = vm.createContext({ ...sandbox, document: dom.document });
  local2.window = local2;
  vm.runInContext(fs.readFileSync(new URL('../../js/race/race-insights.js', import.meta.url), 'utf8'), local2);
  vm.runInContext(code + ';globalThis.api=UiExperience;', local2);
  const uiHard = local2.api.create({ $: dom.byId, state: 'menu', setupPreviewOn: false, gfx: hardGfx, teamIdx: 0 },
    { setupCam, trackReady: () => true });
  // Canvas stub for downscale
  const canvases = [];
  local2.document.createElement = (tag) => {
    if (tag !== 'canvas') return dom.document.createElement(tag);
    const c = { width: 0, height: 0, getContext() {
      return {
        putImageData() {},
        drawImage(src) { c._from = src && { w: src.width, h: src.height }; },
      };
    }, toDataURL() { return `data:image/jpeg;${c.width}x${c.height}`; } };
    canvases.push(c);
    return c;
  };
  await uiHard.previewScene({ mode: 'garage', shot: 'hero' });
  assert.equal(begins, 1);
  assert.equal(frames.length, 1);
  assert.match(frames[0], /512x384/, 'preview capture is capped at PREVIEW_MAX_EDGE');
});

test('a Home Photo SUBJECT pick closes the studio, swaps the scene for the visit and reopens through the door; DONE restores', async () => {
  const settings={hidden:false}, garage={hidden:true}, pause={hidden:false};
  const G={paused:false,teamIdx:0,track:{def:{name:'Monza'}},$:id=>({pmsettings:settings,carsetup:garage,pausemenu:pause})[id]};
  ctx.Teams={LIST:[{name:'McLaren'}]};
  const log=[]; let opened=null, back=null;
  const studio={open:(o)=>{opened=o;back=o.back;log.push('open:'+o.source);return true;},close:(b)=>log.push('close:'+b)};
  const deps={source:'home',trackHome:false,trackReady:true,photoStudio:studio,setPaused:()=>{},
    photoSubject:(m)=>{log.push('subject:'+m);return Promise.resolve(m!=='garage');},reopen:()=>{log.push('reopen');return true;},onDone:()=>log.push('done')};
  assert.equal(ctx.api.openPhoto(G,deps),true);
  assert.equal(typeof opened.subject,'function','the Home door offers a subject switch');
  assert.equal(settings.hidden,true,'the caller is hidden under the studio');
  assert.equal(await opened.subject('circuit'),true);
  assert.deepEqual(log,['open:home','close:false','subject:circuit','reopen'],'close, swap, reopen through the door');
  assert.equal(settings.hidden,false,'the caller comes back before the reopen so the reopened studio restores it on DONE');
  log.length=0; settings.hidden=true;
  assert.equal(await opened.subject('garage'),true);
  assert.deepEqual(log,['close:false','subject:garage','subject:null','reopen'],'a swap that fails hands the scene back before reopening');
  log.length=0; back();
  assert.deepEqual(log,['done'],'DONE clears the visit override');
  assert.equal(settings.hidden,false);
  const race={...deps,source:'race'}; opened=null;
  assert.equal(ctx.api.openPhoto(G,race),true);
  assert.equal(opened.subject,null,'the pause-menu door is on the circuit already: no subject');
});

test('photoSubject lays a scene over the stored one for the visit only, resolves on the rendered swap, and never writes the store', async () => {
  const dom = makeDom();
  for (const id of ['photo-studio', 'pmsettings', 'pm-panel-appearance', 'carsetup']) dom.byId(id).hidden = true;
  const writes=[]; let trackReady=false, worldRendered=false;
  const setupCam = { captureCamera: () => ({}), restoreCamera() {}, beginHome: () => true, endHome() {}, homeState: () => ({}), renderHome: () => true };
  const sandbox = { document: dom.document, MutationObserver: class { observe() {} }, innerWidth: 1440, innerHeight: 900,
    HomeWorld: { create: (_G, d) => ({ begin() { if (d.prepareTrack) d.prepareTrack(); return true; }, end() {}, active: () => worldRendered, wantsTrack: () => true, needsFrame: () => true, camera: () => null, didRender: () => worldRendered, state: () => ({}) }) },
    GarageExperience: { freePane: () => ({ left: 0, right: .6, top: 0, bottom: 1 }) },
    GameStore: { store: { get: (_key, value) => value, set(k, v) { writes.push([k, v]); } } }, TitleFx: { mode: () => 'on' },
    AppearanceStudio: { scene: () => ({ mode: 'garage', motion: 'still' }), homeCamera: () => 'hero', onSceneChange() {} },
    addEventListener() {}, Log: { warn() {} }, setTimeout, Date };
  sandbox.window = sandbox;
  const local = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL('../../js/race/race-insights.js', import.meta.url), 'utf8'), local);
  vm.runInContext(code + ';globalThis.api=UiExperience;', local);
  const G = { $: dom.byId, state: 'menu', setupPreviewOn: false };
  const ui = local.api.create(G, { setupCam, trackReady: () => trackReady, prepareTrack: () => { trackReady = true; } });
  ui.renderHome(1 / 60);
  assert.equal(ui.state().scene.mode, 'garage');
  const overlay = dom.byId('overlay');
  assert.equal(overlay.dataset.homeReady, '1', 'the garage home has painted');
  const swap = ui.photoSubject('circuit');
  assert.equal(ui.state().scene.mode, 'track', 'the circuit is the scene for this visit');
  assert.equal(overlay.dataset.homeReady, undefined, 'the old scene no longer reads as ready');
  assert.equal(dom.byId('mb-photo').textContent, 'SCENE LOADING…');
  ui.renderHome(1 / 60);   // begins the track world (prepareTrack) with the studio still closed: the override survives
  assert.equal(ui.state().scene.mode, 'track');
  worldRendered = true; ui.didRenderTrack();
  assert.equal(await swap, true);
  assert.equal(dom.byId('mb-photo').textContent, 'PHOTO STUDIO');
  ui.photoSubject(null);
  assert.equal(ui.state().scene.mode, 'garage', 'DONE hands the stored scene back');
  assert.deepEqual(writes.filter(([k]) => k === 'homeScene'), [], 'the Home scene setting is never written');
  // A newer pick supersedes a pending one.
  const first = ui.photoSubject('circuit'); const second = ui.photoSubject('garage');
  ui.renderHome(1 / 60);
  assert.equal(await first, false); assert.equal(await second, true);
  ui.photoSubject(null);
});

test("Home stamp survives game-vm's detached querySelector stub", () => {
  const dom = makeDom();
  const btn = dom.byId("mb-photo");
  btn.querySelector = () => ({ parentNode: null });
  const sandbox = { document: dom.document, MutationObserver: class { observe() {} },
    HomeWorld: { create: () => ({ end() {}, active: () => false, state: () => ({}) }) },
    GameStore: { store: { get: (_key, value) => value, set() {} } }, TitleFx: { mode: () => "on" },
    AppearanceStudio: { scene: () => ({ mode: "garage", motion: "still" }), homeCamera: () => "auto", onSceneChange() {} },
    addEventListener() {} };
  sandbox.window = sandbox;
  const local = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL('../../js/race/race-insights.js', import.meta.url), 'utf8'), local);
  vm.runInContext(code + ";globalThis.api=UiExperience;", local);
  const G = { $: dom.byId, state: "menu", setupPreviewOn: false };
  assert.doesNotThrow(() => local.api.create(G, { trackReady: () => true }));
  assert.equal(btn.textContent, "PHOTO STUDIO");
});

test("renderHome yields the game loop when setupCam Home ended out-of-band", () => {
  const dom = makeDom();
  for (const id of ['photo-studio', 'pmsettings', 'pm-panel-appearance', 'carsetup']) dom.byId(id).hidden = true;
  let owned = false, begins = 0;
  const setupCam = {
    captureCamera: () => ({}), restoreCamera() {},
    beginHome() { begins++; owned = true; return true; },
    endHome() { owned = false; },
    homeState: () => owned ? { motion: "ambient" } : null,
    renderHome() { return owned; },
  };
  const sandbox = { document: dom.document, MutationObserver: class { observe() {} }, innerWidth: 1440, innerHeight: 900,
    HomeWorld: { create: () => ({ end() {}, active: () => false, wantsTrack: () => false, state: () => ({}) }) },
    GarageExperience: { freePane: () => ({ left: 0, right: .6, top: 0, bottom: 1 }) },
    GameStore: { store: { get: (_key, value) => value, set() {} } }, TitleFx: { mode: () => 'on' },
    AppearanceStudio: { scene: () => ({ mode: 'garage', motion: 'ambient' }), homeCamera: () => 'hero', onSceneChange() {} },
    addEventListener() {}, setTimeout, clearTimeout, Log: { warn() {} } };
  sandbox.window = sandbox;
  const local = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL('../../js/race/race-insights.js', import.meta.url), 'utf8'), local);
  vm.runInContext(code + ';globalThis.api=UiExperience;', local);
  const ui = local.api.create({ $: dom.byId, state: 'menu', setupPreviewOn: false }, { setupCam, trackReady: () => true });
  assert.equal(ui.renderHome(1 / 24), true);
  assert.equal(begins, 1);
  setupCam.endHome();
  assert.equal(ui.renderHome(1 / 24), false, "dead setupCam session must not swallow the garage turntable");
});

test("renderHome yields under still/reduce when setupCam Home ended out-of-band", () => {
  // Reduce-motion paints once then hits the still throttle without calling
  // renderHome — homeState must be checked before that early return.
  const dom = makeDom();
  for (const id of ['photo-studio', 'pmsettings', 'pm-panel-appearance', 'carsetup']) dom.byId(id).hidden = true;
  let owned = false;
  const setupCam = {
    captureCamera: () => ({}), restoreCamera() {},
    beginHome() { owned = true; return true; },
    endHome() { owned = false; },
    homeState: () => owned ? { motion: "still" } : null,
    renderHome() { return owned; },
  };
  const sandbox = { document: dom.document, MutationObserver: class { observe() {} }, innerWidth: 1440, innerHeight: 900,
    HomeWorld: { create: () => ({ end() {}, active: () => false, wantsTrack: () => false, state: () => ({}) }) },
    GarageExperience: { freePane: () => ({ left: 0, right: .6, top: 0, bottom: 1 }) },
    GameStore: { store: { get: (_key, value) => value, set() {} } }, TitleFx: { mode: () => 'reduce' },
    AppearanceStudio: { scene: () => ({ mode: 'garage', motion: 'ambient' }), homeCamera: () => 'hero', onSceneChange() {} },
    addEventListener() {}, setTimeout, clearTimeout, Log: { warn() {} } };
  sandbox.window = sandbox;
  const local = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL('../../js/race/race-insights.js', import.meta.url), 'utf8'), local);
  vm.runInContext(code + ';globalThis.api=UiExperience;', local);
  const ui = local.api.create({ $: dom.byId, state: 'menu', setupPreviewOn: false }, { setupCam, trackReady: () => true });
  assert.equal(ui.renderHome(1 / 60), true, "first still frame paints");
  assert.equal(ui.renderHome(1 / 60), true, "painted still throttle holds the title");
  setupCam.endHome();
  assert.equal(ui.renderHome(1 / 60), false, "still throttle must not swallow after endHome");
});

test("Home ambient motion comes from AppearanceStudio, never a stale variation own-property", () => {
  assert.match(code, /s\.motion = selected\.motion;/);
  assert.doesNotMatch(code, /s\.motion = \(varied && varied\.motion\) \|\| selected\.motion;/);
});
