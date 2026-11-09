import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../../js/ui/update-check.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function harness(fetchImpl, abort = true, opts = {}) {
  let clock = 100, calls = 0, serial = 0;
  const timers = new Map(), signals = [];
  const sb = vm.createContext({ Promise, Number, Date, Object, ...(abort ? { AbortController } : {}),
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, at: clock + ms }); return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval: () => 1, clearInterval() {}, navigator: {} });
  vm.runInContext(source + ';globalThis.U = UpdateCheck;', sb);
  const api = sb.U.create({ ...opts, booted: 100, now: () => clock, fetch: (url, init) => {
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
test('a boot whose shell guard did not report success re-checks after the 30 s backoff, not 10 minutes (#4925)', async () => {
  const newer = () => Promise.resolve({ ok: true, json: async () => ({ build: 105 }) });
  const failed = harness(newer);
  await failed.advance(29000); failed.api.onVisible(); await flush();
  assert.equal(failed.calls(), 0);
  await failed.advance(2000); failed.api.onVisible(); await flush();
  assert.equal(failed.calls(), 1); assert.equal(failed.api.state().ready, 105); failed.api.stop();
  // The guard's read may land after create(): the flag is read lazily, at the first check.
  let reported = false;
  const ok = harness(newer, true, { guardOk: () => reported });
  reported = true;
  await ok.advance(31000); ok.api.onVisible(); await flush();
  assert.equal(ok.calls(), 0, 'a guard that read version.json keeps the 10-minute throttle');
  await ok.advance(10 * 60 * 1000); ok.api.onVisible(); await flush();
  assert.equal(ok.calls(), 1); ok.api.stop();
});
