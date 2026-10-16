import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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
  for (const f of ['js/net/bytes.js', 'js/net/transport.js', 'js/input/tilt-roll.js', 'js/input/phone-pad.js']) vm.runInContext(read(f), ctx, { filename: f });
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
async function page(h) {
  const w = wire(), dom = { gas: element(), brake: element(), lookBack: element(), steer: element(), steeringMode: element(), health: element(), healthAge: element(),
    buttons: { pause: element(), navSelect: element(), shiftUp: element() } };
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
    vm.runInContext(read('js/net/scan.js'), h.ctx);
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
  h.window.BarcodeDetector = Detector; vm.runInContext(read('js/net/scan.js'), h.ctx);
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
