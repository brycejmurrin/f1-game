import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { settleLayout, compareSweepPaths } from '../../tools/ui/explorer/transitions.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
function fixture({ children = 1, ids = true, adaptation = { pair: 'off' }, throwOnRect = false } = {}) {
  let now = 0, sequence = 0;
  const pending = new Map(), timers = new Map(), cancelled = [];
  const node = (id, tagName = 'DIV') => ({ id, tagName, nodeType: 1, dataset: {}, children: [], parentElement: null,
    scrollWidth: 100, scrollHeight: 50, rect: { x: 0, y: 0, width: 100, height: 50 },
    getBoundingClientRect() { if (throwOnRect) throw Error('fixture geometry unavailable'); return this.rect; },
    contains(e) { return this === e || this.children.some(c => c.contains(e)); },
    querySelectorAll() { return this.children.filter(e => e.tagName === 'BUTTON' || Object.keys(e.dataset).length); },
  });
  const scope = node('scope', 'BODY');
  scope.children = Array.from({ length: children }, (_, i) => {
    const e = node(ids ? `item-${i}` : '', 'BUTTON'); e.parentElement = scope; e.dataset = { ...adaptation }; return e;
  });
  const document = { querySelector: root => root === 'body' || root === '#scope' ? scope : null,
    querySelectorAll: selector => [scope, ...scope.children].filter(e => `#${e.id}` === selector),
  };
  const context = { document, CSS: { escape: value => value }, performance: { now: () => now },
    requestAnimationFrame: callback => { const id = ++sequence; pending.set(id, callback); return id; },
    cancelAnimationFrame: id => { cancelled.push(id); pending.delete(id); },
    setTimeout: (callback, ms) => { const id = ++sequence; timers.set(id, { callback, at: now + ms }); return id; },
    clearTimeout: id => timers.delete(id),
  };
  return { scope, pending, timers, cancelled,
    start: options => runInNewContext(`(${settleLayout.toString()})(${JSON.stringify(options || {})})`, context),
    frame(change, ms = 20) { now += ms; change?.(scope.children); const callbacks = [...pending.values()]; pending.clear(); for (const callback of callbacks) callback(); },
    expire() { now = 2000; for (const { callback } of [...timers.values()]) callback(); },
  };
}

test('serialized sampler retains frame-zero and changed classifications with unique selectors', async () => {
  const dom = fixture({ children: 2, ids: false, adaptation: { shape: 'wide', density: 'roomy', pair: 'off', rail: 'off', fit: 'yes' } });
  const promise = dom.start({ root: '#scope' });
  dom.frame(children => { children[0].dataset.pair = 'on'; });
  for (let n = 0; n < 7; n++) dom.frame();
  const result = plain(await promise), [first, second] = result.history.contexts;
  assert.equal(result.stable, true);
  assert.equal(result.frames, 8);
  assert.equal(result.elapsedMs, 160);
  assert.equal(result.truncated, false);
  assert.equal(first.selector, '#scope > button:nth-of-type(1)');
  assert.equal(second.selector, '#scope > button:nth-of-type(2)');
  assert.deepEqual(first.states.map(s => [s.frame, s.elapsedMs, s.adaptation.pair]), [[0, 0, 'off'], [1, 20, 'on']]);
  assert.equal(first.states[0].adaptation.shape, 'wide');
  assert.equal(first.states[0].adaptation.density, 'roomy');
  assert.equal(first.states[0].adaptation.rail, 'off');
  assert.equal(first.states[0].adaptation.fit, 'yes');
  assert.equal(first.changes, 1);
  assert.equal(second.states.length, 1);
  assert.equal(dom.pending.size + dom.timers.size, 0);
});

test('quiet layout needs three equal sampled frames as well as the 150ms minimum', async () => {
  const dom = fixture(), promise = dom.start();
  dom.frame(undefined, 151);
  assert.equal(dom.pending.size, 1, 'one slow frame is insufficient');
  dom.frame(); dom.frame();
  assert.equal(dom.pending.size, 1, 'three samples contain only two equal intervals');
  dom.frame();
  assert.equal((await promise).frames, 4);
});

test('stalled rAF has an independent deadline and cancels its pending callback', async () => {
  const dom = fixture(), promise = dom.start();
  const [frameId, callback] = [...dom.pending.entries()][0];
  dom.expire();
  const result = plain(await promise);
  assert.equal(result.stable, false);
  assert.equal(result.frames, 0);
  assert.equal(result.elapsedMs, 2000);
  assert.match(result.reason, /sampling budget/);
  assert.equal(result.history.contexts[0].states[0].frame, 0);
  assert.deepEqual(dom.cancelled, [frameId]);
  callback();
  assert.equal(dom.pending.size + dom.timers.size, 0, 'late callbacks cannot restart sampling');
});

