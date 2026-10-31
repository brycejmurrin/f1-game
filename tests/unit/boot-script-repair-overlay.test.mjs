// index.html: while apex26.scriptRetry is sweeping caches and reloading, suppress
// the full-screen error overlay for cascading ReferenceErrors — still log them.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { absSrc } from "../helpers/abs-src.mjs";
import { EventEmitter } from 'node:events';
import { validateFaultScenario, installFaultSchedule, replayFaultScenario } from '../../tools/ui/explorer/fault-schedule.mjs';

const lazyPath = '/js/circuits/monaco.js';
const faultHold = () => ({ type: 'faultHold', id: 'circuit', path: lazyPath, timeoutMs: 1000 });
const faultWait = () => ({ type: 'faultWait', id: 'circuit' });
const faultRelease = outcome => ({ type: 'faultRelease', id: 'circuit', outcome });
const faultScenario = actions => ({ version: 1, id: 'lazy-preview', goal: 'Leave a pending circuit preview', actions,
  oracle: { type: 'selector', selector: '#overlay', state: 'visible' } });

function faultRig() {
  const context = new EventEmitter(), timers = new Map(), calls = [];
  let handler, sequence = 0;
  context.route = async (_, h) => { handler = h; };
  context.unroute = async (_, h) => { assert.equal(h, handler); calls.push('unroute'); };
  const clock = { setTimer(fn) { const id = ++sequence; timers.set(id, fn); return id; }, clearTimer(id) { timers.delete(id); } };
  let request, pending;
  return { context, calls, clock, timers,
    session: { context, page: { url: () => 'http://localhost/' } },
    start({ pathname = lazyPath, origin = 'http://localhost', failRoute = false } = {}) {
      request = { url: () => origin + pathname + '?v=dev' };
      pending = handler({ request: () => request,
        fallback: async () => { calls.push('continue'); if (failRoute) throw Error('route failed'); },
        abort: async () => { calls.push('reject'); context.emit('requestfailed', request); },
      });
      return pending;
    },
    finish() { context.emit('requestfinished', request); },
    fail() { context.emit('requestfailed', request); },
    expire() { for (const [id, fn] of [...timers]) if (timers.delete(id)) fn(); },
    async drain() { await pending; },
  };
}

test('lazy fault fixtures validate bounded declarative schedules without changing ordinary action contracts', () => {
  const input = faultScenario([faultHold(), { type: 'click', role: 'button', name: 'Race' }, faultWait(), faultRelease('continue')]);
  assert.equal(validateFaultScenario(input).actions[1].exact, true);
  assert.equal(input.actions[1].exact, undefined);
  const hold = faultHold(); delete hold.timeoutMs;
  assert.equal(validateFaultScenario(faultScenario([hold, faultWait(), faultRelease('reject')])).actions[0].timeoutMs, 15000);
  const invalidPaths = [lazyPath + '?query=1', 'https://example.com' + lazyPath,
    ['/js', '..', 'bad.js'].join('/'), ['/js', '*.js'].join('/'), ['/assets', 'model.js'].join('/')];
  for (const pathname of invalidPaths) assert.throws(() => validateFaultScenario(faultScenario([{ ...faultHold(), path: pathname }, faultWait(), faultRelease()])));
  for (const timeoutMs of [0, 30001, Infinity, '1000']) assert.throws(() => validateFaultScenario(faultScenario([{ ...faultHold(), timeoutMs }, faultWait(), faultRelease()])));
  for (const actions of [[faultWait()], [faultHold(), faultRelease()], [faultHold(), faultWait()],
    [faultHold(), faultWait(), faultRelease(), faultRelease()], [faultHold(), faultHold()],
    Array.from({ length: 5 }, (_, i) => ({ ...faultHold(), id: 'f' + i, path: '/js/f' + i + '.js' })),
    [{ ...faultHold(), id: '../bad' }, faultWait(), faultRelease()],
    [faultHold(), faultWait(), faultRelease('execute')], [faultHold(), { type: 'evaluate', expression: '1' }, faultWait(), faultRelease()]])
    assert.throws(() => validateFaultScenario(faultScenario(actions)));
  assert.throws(() => validateFaultScenario({ ...input, script: 'alert(1)' }));
  assert.throws(() => validateFaultScenario(faultScenario(Array(257).fill({ type: 'checkpoint', label: 'x' }))));
});

