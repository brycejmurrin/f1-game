import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScenario, stateKey, addGraphStep, minimizeActions } from '../../tools/ui/explorer/core.mjs';

const scenario = actions => ({ id: 'garage-to-race', goal: 'Change the car and start a race', actions });
const checkpoint = label => ({ type: 'checkpoint', label });
const snapshot = changes => ({
  roots: [{ id: 'title', role: 'main' }], dialogs: [],
  controls: [{ selector: '#start', role: 'button', name: 'Start', disabled: false }],
  viewport: { width: 844, height: 390 }, ...changes,
});

test('validates and normalizes every bounded replay action without executing data', () => {
  const source = scenario([
    { type: 'click', role: 'button', name: 'Start' }, { type: 'click', selector: '#garage' },
    { type: 'fill', selector: '#name', value: '' }, { type: 'select', selector: '#track', value: 'monaco' },
    { type: 'press', key: 'Shift+Tab' }, { type: 'viewport', width: 390, height: 844 },
    { type: 'textScale', percent: 200 }, { type: 'offline', value: true }, { type: 'reload' },
    { type: 'wait', selector: '#garage' }, checkpoint('Ready'),
    { type: 'scene', track: 'monaco', frac: 0.75, cameras: ['orbit'] },
  ]);
  const normalized = validateScenario(source);
  assert.equal(normalized.version, 1);
  assert.equal(normalized.actions[0].exact, true);
  assert.equal(normalized.actions[9].state, 'visible');
  normalized.actions[11].cameras.push('top');
  assert.deepEqual(source.actions[11].cameras, ['orbit'], 'normalization must not retain input arrays');
  assert.equal(source.actions[0].exact, undefined);
});

test('rejects unsafe identifiers, executable shapes, ambiguous locators and unbounded actions', () => {
  const invalid = [
    { ...scenario([]), id: '../outside' }, { ...scenario([]), version: 2 },
    { ...scenario([]), goal: '' }, { ...scenario([]), script: 'window.alert(1)' },
    scenario([{ type: 'evaluate', expression: 'fetch("/secret")' }]),
    scenario([{ type: 'reload', script: 'alert(1)' }]),
    scenario([{ type: 'click', selector: '#x', role: 'button', name: 'X' }]),
    scenario([{ type: 'click', role: 'button', name: 'Start', exact: false }]),
    scenario([{ type: 'click', role: 'bogus', name: 'Start' }]),
    scenario([{ type: 'click', selector: '' }]),
    scenario([{ type: 'fill', selector: '#x', value: 'a'.repeat(8193) }]),
    scenario([{ type: 'select', selector: '#x', value: ['a'] }]),
    scenario([{ type: 'press', key: 'a'.repeat(81) }]),
    scenario([{ type: 'viewport', width: 100000, height: 390 }]),
    scenario([{ type: 'viewport', width: 844.5, height: 390 }]),
    scenario([{ type: 'viewport', width: NaN, height: 390 }]),
    scenario([{ type: 'textScale', percent: Infinity }]),
    scenario([{ type: 'textScale', percent: 400 }]),
    scenario([{ type: 'offline', value: 'true' }]),
    scenario([{ type: 'wait', selector: '#x', state: 'forever' }]),
    scenario([{ type: 'wait', selector: '#x', state: null }]),
    scenario([{ type: 'checkpoint', label: 'bad\0label' }]),
    scenario([{ type: 'scene', track: '../monaco', frac: 0.2 }]),
    scenario([{ type: 'scene', track: 'monaco', frac: -0.01 }]),
    scenario([{ type: 'scene', track: 'monaco', frac: Infinity }]),
    scenario([{ type: 'scene', track: 'monaco', frac: 0.1, cameras: ['orbit;eval()'] }]),
    scenario([{ type: 'scene', track: 'monaco', frac: 0.1, cameras: ['chase', 'orbit'] }]),
    scenario(Array(257).fill(checkpoint('step'))),
    scenario(Array(1)),
    scenario([{ type: 'scene', track: 'monaco', frac: 0.1, cameras: Array(1) }]),
  ];
  for (const input of invalid) assert.throws(() => validateScenario(input), TypeError, JSON.stringify(input).slice(0, 180));
});

