import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));
function element() {
  const e = new EventTarget();
  e.textContent = ''; e.value = ''; e.style = { setProperty() {} }; e.hidden = false; e.isConnected = true;
  e.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  e.dataset = {}; e.children = [];
  e.setAttribute = (k, v) => { e[k] = v; }; e.getAttribute = () => null; e.removeAttribute = () => {};
  e.getClientRects = () => [{}]; e.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 });
  e.setPointerCapture = () => {}; e.releasePointerCapture = () => {}; return e;
}
function emit(el, type, fields = {}) {
  const e = new Event(type, { cancelable: true }); Object.assign(e, fields); el.dispatchEvent(e); return e;
}
function boot() {
  const clock = { t: 100 }, intervals = new Map(); let timer = 0;
  const document = element(), window = element(); document.visibilityState = 'visible';
  const ctx = vm.createContext({ console, Math, Date, URL, Event, EventTarget, TextEncoder, TextDecoder, ArrayBuffer, Uint8Array, DataView,
    document, window, navigator: {}, performance: { now: () => clock.t },
    setTimeout: () => ++timer, clearTimeout() {}, setInterval(f) { intervals.set(++timer, f); return timer; }, clearInterval(id) { intervals.delete(id); },
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    RTCPeerConnection: class { constructor() { this.connectionState = 'new'; } close() {} },
  });
  for (const f of ['js/net/bytes.js', 'js/net/ice.js', 'js/net/transport.js', 'js/input/tilt-roll.js', 'js/input/pedal-travel.js', 'js/input/touch-button-actions.js', 'js/input/phone-pad-codec.js', 'js/input/phone-pad-page.js', 'js/input/phone-pad.js']) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const { P, T } = vm.runInContext('({P:PhonePad,T:NetTransport})', ctx);
  return { ctx, P, T, clock, document, window, beat: () => { for (const fn of intervals.values()) fn(); } };
}
function wire() {
  const cb = {}, sent = [];
  return { status: 'open', blocked: false, sent, onMessage(f) { cb.message = f; }, onOpen() {}, onClose(f) { cb.close = f; },
    send(c, data) { if (this.blocked) return false; sent.push({ c, data }); return true; }, pump() { return 0; }, close() { this.status = 'closed'; cb.close?.('local'); },
    receive(c, data) { cb.message(c, data); } };
}
const src = { roll: () => 0, thr: () => 0, brk: () => 0, held: () => 0 };
function rtc(h) {
  const w = h.T.rtc({ role: 'guest' }), channels = {};
  for (const label of ['state', 'event']) {
    const ch = channels[label] = { label, readyState: 'open', bufferedAmount: 0, sent: [], send(data) { this.sent.push(data); }, close() {} };
    w.pc.ondatachannel({ channel: ch }); ch.onopen();
  }
  return { w, channels };
}
async function page(h, controls = {}) {
  const w = wire(), dom = { gas: element(), brake: element(), lookBack: element(), steer: element(), steeringMode: element(), health: element(), healthAge: element(),
    buttons: { pause: element(), navSelect: element(), shiftUp: element() }, ...controls };
  const ctl = h.P.pad(dom, { now: () => h.clock.t, deps: { rtc: () => w, prefetchIce: async () => null, normalise: c => c, valid: () => true, privateRelay: () => false,
    acceptInvite: async () => ({ ok: true, code: 'ANSWER' }), swap: async (o) => { await o.reply('OFFER'); return { ok: true }; } } });
  await ctl.connect('ABC234');
  return { w, dom, ctl, actions: () => w.sent.filter((m) => m.c === 'event').map((m) => h.P.decodeEvent(m.data)).filter((e) => e?.t === 'ev').map((e) => e.k) };
}
test('actual RTC backpressure preserves phone edge FIFO and retries hello without double delivery', () => {
  const h = boot(), { w, channels } = rtc(h); channels.event.bufferedAmount = 999999;
  const s = h.P.padSession(w, src, { now: () => h.clock.t, heartbeat: false });
  s.event('pause'); s.event('shiftUp'); assert.equal(s.stats().queued, 2); assert.equal(channels.event.sent.length, 0);
  channels.event.bufferedAmount = 0; channels.event.onbufferedamountlow(); s.pump(); s.pump();
  const ev = channels.event.sent.map((x) => h.P.decodeEvent(x));
  assert.deepEqual(ev.map((x) => x.t === 'ev' ? x.k : x.t), ['hi', 'pause', 'shiftUp']); assert.equal(s.stats().queued, 0); s.close();
});
test('queue expires old actions and coalesces nav repeats; long stall never floods', () => {
  const h = boot(), w = wire(); w.blocked = true;
  const s = h.P.padSession(w, src, { now: () => h.clock.t, heartbeat: false });
  for (let i = 0; i < 100; i++) s.event('navDown');
  s.event('pause'); assert.equal(s.stats().queued, 2);
  h.clock.t += 300; w.blocked = false; s.pump();
  assert.deepEqual(w.sent.map((m) => h.P.decodeEvent(m.data)).filter((e) => e?.t === 'ev').map((e) => e.k), ['pause']);
  w.blocked = true; for (let i = 0; i < 40; i++) s.event('shiftUp'); assert.equal(s.stats().queued, 24); assert.equal(s.stats().rejected, 16);
  h.clock.t += 1300; w.blocked = false; s.pump(); assert.equal(s.stats().queued, 0); assert.equal(s.stats().expired, 25); s.close();
});
test('retargeted lift releases only its pointer while another finger remains; capture alone does not release', async () => {
  const h = boot(), { ctl, dom } = await page(h);
  emit(dom.gas, 'pointerdown', { pointerId: 1, clientY: 100 }); emit(dom.lookBack, 'pointerdown', { pointerId: 2 });
  emit(dom.gas, 'lostpointercapture', { pointerId: 1 }); assert.equal(ctl.state().thr, 1);
  emit(h.document, 'pointerup', { pointerId: 1 }); emit(h.document, 'touchend', { touches: [{}] });
  assert.equal(ctl.state().thr, 0); assert.equal(ctl.state().held, 1);
  emit(h.document, 'pointercancel', { pointerId: 2 }); assert.equal(ctl.state().held, 0);
  emit(dom.gas, 'pointerdown', { pointerId: 3, clientY: 100 }); emit(dom.gas, 'pointerdown', { pointerId: 4, clientY: 100 });
  emit(h.document, 'pointerup', { pointerId: 3 }); assert.equal(ctl.state().thr, 1);
  emit(h.document, 'pointerup', { pointerId: 4 }); assert.equal(ctl.state().thr, 0); ctl.cancel();
});
test('semantic activation fires once; pointer-generated click does not double-fire', async () => {
  const h = boot(), p = await page(h);
  emit(p.dom.buttons.pause, 'click', { detail: 0 }); emit(p.dom.buttons.navSelect, 'click', { detail: 0 });
  emit(p.dom.buttons.shiftUp, 'pointerdown', { pointerId: 1 }); emit(p.dom.buttons.shiftUp, 'pointerup', { pointerId: 1 }); emit(p.dom.buttons.shiftUp, 'click', { detail: 1 });
  assert.deepEqual(p.actions(), ['pause', 'navSelect', 'shiftUp']); p.ctl.cancel();
});
test('old peer keeps v1 samples; touch requires explicit advertised capability, then centers on release', async () => {
  const h = boot(), { ctl, dom, w } = await page(h);
  w.receive('event', h.P.encodeHello('host'));
  assert.equal(ctl.setSteeringMode('touch'), false);
  emit(dom.gas, 'pointerdown', { pointerId: 1, clientY: 100 });
  assert.equal(JSON.parse(w.sent.filter((m) => m.c === 'state').at(-1).data)[0], 1);
  w.receive('event', h.P.encodeHello('host', false, true)); assert.equal(ctl.setSteeringMode('touch'), true);
  emit(dom.steer, 'pointerdown', { pointerId: 2, clientX: 50 }); emit(dom.steer, 'pointermove', { pointerId: 2, clientX: 110 });
  // A drag is coalesced under the 15 ms sample gap (audit4 UB4): the next frame's pump sends it.
  h.clock.t += 16; ctl.pump();
  let sample = h.P.decodeSample(w.sent.filter((m) => m.c === 'state').at(-1).data); assert.equal(sample.steer, 0.75); assert.equal(sample.roll, null);
  emit(h.document, 'pointerup', { pointerId: 2 }); sample = h.P.decodeSample(w.sent.filter((m) => m.c === 'state').at(-1).data); assert.equal(sample.steer, 0);
  emit(dom.steer, 'keydown', { key: 'ArrowLeft' }); assert.equal(ctl.state().steer, -1);
  emit(dom.steer, 'keyup', { key: 'ArrowLeft' }); assert.equal(ctl.state().steer, 0);
  ctl.cancel(); assert.equal(ctl.state().steer, 0); assert.equal(ctl.state().thr, 0);
});
test('input health requires an ACK for an actual sent sequence; HUD traffic cannot fake freshness', () => {
  const h = boot(), w = wire(); const s = h.P.padSession(w, src, { now: () => h.clock.t, heartbeat: false });
  s.sample(true); w.receive('state', h.P.encodeHud({ gear: 4 })); assert.equal(s.health().state, 'unavailable');
  w.receive('event', h.P.encodeHello('host', false, true)); assert.equal(s.health().state, 'waiting');
  w.receive('state', '["A",999]'); assert.equal(s.health().state, 'waiting');
  w.receive('state', '["A",0]'); assert.equal(s.health().state, 'good');
  h.clock.t += 450; w.receive('state', h.P.encodeHud({ gear: 5 })); assert.equal(s.health().state, 'degraded');
  h.clock.t += 1200; assert.equal(s.health().state, 'reconnecting');
  s.sample(true); w.receive('state', '["A",1]'); assert.equal(s.health().state, 'good'); s.close();
});
test('desktop ACKs only accepted fresh samples and tags phone ownership', () => {
  const h = boot(), w = wire(), samples = [], lost = [];
  const input = { remoteSample(s) { samples.push(s); return s.thr !== 1; }, remoteLost(s) { lost.push(s); }, remoteEvent() {}, setRemoteHaptics() {} };
  const link = h.P.link(w, { input, doc: null, now: () => h.clock.t, pump: false });
  w.receive('event', h.P.encodeHello('pad', false, true)); w.sent.length = 0;
  w.receive('state', h.P.encodeSample({ seq: 0, thr: 1 })); assert.equal(w.sent.length, 0);
  w.receive('state', h.P.encodeSample({ seq: 1, thr: 0 })); assert.deepEqual(JSON.parse(w.sent[0].data), ['A', 1]);
  w.receive('state', h.P.encodeSample({ seq: 0 })); assert.equal(w.sent.length, 1); assert.equal(samples[1].source, 'phone');
  link.close(); assert.deepEqual(lost, ['phone']);
});
test('new phone and actual desktop link negotiate touch/ACK over the real loopback transport', () => {
  const h = boot(), [pad, host] = h.T.loopback({ latencyMs: 1 }); pad.pump(h.clock.t); host.pump(h.clock.t);
  const accepted = [];
  const link = h.P.link(host, { pump: false, doc: null, now: () => h.clock.t, input: { setRemoteHaptics() {}, remoteLost() {}, remoteEvent() {}, remoteSample(s) { accepted.push(s); return true; } } });
  const s = h.P.padSession(pad, { ...src, steer: () => -.5 }, { now: () => h.clock.t, heartbeat: false });
  for (let i = 0; i < 3; i++) { h.clock.t += 2; link.pump(); s.pump(); }
  assert.equal(s.health().touchSupported, true); s.sample(true);
  for (let i = 0; i < 3; i++) { h.clock.t += 2; link.pump(); s.pump(); }
  assert.equal(accepted[0].steer, -.5); assert.equal(accepted[0].source, 'phone'); assert.equal(s.health().state, 'good'); s.close(); link.close();
});
test('window release, backgrounding and disconnect center touch steering without clearing another pointer early', async () => {
  const h = boot(), { ctl, dom, w } = await page(h); w.receive('event', h.P.encodeHello('host', false, true)); ctl.setSteeringMode('touch');
  emit(dom.steer, 'pointerdown', { pointerId: 1, clientX: 50 }); emit(dom.steer, 'pointermove', { pointerId: 1, clientX: 130 });
  emit(h.window, 'pointerup', { pointerId: 2 }); assert.equal(ctl.state().steer, 1);
  emit(h.window, 'pointerup', { pointerId: 1 }); assert.equal(ctl.state().steer, 0);
  emit(dom.steer, 'keydown', { key: 'ArrowRight' }); emit(dom.gas, 'pointerdown', { pointerId: 3, clientY: 100 });
  h.document.hidden = true; emit(h.document, 'visibilitychange'); assert.equal(ctl.state().steer, 0); assert.equal(ctl.state().thr, 0);
  emit(dom.steer, 'keydown', { key: 'ArrowRight' }); ctl.cancel(); assert.equal(ctl.state().steer, 0); assert.equal(dom.steer.hidden, true);
});