test('lazy fault replay delegates ordinary actions and checks the oracle only after the held transfer finishes', async () => {
  const f = faultRig(); let oracleCalls = 0, evidence;
  const replay = replayFaultScenario(f.session, faultScenario([faultHold(), { type: 'click', selector: '#load' }, faultWait(),
    { type: 'press', key: 'Escape' }, faultRelease('continue')]), { ...f.clock,
    performAction: async (session, a) => { assert.equal(session, f.session); f.calls.push(a.type); if (a.type === 'click') void f.start(); },
    matchesOracle: async () => { oracleCalls++; return true; },
  }).then(value => { evidence = value; });
  // Drain scheduled microtasks without a wall-clock sleep or a second browser.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(oracleCalls, 0, 'route continuation is not response completion');
  assert.equal(evidence, undefined);
  assert.deepEqual(f.calls, ['click', 'press', 'continue']);
  f.context.emit('requestfinished', { url: () => 'http://localhost' + lazyPath });
  assert.equal(oracleCalls, 0, 'a different request with the same path cannot satisfy the hold');
  f.finish(); await replay;
  assert.equal(oracleCalls, 1);
  assert.deepEqual(evidence.events.map(e => e.state), ['armed', 'observed', 'continue', 'settled', 'finished']);
  assert.equal(f.context.listenerCount('requestfinished'), 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.calls.at(-1), 'unroute');
});

test('lazy rejection replays retain transfer evidence and ordinary oracle failures', async () => {
  for (const oracle of [true, false]) {
    const f = faultRig();
    const work = replayFaultScenario(f.session, faultScenario([faultHold(), { type: 'click', selector: '#load' }, faultWait(), faultRelease('reject')]), {
      ...f.clock, performAction: async () => { void f.start(); }, matchesOracle: async () => oracle,
    });
    if (oracle) assert.equal((await work).events.at(-1).state, 'failed');
    else await assert.rejects(work, error => error.message === 'Fault scenario oracle was not satisfied' && error.faultEvidence.events.at(-1).state === 'failed');
    assert.equal(f.timers.size, 0);
  }
});

test('unused faults and failed navigation abort pending requests and cannot pass completion', async () => {
  const unused = faultRig();
  const work = replayFaultScenario(unused.session, faultScenario([faultHold(), faultWait(), faultRelease('continue')]), {
    ...unused.clock, performAction: async () => {}, matchesOracle: async () => true,
  });
  const rejected = assert.rejects(work, error => error.message.includes('not observed') && error.faultEvidence.events.at(-1).state === 'timeout');
  await new Promise(resolve => setImmediate(resolve)); unused.expire(); await rejected;
  assert.equal(unused.timers.size, 0);
  const f = faultRig();
  await assert.rejects(replayFaultScenario(f.session, faultScenario([faultHold(), { type: 'click', selector: '#load' }, faultWait(), faultRelease('continue')]), {
    ...f.clock, performAction: async () => { void f.start(); throw Error('navigation failed'); }, matchesOracle: async () => true,
  }), error => error.message === 'navigation failed' && error.faultEvidence.events.some(e => e.state === 'cleanup'));
  await f.drain(); assert.deepEqual(f.calls, ['unroute', 'reject']);
  assert.equal(f.timers.size, 0);
});

test('fault fixture routing composes, requires an actual terminal transfer and drains after unroute failure', async () => {
  const f = faultRig(), s = await installFaultSchedule(f.context, 'http://localhost', f.clock);
  s.hold(faultHold());
  await f.start({ pathname: '/js/core/hash32.js' });
  await f.start({ origin: 'http://other.test' });
  assert.equal(s.events.length, 1);
  void f.start(); await s.wait('circuit');
  const release = s.release('circuit');
  const rejected = assert.rejects(release, error => error.message.includes('unexpected transfer: failed'));
  f.fail(); await rejected; assert.throws(() => s.assertComplete());
  await s.close(); assert.equal(f.timers.size, 0);
  const g = faultRig(), held = await installFaultSchedule(g.context, 'http://localhost', g.clock);
  held.hold(faultHold()); void g.start(); await held.wait('circuit');
  g.context.unroute = async () => { throw Error('unroute failed'); };
  await assert.rejects(held.close(), error => error.message === 'unroute failed');
  await g.drain(); assert.deepEqual(g.calls, ['reject']);
});