test('fixed geometry with alternating classifier values never claims settlement or a game defect', async () => {
  const dom = fixture(), promise = dom.start();
  for (let n = 1; n <= 120; n++) dom.frame(children => { children[0].dataset.pair = n % 2 ? 'on' : 'off'; }, 1);
  const result = plain(await promise), context = result.history.contexts[0];
  assert.equal(result.stable, false);
  assert.equal(result.frames, 120);
  assert.equal(context.changes, 120);
  assert.equal(context.revisited, 119);
  assert.equal(context.alternating, 119);
  assert.equal(context.states.length, result.history.limits.statesPerContext);
  assert.equal(context.evidence.length, result.history.limits.evidencePerContext);
  assert.equal(context.evidence[0].frame, 2);
  assert.equal(context.truncated, true);
  assert.equal(result.truncated, true);
  assert.match(result.history.limitation, /not confirmed bugs/);
  assert.equal(dom.pending.size + dom.timers.size, 0);
});

test('sampling caps contexts, values and elements explicitly', async () => {
  const dom = fixture({ children: 510, adaptation: { pair: 'x'.repeat(300) } }), promise = dom.start();
  for (let n = 0; n < 8; n++) dom.frame();
  const result = plain(await promise);
  assert.equal(result.stable, true);
  assert.equal(result.truncated, true);
  assert.equal(result.history.contexts.length, result.history.limits.contexts);
  assert.equal(result.history.contexts[0].states[0].adaptation.pair.length, result.history.limits.valueLength);
  assert.equal(result.history.unknowns.length, 2);
});

test('sampler preserves attribute removal and cleans up exceptions', async () => {
  const dom = fixture(), promise = dom.start();
  dom.frame(children => { delete children[0].dataset.pair; });
  for (let n = 0; n < 7; n++) dom.frame();
  assert.deepEqual(plain((await promise).history.contexts[0].states.map(s => s.adaptation)), [{ pair: 'off' }, {}]);
  const failed = fixture({ throwOnRect: true }), failure = failed.start();
  failed.frame();
  await assert.rejects(failure, /fixture geometry unavailable/);
  assert.equal(failed.pending.size + failed.timers.size, 0);
  assert.throws(() => fixture().start({ root: '#missing' }), /Inspector root missing/);
});

test('sampled selector replacement and positional reordering remain explicitly ambiguous', async () => {
  const dom = fixture({ children: 2, ids: false }), promise = dom.start();
  dom.frame(() => { dom.scope.children.reverse(); });
  for (let n = 0; n < 7; n++) dom.frame();
  const result = plain(await promise);
  assert.equal(result.history.truncated, true);
  assert(result.history.contexts.every(c => c.selectorStable === false));
  const replaced = fixture(), replacementPromise = replaced.start();
  replaced.frame(children => {
    const replacement = { ...children[0], dataset: { pair: 'on' } };
    replaced.scope.children = [replacement];
  });
  for (let n = 0; n < 7; n++) replaced.frame();
  const replacement = plain(await replacementPromise);
  assert.equal(replacement.history.contexts[0].present, false);
  assert.equal(replacement.history.truncated, true);
  assert.equal(replacement.history.contexts[0].revisited, 0);
});

const record = (phase, width, adaptation, extras = {}) => ({ phase, requestedViewport: { width, height: 800 },
  inspection: { layoutContexts: [{ selector: '#sheet', adaptation }], ...extras },
});

test('same-size path comparison reports deliberate hysteresis as observed differences', () => {
  const records = [record('forward', 610, { pair: 'off' }), record('forward', 615, { pair: 'off' }), record('forward', 620, { pair: 'on' }),
    record('reverse', 615, { pair: 'on' }), record('reverse', 610, { pair: 'off' })];
  const before = structuredClone(records), result = compareSweepPaths(records);
  assert.equal(result.comparisons.length, 2);
  assert.equal(result.differencesTotal, 1);
  assert.deepEqual(result.comparisons[1].differences, [{ selector: '#sheet', forward: { pair: 'off' }, reverse: { pair: 'on' } }]);
  assert.deepEqual(result.comparisons[1].requestedViewport, { width: 615, height: 800 });
  assert.match(result.limitation, /intentional hysteresis/);
  assert.deepEqual(records, before);
});