test('actual scanner stops on manual connect/cancel and invalidates pending sensor/media work', async () => {
  for (const mode of ['manual', 'qr', 'cancel', 'pending-media', 'pending-sensor', 'hidden-sensor', 'hidden-media']) {
    const h = boot(); let stops = 0, grant, media, codes = [];
    const stream = { getTracks: () => [{ stop() { stops++; } }] };
    h.ctx.navigator.mediaDevices = { getUserMedia: () => mode.includes('media') ? new Promise(r => { media = r; }) : Promise.resolve(stream) };
    class Detector { static async getSupportedFormats() { return ['qr_code']; } async detect() { return codes; } }
    h.window.BarcodeDetector = Detector;
    if (mode.includes('sensor')) h.ctx.DeviceOrientationEvent = { requestPermission: () => new Promise(r => { grant = r; }) };
    vm.runInContext(read('js/net/scan.js'), h.ctx, { filename: absSrc("js/net/scan.js") });
    const Scan = vm.runInContext('NetScan', h.ctx), dom = { body: element(), status: element(), scan: element(), scanBox: element(), video: element(), buttons: {} };
    Object.assign(dom.video, { play: async () => {}, readyState: 4, videoWidth: 640, videoHeight: 480 });
    const ctl = h.P.pad(dom, { deps: { scan: () => Scan, rtc: () => wire(), prefetchIce: async () => null,
      normalise: s => String(s).toUpperCase(), valid: s => s.length === 6, swap: async () => ({ ok: true }) } });
    const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
    const pending = ctl.scan(); await settle();
    if (mode.includes('sensor') || mode.includes('media')) {
      if (mode.startsWith('hidden')) { h.document.hidden = true; h.document.dispatchEvent(new Event('visibilitychange')); }
      else ctl.cancel();
      if (grant) grant('granted'); if (media) media(stream);
      const result = await pending; assert.equal(result.ok, false, mode);
      assert.equal(dom.video.srcObject || null, null, mode);
      assert.equal(stops, mode.includes('media') ? 1 : 0, mode);
    } else {
      assert.equal((await pending).ok, true);
      if (mode === 'manual') await ctl.connect('ABC234');
      else if (mode === 'qr') { codes = [{ rawValue: 'ABC234' }]; h.beat(); await settle(); }
      else ctl.cancel();
      assert.equal(stops, 1, mode); assert.equal(dom.video.srcObject, null, mode);
      assert.equal(dom.scanBox.hidden, true, mode);
      if (mode !== 'cancel') assert.equal(ctl.state().linked, true, mode);
    }
    ctl.cancel();
  }
});