test('fault route errors and missing terminal events fail with bounded cleanup', async () => {
  for (const failRoute of [true, false]) {
    const f = faultRig(), s = await installFaultSchedule(f.context, 'http://localhost', f.clock);
    s.hold(faultHold()); void f.start({ failRoute }); await s.wait('circuit');
    const release = s.release('circuit');
    const rejected = assert.rejects(release, error => error.message.includes(failRoute ? 'route failed' : 'transfer-timeout'));
    if (!failRoute) { await new Promise(resolve => setImmediate(resolve)); f.expire(); }
    await rejected; await s.close(); assert.equal(f.timers.size, 0);
    assert.equal(f.context.listenerCount('requestfailed'), 0);
  }
});

async function runErrorCatcher() {
  const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  const script = html.split("<script>").map((c) => c.split("</script>")[0])
    .find((c) => c.includes("ON-SCREEN ERROR CATCHER"));
  assert.ok(script, "the error catcher script is found");
  const listeners = {};
  let overlay = null;
  const win = { addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } };
  const ctx = vm.createContext({
    window: win,
    document: {
      querySelector: () => ({ content: "123" }),
      getElementById: () => overlay,
      createElement: () => ({ style: {}, textContent: "", onclick: null }),
      body: { appendChild: (d) => { overlay = d; } },
      documentElement: { appendChild: (d) => { overlay = d; } },
    },
    navigator: { onLine: true },
    location: { origin: "https://x.test" },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: () => new Promise(() => {}),
  });
  vm.runInContext(script, ctx, { filename: absSrc("index.html") });
  return {
    win,
    fire: (type, ev) => { for (const fn of listeners[type] || []) fn(ev); },
    overlayVisible: () => !!(overlay && overlay.style.display === "block"),
    last: () => win.__apexErrors[win.__apexErrors.length - 1],
  };
}

test("index.html sets __apexScriptRepair when the one-shot scriptRetry repair starts", async () => {
  const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  const at = html.indexOf('sessionStorage.setItem(RETRY_KEY, "1")');
  assert.ok(at > 0);
  const snippet = html.slice(at, at + 120);
  assert.equal(snippet.includes("window.__apexScriptRepair = 1"), true);
});

test("with __apexScriptRepair set, rejections and errors are logged but the overlay stays hidden", async () => {
  const h = await runErrorCatcher();
  h.win.__apexScriptRepair = 1;
  const err = new ReferenceError("DriveTune is not defined");
  h.fire("unhandledrejection", { reason: err });
  assert.equal(h.last().kind, "rejection");
  assert.equal(h.last().msg, "DriveTune is not defined");
  assert.equal(h.overlayVisible(), false);
  h.fire("error", { message: "DriveTune is not defined", error: err, filename: "js/physics/drive-tune.js", lineno: 1, colno: 1 });
  assert.equal(h.last().kind, "error");
  assert.equal(h.last().msg, "DriveTune is not defined");
  assert.equal(h.overlayVisible(), false);
});

test("without __apexScriptRepair, the overlay still shows for rejections and errors", async () => {
  const h = await runErrorCatcher();
  h.fire("unhandledrejection", { reason: new ReferenceError("DriveTune is not defined") });
  assert.equal(h.overlayVisible(), true);
  h.fire("error", { message: "x", error: new Error("x"), filename: "a.js", lineno: 1, colno: 1 });
  assert.equal(h.overlayVisible(), true);
});

test("pinned overlay (second scriptRetry pass) still shows even if __apexScriptRepair were set", async () => {
  const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  const script = html.split("<script>").map((c) => c.split("</script>")[0])
    .find((c) => c.includes("ON-SCREEN ERROR CATCHER"));
  const listeners = {};
  let overlay = null;
  const win = { __apexScriptRepair: 1, addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } };
  const ctx = vm.createContext({
    window: win,
    document: {
      querySelector: () => ({ content: "1" }),
      getElementById: () => overlay,
      createElement: () => ({ style: {}, textContent: "", onclick: null }),
      body: { appendChild: (d) => { overlay = d; } },
      documentElement: { appendChild: (d) => { overlay = d; } },
    },
    navigator: { onLine: true },
    location: { origin: "https://x.test" },
    sessionStorage: { getItem: () => "1", setItem() {}, removeItem() {} },
    fetch: () => Promise.resolve({}),
    caches: { keys: async () => [], delete: async () => true },
  });
  vm.runInContext(script, ctx, { filename: absSrc("index.html") });
  for (const fn of listeners.error || []) {
    fn({ target: { tagName: "SCRIPT", src: "https://x.test/js/physics/drive-tune.js?v=1", dataset: {} } });
  }
  assert.equal(overlay && overlay.style.display, "block");
  assert.equal(overlay.textContent.indexOf("Module failed to load") >= 0, true);
});