test('path comparison canonicalizes adaptation order and ignores unrelated computed geometry', () => {
  const records = [record('forward', 615, { pair: 'on', fit: 'yes' }), record('reverse', 615, { fit: 'yes', pair: 'on' })];
  records[0].inspection.layoutContexts[0].box = { width: 100 };
  records[1].inspection.layoutContexts[0].box = { width: 200 };
  const result = compareSweepPaths(records);
  assert.equal(result.differencesTotal, 0);
  assert.equal(result.comparisons[0].comparedContexts, 1);
  assert.equal(result.truncated, false);
});

test('text-only sampled contexts supplement control ancestry using final states after history caps', async () => {
  const records = [];
  for (const phase of ['forward', 'reverse']) {
    const dom = fixture({ adaptation: {} }); dom.scope.dataset.pair = 'off'; dom.scope.children = [];
    const promise = dom.start();
    for (let n = 1; n <= 20; n++) dom.frame(() => { dom.scope.dataset.pair = String(n); }, 1);
    if (phase === 'reverse') dom.scope.dataset.pair = 'latched';
    for (let n = 0; n < 8; n++) dom.frame();
    records.push({ phase, requestedViewport: { width: 615, height: 800 }, inspection: { layoutContexts: [] }, settlement: plain(await promise) });
  }
  const result = compareSweepPaths(records);
  assert.equal(result.differencesTotal, 1);
  assert.deepEqual(result.comparisons[0].differences, [{ selector: '#scope', forward: { pair: '20' }, reverse: { pair: 'latched' } }]);
  assert.equal(records[1].settlement.history.contexts[0].states.length, 16);
  const empty = compareSweepPaths([record('forward', 615, {}), record('reverse', 615, {})]);
  assert.equal(empty.comparisons[0].comparedContexts, 0);
  assert.match(empty.unknowns.join(' '), /no comparable classified contexts/);
});

test('missing, duplicated, invalid and truncated context evidence is explicitly unknown', () => {
  const forward = record('forward', 615, { pair: 'on' });
  const reverse = record('reverse', 615, { pair: 'on' }, { layoutContextsTruncated: true });
  reverse.inspection.layoutContexts.push({ selector: '#sheet', adaptation: { pair: 'off' } }, { selector: '#only-reverse', adaptation: { rail: 'on' } });
  const result = compareSweepPaths([forward, reverse, record('other', 1, {})]);
  assert.equal(result.comparisons[0].comparedContexts, 0);
  assert.equal(result.comparisons[0].unknownContexts, 2);
  assert.equal(result.truncated, true);
  assert.match(result.unknowns.join(' '), /truncated.*duplicate.*phase.*cannot be compared/);
  assert.match(compareSweepPaths(null).unknowns[0], /unavailable/);
  assert.match(compareSweepPaths([record('forward', 615, {})]).unknowns.join(' '), /no reverse/);
  const missing = record('reverse', 615, {}); delete missing.inspection.layoutContexts;
  assert.match(compareSweepPaths([forward, missing]).unknowns.join(' '), /layout contexts unavailable/);
  const capped = record('reverse', 615, {});
  capped.settlement = { truncated: true, history: { contexts: [], truncated: false, unknowns: ['Element sampling cap reached'] } };
  const incomplete = compareSweepPaths([forward, capped]);
  assert.equal(incomplete.truncated, true);
  assert.match(incomplete.unknowns.join(' '), /sampled history coverage truncated or incomplete/);
});

test('path analysis bounds records, contexts, comparisons and retained differences', () => {
  const manyContexts = n => Array.from({ length: n }, (_, i) => ({ selector: `#item-${i}`, adaptation: { pair: String(i) } }));
  const forward = record('forward', 615, {}), reverse = record('reverse', 615, {});
  forward.inspection.layoutContexts = manyContexts(300);
  reverse.inspection.layoutContexts = manyContexts(300).map(c => ({ ...c, adaptation: { pair: 'different' } }));
  const result = compareSweepPaths([forward, reverse]);
  assert.equal(result.comparisons[0].comparedContexts, result.limits.contextsPerRecord);
  assert.equal(result.comparisons[0].differences.length, result.limits.differences);
  assert.equal(result.differencesTotal, result.limits.contextsPerRecord);
  assert.equal(result.truncated, true);
  const large = compareSweepPaths([...Array(16).fill(forward), ...Array(17).fill(reverse)]);
  assert.equal(large.comparisons.length, large.limits.comparisons);
  assert(large.unknowns.length <= large.limits.unknowns);
  assert.match(large.unknowns.join(' '), /Record cap.*Comparison cap/);
});