test('an old cancelled camera start cannot hide or stop the newer scan panel', async () => {
  const h = boot(), requests = []; let oldStops = 0, newStops = 0;
  h.ctx.navigator.mediaDevices = { getUserMedia: () => new Promise(r => requests.push(r)) };
  class Detector { static async getSupportedFormats() { return ['qr_code']; } async detect() { return []; } }
  h.window.BarcodeDetector = Detector; vm.runInContext(read('js/net/scan.js'), h.ctx, { filename: absSrc("js/net/scan.js") });
  const Scan = vm.runInContext('NetScan', h.ctx), dom = { status: element(), scan: element(), scanBox: element(), video: element(), buttons: {} };
  dom.video.play = async () => {};
  const ctl = h.P.pad(dom, { deps: { scan: () => Scan } });
  const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
  const old = ctl.scan(); await settle(); assert.equal(requests.length, 1);
  assert.equal((await ctl.scan()).error, 'cancelled');
  const fresh = ctl.scan(); await settle(); assert.equal(requests.length, 2);
  const newStream = { getTracks: () => [{ stop() { newStops++; } }] };
  requests[1](newStream); assert.equal((await fresh).ok, true);
  requests[0]({ getTracks: () => [{ stop() { oldStops++; } }] }); assert.equal((await old).ok, false);
  assert.equal(dom.video.srcObject, newStream); assert.equal(dom.scanBox.hidden, false);
  assert.equal(dom.scan.textContent, 'CANCEL SCAN'); assert.equal(oldStops, 1); assert.equal(newStops, 0);
  ctl.cancel(); assert.equal(newStops, 1);
});
test('WHEEL LAYOUT (#5801): presets and per-key picks move the face keys between grips, persist, and mirror', () => {
  const h = boot(), L = vm.runInContext('PhonePadPage', h.ctx);
  const box = () => { const e = element(); e.appendChild = (c) => { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); e.children.push(c); c.parent = e; }; return e; };
  assert.deepEqual(plain(L.normaliseLayout({ zone: { overtake: 'R', boost: 'X' }, swap: 'yes' })).zone.boost, 'C', 'an unknown zone is the face');
  assert.equal(L.layoutPreset({ zone: { overtake: 'R', boost: 'R', aero: 'R' } }), 'right');
  for (const [id, left, right, pedals] of [
    ["split", ["overtake", "aero"], ["boost"], "side"],
    ["views", ["camera", "look"], ["radio"], "stack"],
  ]) {
    const preset = L.LAYOUT_PRESETS[id];
    assert.equal(L.layoutPreset(plain(preset)), id);
    const onGrip = side => plain(L.LAYOUT_KEYS.filter(k => preset.zone[k] === side));
    assert.deepEqual([onGrip("L"), onGrip("R"), preset.pedals], [left, right, pedals]);
  }
  assert.equal(L.layoutPreset({ zone: { radio: 'L' } }), 'custom');
  const saved = {}, store = { getItem: (k) => saved[k] ?? null, setItem: (k, v) => { saved[k] = v; } };
  const mk = () => {
    const keys = Object.fromEntries(L.LAYOUT_KEYS.map((k) => [k, element()])), home = box();
    for (const k of L.LAYOUT_KEYS) home.appendChild(keys[k]);
    const presets = ['classic', 'right', 'left', 'mirror'].map((p) => { const e = element(); e.dataset.preset = p; return e; });
    const dom = { body: element(), keys, home, grips: { L: box(), R: box() }, sheet: Object.assign(element(), { showModal() { this.open = true; }, close() { this.open = false; } }), open: element(), done: element(), rows: box(),
      swapBtn: element(), utilityBtn: element(), utilityTrigger: element(), utilityStore: box(), presets, doc: { createElement: () => box() } };
    return { dom, api: L.layout(dom, { store }) };
  };
  const ids = (dom, el) => el.children.map((c) => L.LAYOUT_KEYS.find((k) => dom.keys[k] === c));
  const a = mk();
  assert.equal(a.dom.rows.children.length, 8, 'one pick row per face key');
  emit(a.dom.presets[1], 'click');
  assert.deepEqual([ids(a.dom, a.dom.grips.R), ids(a.dom, a.dom.home).length, a.dom.presets[1]['aria-pressed'], JSON.parse(saved['apex26.padLayout']).zone.aero],
    [['overtake', 'boost', 'aero'], 5, 'true', 'R'], 'RIGHT THUMB: OT/BOOST/AERO by the pedals, saved');
  emit(a.dom.rows.children[4].children[1], 'click');   // RADIO → LEFT
  assert.deepEqual([ids(a.dom, a.dom.grips.L), a.dom.presets[1]['aria-pressed'], a.api.get().zone.radio], [['radio'], 'false', 'L'], 'a per-key pick makes it CUSTOM');
  emit(a.dom.swapBtn, 'click');
  assert.deepEqual([a.dom.body.dataset.swap, ids(a.dom, a.dom.grips.L), ids(a.dom, a.dom.grips.R)], ['1', ['overtake', 'boost', 'aero'], ['radio']],
    'MIRRORED: the pedal grip is on the left, so the keys that sit right go to the paddle grip');
  emit(a.dom.utilityBtn, 'click');
  assert.equal(a.dom.utilityTrigger.hidden, false);
  assert.deepEqual(ids(a.dom, a.dom.utilityStore), ['camera', 'radio', 'look']);
  const restoredWheel = mk();
  assert.equal(restoredWheel.api.get().utility, 'wheel');
  assert.deepEqual(ids(restoredWheel.dom, restoredWheel.dom.utilityStore), ['camera', 'radio', 'look']);
  emit(restoredWheel.dom.utilityBtn, 'click');
  assert.equal(restoredWheel.dom.utilityTrigger.hidden, true);
  assert.deepEqual(ids(restoredWheel.dom, restoredWheel.dom.grips.R), ['radio'], 'return to buttons preserves their zones');
  emit(a.dom.utilityBtn, 'click');
  const b = mk();
  assert.deepEqual([b.api.get(), b.dom.body.dataset.swap, ids(b.dom, b.dom.grips.L)], [a.api.get(), '1', ['overtake', 'boost', 'aero']], 'a reload restores the saved layout');
  emit(b.dom.open, 'click'); assert.equal(b.dom.sheet.open, true);
  const escape = emit(b.dom.sheet, 'cancel');
  assert.ok(escape.defaultPrevented);
  assert.equal(b.dom.sheet.open, false);
  assert.equal(b.dom.sheet.hidden, true);
  emit(b.dom.open, 'click'); emit(b.dom.done, 'click'); assert.equal(b.dom.sheet.hidden, true);
  const phoneBtn = element(); phoneBtn.dataset.preset = 'phone';
  // PHONE STYLE: tall BRAKE | GAS side by side, OT/BOOST/AERO in a column beside them.
  const e2 = (() => { const keys = Object.fromEntries(L.LAYOUT_KEYS.map((k) => [k, element()])), home = box(); for (const k of L.LAYOUT_KEYS) home.appendChild(keys[k]);
    const dom = { body: element(), keys, home, grips: { L: box(), R: box() }, presets: [phoneBtn], pedalsBtn: element(), stripBtn: element() };
    return { dom, api: L.layout(dom, { store }) }; })();
  emit(phoneBtn, 'click');
  assert.deepEqual([e2.dom.body.dataset.pedals, e2.dom.body.dataset.strip, ids(e2.dom, e2.dom.grips.R), e2.dom.pedalsBtn['aria-pressed'], L.layoutPreset(e2.api.get())],
    ['side', 'column', ['overtake', 'boost', 'aero'], 'true', 'phone'], 'PHONE STYLE');
  emit(e2.dom.stripBtn, 'click');
  assert.deepEqual([e2.dom.body.dataset.strip, L.layoutPreset(e2.api.get()), plain(L.normaliseLayout({ pedals: 'x', strip: 1 })).pedals], ['row', 'custom', 'stack'], 'a toggle edits one field; junk normalises');
});
test('MOVE & SIZE (#5801): placements normalise, keep the 44px touch floor, and a preset clears them', () => {
  const h = boot(), L = vm.runInContext('PhonePadPage', h.ctx);
  assert.deepEqual(plain(L.normaliseLayout({ place: { gas: { x: -7.1234, y: 300, s: 999 }, brake: { x: 0, y: 0, s: 100 }, 'bad id!': { x: 5 } } }).place),
    { gas: { x: -7.1, y: 90, s: 250 } }, 'clamped, rounded, a no-op or junk id dropped');
  assert.deepEqual([L.minScale(88, 200, 100), L.minScale(176, 300, 200), L.minScale(400, 400, 100)], [50, 50, 40], 'a 44px floor on the shorter side, never under 40%');
  assert.equal(L.layoutPreset({ zone: {}, place: { gas: { x: 4, y: 0, s: 100 } } }), 'custom', 'a moved control is CUSTOM');
  assert.deepEqual(plain(L.LAYOUT_PRESETS.phone.place), {}, 'presets carry no placements, so picking one puts every control back');
});

