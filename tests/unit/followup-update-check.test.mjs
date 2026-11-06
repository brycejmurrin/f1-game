import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { absSrc } from '../helpers/abs-src.mjs';
const source = fs.readFileSync(new URL('../../js/ui/update-check.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function harness(fetchImpl, abort = true) {
  let clock = 100, calls = 0, serial = 0;
  const timers = new Map(), signals = [];
  const sb = vm.createContext({ Promise, Number, Date, Object, ...(abort ? { AbortController } : {}),
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, at: clock + ms }); return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval: () => 1, clearInterval() {}, navigator: {} });
  vm.runInContext(source + ';globalThis.U = UpdateCheck;', sb);
  const api = sb.U.create({ booted: 100, now: () => clock, fetch: (url, init) => {
    calls++; signals.push(init.signal); return fetchImpl(calls);
  } });
  return { api, timers, signals, calls: () => calls, async advance(ms) {
    clock += ms;
    for (const [id, t] of [...timers]) if (t.at <= clock) { timers.delete(id); t.fn(); }
    await flush();
  } };
}
for (const mode of ['fetch', 'body']) for (const abort of [true, false]) {
  test(`hung ${mode} recovers with abort=${abort} and ignores late build`, async () => {
    let resolveLate;
    const late = new Promise(r => { resolveLate = r; });
    const h = harness(n => n === 1
      ? mode === 'fetch' ? late : Promise.resolve({ ok: true, json: () => late })
      : Promise.resolve({ ok: true, json: async () => ({ build: 105 }) }), abort);
    const first = h.api.check(true);
    assert.equal(h.api.check(true), first);
    await flush(); await h.advance(15000);
    assert.equal(await first, false); assert.equal(h.api.state().checking, false);
    if (abort) assert.equal(h.signals[0].aborted, true);
    await h.advance(29999); assert.equal(await h.api.check(false), false); assert.equal(h.calls(), 1);
    await h.advance(1); const next = h.api.check(false);
    resolveLate(mode === 'fetch' ? { ok: true, json: async () => ({ build: 999 }) } : { build: 999 });
    assert.equal(await next, true); await flush();
    assert.equal(h.api.state().ready, 105); assert.equal(h.calls(), 2); assert.equal(h.timers.size, 0);
    h.api.stop();
  });
}
test('successful and rejected reads release their deadline', async () => {
  for (const fail of [false, true]) {
    const h = harness(() => fail ? Promise.reject(Error('offline')) : Promise.resolve({ ok: true, json: async () => ({ build: 101 }) }));
    assert.equal(await h.api.check(true), !fail);
    assert.equal(h.timers.size, 0); assert.equal(h.api.state().checking, false); h.api.stop();
  }
});

// #5134: a stale shell self-heals. sw.js posts `apex-shell-newer` once it cached a newer shell than the one this
// page booted from; UpdateCheck reloads by itself (the `?b=` bust, the one-shot key) while the player is idle and
// within 90 s of boot or of the page coming back — otherwise the chip, as before.
function autoHarness({ idle = () => true, race = () => false } = {}) {
  let clock = 1000;
  const replaced = [], stored = {};
  const sb = vm.createContext({ Promise, Number, Date, Object, URLSearchParams, setTimeout: () => 1, clearTimeout() {},
    setInterval: () => 1, clearInterval() {}, navigator: {}, sessionStorage: { setItem(k, v) { stored[k] = v; } } });
  vm.runInContext(source + ';globalThis.U = UpdateCheck;', sb, { filename: absSrc('js/ui/update-check.js') });
  const api = sb.U.create({ booted: 320, now: () => clock, fetch: () => Promise.reject(Error('no network')), idle, inRace: race,
    location: { pathname: '/', search: '', hash: '#vs=abc', replace: (u) => replaced.push(u) } });
  return { api, replaced, stored, advance: (ms) => { clock += ms; } };
}
test('staleShell within the boot window and idle reloads with ?b= (#5134)', async () => {
  const h = autoHarness();
  assert.equal(h.api.staleShell(322), true);
  await flush();
  assert.deepEqual(h.replaced, ['/?b=322#vs=abc']);
  assert.equal(h.stored['apex26.shellReloadedTo'], '322');
  h.api.stop();
});
test('staleShell with an equal or older build is ignored (#5134)', async () => {
  const h = autoHarness();
  assert.equal(h.api.staleShell(320), false); assert.equal(h.api.staleShell(319), false);
  await flush(); assert.deepEqual(h.replaced, []); h.api.stop();
});
for (const [why, opts, pre] of [
  ['in a race', { race: () => true }, () => {}],
  ['not idle (a dialog or screen is open)', { idle: () => false }, () => {}],
  ['past the 90 s window', {}, (h) => h.advance(90001)],
]) test(`staleShell ${why}: chip only (#5134)`, async () => {
  const h = autoHarness(opts); pre(h);
  assert.equal(h.api.staleShell(322), true, 'the build is still marked ready');
  await flush();
  assert.deepEqual(h.replaced, [], 'no reload');
  assert.equal(h.api.state().ready, 322);
  h.api.stop();
});
test('a return to visibility reopens the window (iOS resume) (#5134)', async () => {
  const h = autoHarness(); h.advance(600000);
  assert.equal(h.api.staleShell(321), true); await flush(); assert.deepEqual(h.replaced, []);
  h.api.onVisible();   // document is undefined in the sandbox: counts as visible
  assert.equal(h.api.staleShell(322), true); await flush();
  assert.deepEqual(h.replaced, ['/?b=322#vs=abc']); h.api.stop();
});
