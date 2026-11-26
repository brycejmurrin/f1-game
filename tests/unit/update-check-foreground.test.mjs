// #6633 L1 + L2: a foreground check that finds a newer build starts the new
// worker's install (registration.update()), and pageshow(persisted) / focus
// poll as visibilitychange does, without a double read when they fire together.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { absSrc } from '../helpers/abs-src.mjs';
const source = fs.readFileSync(new URL('../../js/ui/update-check.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function harness({ build = 105, registration, fail = false } = {}) {
  let clock = 1e6, calls = 0;
  const sb = vm.createContext({ Promise, Number, Date, Object, AbortController,
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, navigator: {} });
  vm.runInContext(source + ';globalThis.U = UpdateCheck;', sb, { filename: absSrc('js/ui/update-check.js') });
  const chip = { hidden: true, setAttribute() {}, textContent: '' };
  const api = sb.U.create({ booted: 100, now: () => clock, guardOk: () => true, chip: () => chip, registration,
    fetch: () => { calls++; return fail ? Promise.reject(Error('offline')) : Promise.resolve({ ok: true, json: async () => ({ build }) }); } });
  return { U: sb.U, api, chip, calls: () => calls, advance(ms) { clock += ms; } };
}
function fakeRegistration() {
  const reg = { updates: 0, chipAtUpdate: null, update() { this.updates++; return Promise.resolve(); } };
  return reg;
}
function target() {
  const ls = {};
  return { ls, addEventListener(t, fn) { (ls[t] ||= []).push(fn); }, fire(t, e = {}) { for (const fn of ls[t] || []) fn(e); } };
}

test('L1: a check that finds a newer build calls registration.update() before the chip shows, once per build', async () => {
  const reg = fakeRegistration();
  let h;
  reg.update = function () { this.updates++; this.chipAtUpdate = h.chip.hidden; return Promise.resolve(); };
  h = harness({ registration: () => Promise.resolve(reg) });
  assert.equal(await h.api.check(true), true);
  await flush();
  assert.equal(reg.updates, 1);
  assert.equal(h.chip.hidden, false, 'chip shows');
  assert.equal(await h.api.check(true), true); await flush();
  assert.equal(reg.updates, 1, 'the same build does not nudge twice');
  h.api.stop();
});

test('L1: no update() for the same or an older build, a failed read, or a missing registration', async () => {
  for (const opts of [{ build: 100 }, { build: 99 }, { fail: true }]) {
    const reg = fakeRegistration();
    const h = harness({ ...opts, registration: () => Promise.resolve(reg) });
    assert.equal(await h.api.check(true), false); await flush();
    assert.equal(reg.updates, 0, JSON.stringify(opts)); h.api.stop();
  }
  for (const registration of [() => null, () => Promise.resolve(undefined), () => Promise.reject(Error('x')), () => { throw Error('sync'); },
    () => Promise.resolve({ update: () => Promise.reject(Error('offline')) })]) {
    const h = harness({ registration });
    assert.equal(await h.api.check(true), true, 'the chip still shows'); await flush();
    assert.equal(h.api.state().ready, 105); h.api.stop();
  }
});

test('L1: default registration reads navigator.serviceWorker.getRegistration()', async () => {
  const reg = fakeRegistration();
  const sb = vm.createContext({ Promise, Number, Date, Object, AbortController, setTimeout: () => 1, clearTimeout() {},
    setInterval: () => 1, clearInterval() {}, navigator: { serviceWorker: { getRegistration: () => Promise.resolve(reg) } } });
  vm.runInContext(source + ';globalThis.U = UpdateCheck;', sb, { filename: absSrc('js/ui/update-check.js') });
  const api = sb.U.create({ booted: 100, now: () => 1e6, fetch: () => Promise.resolve({ ok: true, json: async () => ({ build: 101 }) }) });
  assert.equal(await api.check(true), true); await flush();
  assert.equal(reg.updates, 1); api.stop();
});

test('L2: pageshow(persisted) and focus poll; a fresh pageshow does not', async () => {
  for (const [type, ev, expect] of [['pageshow', { persisted: true }, 1], ['pageshow', { persisted: false }, 0], ['focus', {}, 1]]) {
    const h = harness();
    const win = target(), doc = target();
    h.U.listen(h.api, win, doc);
    h.advance(10 * 60 * 1000);   // past the boot throttle (the guard reported its read)
    win.fire(type, ev); await flush();
    assert.equal(h.calls(), expect, type + ' ' + JSON.stringify(ev)); h.api.stop();
  }
});

test('L2: focus + visibilitychange together read version.json once; the throttle still holds', async () => {
  const h = harness();
  const win = target(), doc = target();
  h.U.listen(h.api, win, doc);
  h.advance(10 * 60 * 1000);
  doc.fire('visibilitychange'); win.fire('focus'); await flush();
  assert.equal(h.calls(), 1, 'same tick: coalesced in flight');
  win.fire('focus'); doc.fire('visibilitychange'); await flush();
  assert.equal(h.calls(), 1, 'after it settles: throttled');
  h.advance(10 * 60 * 1000); win.fire('focus'); await flush();
  assert.equal(h.calls(), 2, 'a long-foregrounded app polls again on focus');
  h.api.stop();
});

test('L2: platform-session wires the foreground triggers through UpdateCheck.listen', () => {
  const ps = fs.readFileSync(new URL('../../js/ui/platform-session.js', import.meta.url), 'utf8');
  assert.match(ps, /UpdateCheck\.listen\(updates, window, document\)/);
  assert.doesNotMatch(ps, /addEventListener\("visibilitychange", \(\) => updates\.onVisible\(\)\)/);
});