test("phone wheel edits Gas in each preset, cancels interrupted drags and writes only on Apply", () => {
  const h = boot(), L = vm.runInContext("PhonePadPage", h.ctx);
  for (const [preset, layout] of Object.entries(L.LAYOUT_PRESETS)) {
    const ui = makeDom(), stage = ui.byId("ctl"), gas = ui.makeElement("div", "gas");
    gas.textContent = "Gas"; gas.getClientRects = () => [{}];
    stage.appendChild(gas);
    const parts = Object.fromEntries(["bar","picker","adjust","edge","tools","step","undo","shape","arrangeDone","cancel","resetAll","open"].map(id => [id, ui.byId(id)]));
    const right = ui.makeElement("button"); right.dataset.nudge = "right";
    const widthUp = ui.makeElement("button"), heightUp = ui.makeElement("button"), shape = parts.shape;
    widthUp.dataset.dimension = "w"; heightUp.dataset.dimension = "h";
    widthUp.dataset.step = heightUp.dataset.step = "1";
    gas.getBoundingClientRect = () => ({ width: 160, height: 80, x: 0, y: 0 });
    const options = { ...parts, doc:ui.document, body:ui.body, stage, arrange:{gas}, nudges:[right], dimensions:[widthUp,heightUp], shape };
    const saved = [];
    const api = L.layout(options, {store:{getItem:() => JSON.stringify(layout), setItem:(k,v) => saved.push(JSON.parse(v))}});
    const send = (type, x) => {
      const e = { type, target:gas, pointerId:1, clientX:x, clientY:50, cancelable:true };
      ui.dispatch(stage, e);
      assert.ok(e.defaultPrevented && e.propagationStopped, preset + " captures " + type);
    };
    api.arrange(true);
    assert.equal(parts.picker.value, "gas"); assert.equal(parts.tools.hidden, true);
    parts.edge.click(); assert.equal(parts.bar.hasAttribute("data-bottom"), true);
    send("pointerdown", 100); send("pointermove", 180);
    assert.equal(gas.style.translate, "10vw 0vh");
    send("pointercancel", 180); assert.equal(gas.style.translate, "");
    send("pointerdown", 100); send("pointermove", 180); send("pointerup", 180);
    parts.adjust.click(); assert.equal(parts.tools.hidden, false);
    parts.step.click(); right.click();
    assert.equal(api.get().place.gas.x, 15);
    parts.undo.click(); assert.equal(api.get().place.gas.x, 10);
    parts.cancel.click(); assert.equal(saved.length, 0); assert.deepEqual(plain(api.get()), plain(layout));
    api.arrange(true);
    parts.shape.value = "shield"; ui.dispatch(parts.shape, {type:"change"});
    assert.equal(gas.getAttribute("data-wheel-shape"), "shield");
    parts.undo.click(); assert.equal(gas.hasAttribute("data-wheel-shape"), false);
    parts.shape.value = "arch"; ui.dispatch(parts.shape, {type:"change"});
    send("pointerdown", 100); send("pointermove", 180); send("pointerup", 180);
    parts.arrangeDone.click(); assert.equal(saved.length, 1);
    assert.deepEqual(saved[0], {...plain(layout), place:{gas:{x:10,y:0,s:100,shape:"arch"}}});
    assert.equal(L.normaliseLayout(saved[0]).place.gas.shape, "arch");
    api.arrange(true);
    widthUp.click(); heightUp.click(); shape.value = "rounded"; ui.dispatch(shape, {type:"change"});
    right.click(); parts.arrangeDone.click();
    const resized = saved[1].place.gas;
    assert.deepEqual([resized.x, resized.y, resized.w, resized.h, resized.s, resized.shape], [15, 0, 25, 25, 100, "rounded"]);
    api.arrange(true); parts.resetAll.click(); parts.arrangeDone.click();
    assert.deepEqual(saved[2], plain(L.LAYOUT_PRESETS.classic));
    assert.equal(gas.hasAttribute("data-wheel-shape"), false);
  }
});

