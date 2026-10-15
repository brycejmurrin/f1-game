/* Render the real hub's failure/retry path; source text is not a UI oracle. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { makeDom } from '../helpers/mini-dom.mjs';

function harness(online) {
  const dom = makeDom();
  let now = Date.now(), calls = 0, staleSeq = 0, staleEvent = null;
  const pending = [];
  const navigator = { onLine: online };
  const empty = () => Promise.resolve(dom.document.createElement('div'));
  const create = (value) => ({ create: () => value });
  class Clock extends Date { static now() { return now; } }
  const ctx = vm.createContext({ document: dom.document, navigator, Date: Clock, queueMicrotask,
    Log: { info() {}, warn() {} }, F1API: { cancelAll() {}, staleMark: () => staleSeq,
      staleSince: mark => staleEvent && staleEvent.seq > mark ? staleEvent.at : null },
    DataSchedule: create({ loadSchedule: () => { calls++; return new Promise((resolve, reject) => pending.push({resolve, reject})); } }),
    DataStandings: create({ loadStandings: empty }), DataResults: create({ loadResults: empty }),
    DataLive: create({ loadLive: empty, stopLiveAuto() {}, disarmLiveAuto() {} }),
    DataTelemetry: create({ loadTelemetry: empty, closeTelemPopup() {} }),
    DataRealRace: create({ loadRealRace: empty, cancel() {} }), DataExport: create({ loadExport: empty }) });
  for (const file of ['js/ui/dom.js', 'js/data/hub.js']) {
    vm.runInContext(fs.readFileSync(new URL('../../' + file, import.meta.url), 'utf8'), ctx, { filename: file });
  }
  const hub = vm.runInContext('DataHub', ctx);
  const root = dom.byId('datahub'); root.hidden = true;
  hub.init(root);
  const panel = () => root.querySelector('#dh-panel');
  const flush = () => new Promise(resolve => setImmediate(resolve));
  async function answer(ok, text = 'Race at Monza', options = {}) {
    const request = pending.shift(); assert.ok(request, 'the hub must actually request the tab');
    if (ok) {
      if (options.staleAgeMs != null) staleEvent = {seq: ++staleSeq, at: now - options.staleAgeMs};
      const n = dom.document.createElement('div'); n.className = 'schedule-data'; n.textContent = text;
      if (options.nextFlipInMs != null) n.nextFlipAt = now + options.nextFlipInMs;
      request.resolve(n);
    }
    else request.reject(new Error('service failed'));
    await flush();
  }
  return {hub, root, panel, answer, flush, navigator, advance: (ms = 7 * 3600000) => { now += ms; },
    calls: () => calls, click: n => { assert.ok(n, 'recovery control exists'); dom.dispatch(n, {type:'click'}); } };
}

for (const online of [false, true]) for (const cached of [false, true]) {
  test(`${online ? 'upstream' : 'offline'} failure ${cached ? 'retains cached data' : 'has no cached data'} and RETRY recovers`, async () => {
    const h = harness(online);
    h.hub.open('schedule');
    if (cached) {
      await h.answer(true);
      h.hub.close(); h.advance(); h.hub.open('schedule');
    }
    await h.answer(false);
    const error = h.panel().querySelector('.dh-error');
    assert.ok(error, 'a failure renders an error instead of an empty tab');
    assert.equal(error.getAttribute('role'), 'status');
    assert.equal(error.dataset.reason, (online ? 'upstream' : 'offline') + (cached ? '-cached' : ''));
    assert.equal(error.children.find(n => n.dataset.role === "title")?.textContent,
      cached ? (online ? 'REFRESH FAILED · CACHED' : 'OFFLINE · CACHED') : (online ? 'SERVICE UNAVAILABLE' : 'OFFLINE'));
    const messages = error.querySelectorAll('.dh-error-msg').map(n => n.textContent).join(' ');
    assert.match(messages, cached ? /Showing the last data/ : online ? /F1 data service/ : /No network/);
    assert.equal(!!h.panel().querySelector('.schedule-data'), cached, 'only a successful old answer supplies stale rows');
    if (cached) assert.equal(h.panel().querySelector('.schedule-data').textContent, 'Race at Monza');
    const before = h.calls();
    h.navigator.onLine = true;
    h.click(error.querySelector('.dh-retry'));
    assert.equal(h.calls(), before + 1, 'RETRY starts a new request');
    await h.answer(true, 'Fresh race at Spa');
    assert.equal(h.panel().querySelector('.dh-error'), null);
    assert.equal(h.panel().querySelector('.schedule-data').textContent, 'Fresh race at Spa');
    h.hub.close(); h.hub.open('schedule'); await h.flush();
    assert.equal(h.calls(), before + 1, 'reopening reuses the recovered successful answer');
  });
}

test('online stale-cache response dates its data; a later fresh response clears the stale label', async () => {
  const h = harness(true);
  h.hub.open('schedule');
  await h.answer(true, 'Cached race at Monza', {staleAgeMs: 3 * 3600000});
  assert.equal(h.panel().querySelector('.dh-footnote').textContent, 'updated 3h 0m ago · offline copy');
  assert.equal(h.panel().querySelector('.schedule-data').textContent, 'Cached race at Monza');
  h.hub.close(); h.advance(); h.hub.open('schedule');
  await h.answer(true, 'Fresh race at Spa');
  assert.equal(h.panel().querySelector('.dh-footnote').textContent, 'updated just now');
  assert.equal(h.panel().querySelector('.schedule-data').textContent, 'Fresh race at Spa');
});

test('reopening reuses schedule before NEXT expiry and refreshes at the exact boundary', async () => {
  const h = harness(true);
  h.hub.open('schedule');
  await h.answer(true, 'Before expiry', {nextFlipInMs: 1000});
  h.hub.close(); h.advance(999); h.hub.open('schedule'); await h.flush();
  assert.equal(h.calls(), 1);
  assert.equal(h.panel().querySelector('.schedule-data').textContent, 'Before expiry');
  h.hub.close(); h.advance(1); h.hub.open('schedule');
  assert.equal(h.calls(), 2, 'NEXT expires even though the generic six-hour cache remains young');
  await h.answer(true, 'After expiry', {nextFlipInMs: 60000});
  assert.equal(h.panel().querySelector('.schedule-data').textContent, 'After expiry');
  h.hub.close(); h.hub.open('schedule'); await h.flush();
  assert.equal(h.calls(), 2, 'the replacement has its own expiry');
});