test('normalizes declarative oracles and refuses arbitrary code or regex objects', () => {
  const oracles = [
    { type: 'selector', selector: '#garage' },
    { type: 'text', selector: '#status', text: 'Ready' },
    { type: 'console', pattern: 'Failed [literal]', kind: 'pageerror' },
    { type: 'layout', kind: 'offscreen', selector: '#start' },
  ];
  for (const oracle of oracles) assert.equal(validateScenario({ ...scenario([]), oracle }).oracle.type, oracle.type);
  assert.equal(validateScenario({ ...scenario([]), oracle: oracles[0] }).oracle.state, 'visible');
  for (const oracle of [
    { type: 'evaluate', expression: 'true' }, { type: 'console', pattern: /error/ },
    { type: 'console', pattern: 'error', kind: 'any-code' }, { type: 'layout', kind: 'unknown' },
    { type: 'text', selector: '#status', text: 'Ready', script: 'true' },
  ]) assert.throws(() => validateScenario({ ...scenario([]), oracle }), TypeError);
});

test('state signature ignores timers, logs and source ordering but preserves interaction states', () => {
  const first = snapshot({
    time: 123, logs: ['first'], roots: [{ role: 'main', id: 'title', time: 1 }],
    controls: [{ role: 'button', name: 'Start', selector: '#start', disabled: false }, { selector: '#back', name: 'Back' }],
  });
  const later = snapshot({
    time: 9999, logs: ['second'], roots: [{ id: 'title', role: 'main', time: 99 }],
    controls: [{ name: 'Back', selector: '#back' }, { selector: '#start', disabled: false, name: 'Start', role: 'button', elapsedMs: 8000 }],
  });
  assert.equal(stateKey(first), stateKey(later));
  assert.notEqual(stateKey(first), stateKey({ ...later, dialogs: [{ role: 'dialog', name: 'Settings' }] }));
  assert.notEqual(stateKey(first), stateKey({ ...later, viewport: { width: 390, height: 844 } }));
  assert.notEqual(stateKey(first), stateKey({ ...later, controls: later.controls.map(c => ({ ...c, disabled: true })) }));
  assert.throws(() => stateKey(snapshot({ controls: [{ value: Infinity }] })), /finite/);
});

test('atlas reuses deterministic nodes and edges, records different actions and does not split on time', () => {
  const before = snapshot(), after = snapshot({ dialogs: ['garage'] });
  const graph = { nodes: [], edges: [] }, other = { nodes: [], edges: [] };
  const click = { type: 'click', selector: '#garage' };
  const edge = addGraphStep(graph, before, after, click);
  addGraphStep(graph, { ...before, time: 10 }, { ...after, time: 500 }, click);
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 1);
  assert.deepEqual(addGraphStep(other, before, after, click), edge);
  addGraphStep(graph, before, after, { type: 'press', key: 'Enter' });
  assert.equal(graph.edges.length, 2);
  assert.equal(graph.nodes.length, 2);
  assert.equal('time' in graph.nodes[0].snapshot, false);
  const self = { nodes: [], edges: [] };
  addGraphStep(self, before, before, checkpoint('unchanged'));
  assert.equal(self.nodes.length, 1);
});

test('atlas capacity is atomic: rejected steps leave the existing graph untouched', () => {
  const graph = { nodes: [], edges: [] };
  const base = snapshot();
  for (let n = 0; n < 255; n++) addGraphStep(graph, base, snapshot({ roots: [`screen-${n}`] }), checkpoint('visit'));
  const original = structuredClone(graph);
  assert.throws(() => addGraphStep(graph, base, snapshot({ roots: ['overflow'] }), checkpoint('visit')), RangeError);
  assert.deepEqual(graph, original);
  const edgeFull = { nodes: [], edges: [] };
  for (let n = 0; n < 1024; n++) addGraphStep(edgeFull, base, base, checkpoint(`visit-${n}`));
  assert.throws(() => addGraphStep(edgeFull, base, base, checkpoint('overflow')), RangeError);
  assert.equal(edgeFull.edges.length, 1024);
});