test("wheel files round-trip per-control shape and independent dimensions, safely ignoring retired controls", () => {
  const L = vm.runInContext("PhonePadPage", boot().ctx), ui = makeDom(), gas = ui.byId("gas");
  const shape = { x: 0, y: 0, s: 100, w: 20, h: 30, shape: "pill" };
  const layout = { ...plain(L.LAYOUT_PRESETS.phone), place: { gas: shape, retired: { x: 10 } } };
  const file = { format: "apex26-wheel", v: 1, layout };
  const imported = L.readWheelBackup(JSON.parse(JSON.stringify(file)));
  assert.deepEqual(plain(imported.place), { gas: { ...shape, shape: "capsule" } });
  const api = L.layout({ body: ui.body, arrange: { gas } });
  api.set(imported);
  assert.deepEqual([gas.style.minWidth, gas.style.maxHeight, gas.getAttribute("data-wheel-shape")], ["max(44px,20vw)", "max(44px,30vh)", "capsule"]);
  api.sizeBy("gas", 1.1);
  assert.deepEqual([api.get().place.gas.w, api.get().place.gas.h, api.get().place.gas.shape], [20, 30, "capsule"]);
  api.set(L.LAYOUT_PRESETS.classic);
  assert.deepEqual([gas.style.maxWidth, gas.style.minHeight, gas.getAttribute("data-wheel-shape")], ["", "", null]);
  assert.throws(() => L.readWheelBackup({ ...file, v: 2 }), /Invalid wheel layout/);
  assert.throws(() => L.readWheelBackup({ ...file, layout: {} }), /Invalid wheel layout/);
});