test('ddmin removes chunks, preserves order, checks baseline first and isolates caller mutation', async () => {
  const actions = ['noise-1', 'noise-2', 'setup', 'trigger', 'noise-3', 'noise-4', 'noise-5', 'noise-6'].map(checkpoint);
  const seen = [];
  const result = await minimizeActions(actions, async candidate => {
    const labels = candidate.map(a => a.label);
    seen.push(labels);
    candidate.push(checkpoint('callback-mutation'));
    return labels.includes('setup') && labels.includes('trigger') && labels.indexOf('setup') < labels.indexOf('trigger');
  });
  assert.deepEqual(seen[0], actions.map(a => a.label));
  assert(seen.some(labels => labels.length === 4), 'must try removing chunks, not only individual actions');
  assert.deepEqual(result.actions.map(a => a.label), ['setup', 'trigger']);
  assert.equal(result.reproduced, true);
  assert.equal(result.complete, true);
  assert.equal(result.attempts, seen.length);
  assert.equal(actions.length, 8);
});

test('ddmin handles nonmonotonic reproduction and reports 1-minimal rather than globally shortest', async () => {
  const result = await minimizeActions(['a', 'b', 'c', 'd'].map(checkpoint), async candidate => {
    const labels = candidate.map(a => a.label);
    return labels.includes('b') && (labels.length === 4 || labels.length === 1);
  });
  assert.equal(result.reproduced, true);
  assert.equal(result.complete, true);
  assert.equal(result.actions.length, 4, 'all one-deletion candidates fail; do not claim a global minimum');
});

test('false baseline and baseline replay errors do not claim reproduction', async () => {
  let attempts = 0;
  const actions = [checkpoint('step')];
  const absent = await minimizeActions(actions, async () => { attempts++; return false; });
  assert.deepEqual(absent, { actions, attempts: 1, reproduced: false, complete: false, reason: 'baseline-not-reproduced' });
  assert.equal(attempts, 1);
  const failed = await minimizeActions(actions, async () => { throw new Error('navigation timeout'); });
  assert.equal(failed.reproduced, false);
  assert.equal(failed.reason, 'baseline-replay-error');
});

test('candidate replay errors are unresolved, never a reproduced bug or a complete proof', async () => {
  const actions = ['a', 'bug', 'b', 'c'].map(checkpoint);
  const result = await minimizeActions(actions, async candidate => {
    if (candidate.length < actions.length) throw new Error('broken setup, a different failure');
    return true;
  });
  assert.deepEqual(result.actions, actions);
  assert.equal(result.reproduced, true, 'baseline reproduces the original bug');
  assert.equal(result.complete, false);
  assert.equal(result.reason, 'candidate-replay-error');
});

test('minimizer strictly honors replay budget, including baseline and empty trial', async () => {
  let callbacks = 0;
  const result = await minimizeActions(['a', 'bug', 'b'].map(checkpoint), async candidate => {
    callbacks++; return candidate.some(a => a.label === 'bug');
  }, { maxAttempts: 2 });
  assert.equal(callbacks, 2);
  assert.equal(result.attempts, 2);
  assert.equal(result.complete, false);
  assert.equal(result.reason, 'budget-exhausted');
  assert.equal(result.actions.length, 3);
  for (const maxAttempts of [0, -1, Infinity, 2.5, 1001]) {
    await assert.rejects(minimizeActions([], async () => true, { maxAttempts }), TypeError);
  }
});

test('a bug that reproduces without actions reduces to an empty replay; invalid verdicts are errors', async () => {
  const result = await minimizeActions([checkpoint('noise')], async () => true);
  assert.deepEqual(result, { actions: [], attempts: 2, reproduced: true, complete: true });
  const invalid = await minimizeActions([], async () => ({ error: 'not a boolean' }));
  assert.equal(invalid.reason, 'baseline-replay-error');
});