test("manual flick shifting emits once per vertical gesture and offers accessible single shifts", async () => {
  const h = boot(), strip = element(), body = element(), up = element(), down = element();
  const p = await page(h, {body, shiftFlick: strip, flickKeys: {shiftUp: up, shiftDown: down}});
  body.dataset.shifts = "flick";
  const send = (type, x, y, id = 3, target = strip) =>
    emit(target, type, {pointerType: "touch", pointerId: id, clientX: x, clientY: y});
  send("pointerdown", 50, 50);
  send("pointermove", 50, 27);  // inside the 24px neutral zone
  send("pointermove", 90, 20);  // mostly horizontal
  send("pointerdown", 50, 50, 8);
  send("pointermove", 50, 10, 8);
  assert.deepEqual(p.actions(), []);
  send("pointermove", 50, 26);
  send("pointermove", 50, 100); // reversing this finger cannot shift again
  send("pointerup", 50, 100);
  emit(up, "click", { detail: 1 });
  assert.deepEqual(p.actions(), ["shiftUp"]);
  send("pointerdown", 50, 50); send("pointerup", 50, 74, 3, h.document);
  send("pointerdown", 50, 50); send("pointercancel", 50, 100, 3, h.document);
  send("pointermove", 50, 100); // cancelled without a shift
  send("pointerdown", 50, 50); emit(h.window, "blur"); send("pointermove", 50, 90);
  emit(down, "click", { detail: 0 });
  assert.deepEqual(p.actions(), ["shiftUp", "shiftDown", "shiftDown"]);
  body.classList.contains = name => name === "gears-auto";
  send("pointerdown", 50, 50); send("pointerup", 50, 20); emit(up, "click", { detail: 0 });
  body.classList.contains = () => false;
  body.dataset.shifts = "paddles"; emit(up, "click", { detail: 0 });
  assert.equal(p.actions().length, 3);
  p.ctl.cancel();
});

test("flick shifting is a saved optional layout preference and remains off on old wheels", () => {
  const h = boot(), L = vm.runInContext("PhonePadPage", h.ctx);
  let saved = '{"zone":{"aero":"L"}}';
  const store = { getItem: () => saved, setItem: (key, value) => { saved = value; } };
  const mount = () => {
    const dom = { body: element(), flickBtn: element() };
    return { dom, api: L.layout(dom, {store}) };
  };
  const a = mount();
  assert.equal(a.dom.body.dataset.shifts, "paddles");
  emit(a.dom.flickBtn, "click");
  assert.equal(a.dom.flickBtn["aria-pressed"], "true");
  const b = mount();
  assert.deepEqual([b.api.get().shifts, b.dom.body.dataset.shifts, b.api.get().zone.aero], ["flick", "flick", "L"]);
  emit(b.dom.flickBtn, "click");
  assert.equal(JSON.parse(saved).shifts, "paddles");
});

test("Utility wheel dispatches the released choice once, cancels outside, and times Look independently of a held rear view", async () => {
  const h = boot(), timers = new Map();
  h.window.innerWidth = 640; h.window.innerHeight = 360;
  let timerId = 0;
  h.ctx.setTimeout = (fn, ms) => { timers.set(++timerId, {fn, ms}); return timerId; };
  h.ctx.clearTimeout = id => timers.delete(id);
  const box = (x, y, w, height) => {
    const el = element();
    el.getBoundingClientRect = () => ({left:x, top:y, right:x+w, bottom:y+height, width:w, height});
    el.focus = () => { el.focused = true; }; el.contains = target => target === el; return el;
  };
  const trigger = box(200,200,60,48), panel = box(130,125,200,70);
  panel.hidden = true;
  const choices = {camera:box(130,147,60,48), look:box(195,125,60,48), radio:box(260,147,60,48)};
  const { ctl, dom, actions } = await page(h, {utility: {trigger, panel, choices}});
  const pointer = (type, x, y, pointerId = 4, el = trigger) =>
    emit(el, type, {button:0, pointerId, clientX:x, clientY:y});
  const start = () => pointer('pointerdown', 222, 220);
  try {
    start(); pointer('pointermove', 150, 170);
    pointer('pointerup', 150, 170, 9);
    assert.equal(panel.hidden, false);
    pointer('pointerup', 150, 170, 4, h.document);
    pointer('pointerup', 150, 170);
    assert.deepEqual(actions(), ['camera']);
    start(); pointer('pointermove', 285, 170); pointer('pointercancel', 285, 170);
    start(); pointer('pointermove', 285, 170); pointer('pointerup', 400, 100);
    assert.deepEqual(actions(), ['camera']);
    start(); pointer('pointerup', 222,220);
    assert.equal(panel.hidden, false, 'tap opens separate native actions');
    emit(choices.radio, 'click');
    assert.deepEqual(actions(), ['camera','radio']);
    emit(trigger, 'click', {detail:0});
    assert.equal(choices.camera.focused, true);
    emit(h.document, 'keydown', {key:'Escape'});
    assert.equal(panel.hidden, true);
    start(); pointer('pointerup', 220, 145);
    assert.equal(ctl.state().held, h.P.HELD.lookBack);
    pointer('pointerdown', 0, 0, 12, dom.lookBack);
    const glance = [...timers.values()].find(t => t.ms === 1000);
    assert.ok(glance); glance.fn();
    assert.equal(ctl.state().held, h.P.HELD.lookBack, 'direct Look owns its own hold');
    pointer('pointerup', 0, 0, 12, dom.lookBack);
    assert.equal(ctl.state().held, 0);
    start(); pointer('pointerup', 220, 145);
    emit(h.window, 'blur');
    assert.equal(ctl.state().held, 0);
    start(); emit(h.window, 'blur'); pointer('pointerup', 285, 170);
    assert.deepEqual(actions(), ['camera','radio']);
  } finally { ctl.cancel(); }
});
