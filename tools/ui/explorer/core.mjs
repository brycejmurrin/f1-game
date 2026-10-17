// @doc Validated UI replay data, semantic atlas states and bounded delta debugging without executable input.
/** Validated replay data, semantic atlas states and bounded delta debugging.
 * ddmin reference: https://www.debuggingbook.org/html/DeltaDebugger.html
 * No scenario field is executable JavaScript; browser operations live in the adapter.
 */
import { createHash } from 'node:crypto';

const ID = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const STATES = ['visible', 'hidden', 'attached', 'detached'];
const ROLES = new Set(('alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox complementary contentinfo definition deletion dialog directory document emphasis feed figure form generic grid gridcell group heading img insertion link list listbox listitem log main marquee math meter menu menubar menuitem menuitemcheckbox menuitemradio navigation none note option paragraph presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status strong subscript superscript switch tab table tablist tabpanel term textbox time timer toolbar tooltip tree treegrid treeitem').split(' '));
const SEMANTIC = ['id', 'selector', 'role', 'name', 'label', 'type', 'disabled', 'checked', 'value', 'expanded', 'pressed', 'selected', 'open'];
const fail = message => { throw new TypeError(message); };
const object = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label} must be an object`);
};
const fields = (value, allowed, label) => {
  object(value, label);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${label}: unknown field ${key}`);
};
const text = (value, label, max = 2048, empty = false) => {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || value.includes('\0')) fail(`${label} must be ${empty ? 'a' : 'a nonempty'} string of at most ${max} characters`);
  return value;
};
const slug = (value, label) => {
  if (typeof value !== 'string' || !ID.test(value)) fail(`${label} must be a safe filename identifier`);
  return value;
};
const number = (value, label, min, max, integer = false) => {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(`${label} must be ${integer ? 'an integer' : 'finite'} in ${min}..${max}`);
  return value;
};
const choice = (value, choices, label) => {
  if (!choices.includes(value)) fail(`${label} must be one of ${choices.join(', ')}`);
  return value;
};
const selector = value => text(value, 'selector');
const state = value => choice(value === undefined ? 'visible' : value, STATES, 'state');

function action(input) {
  object(input, 'action');
  const type = input.type;
  const shape = keys => fields(input, ['type', ...keys], `${type} action`);
  switch (type) {
    case 'click': {
      shape(['selector', 'role', 'name', 'exact']);
      if (input.selector !== undefined) {
        if (['role', 'name', 'exact'].some(key => input[key] !== undefined)) fail('click requires selector OR exact role/name');
        return { type, selector: selector(input.selector) };
      }
      if (!ROLES.has(input.role) || (input.exact !== undefined && input.exact !== true)) fail('click role/name must use a valid role and exact matching');
      return { type, role: input.role, name: text(input.name, 'name'), exact: true };
    }
    case 'fill': case 'select':
      shape(['selector', 'value']);
      return { type, selector: selector(input.selector), value: text(input.value, 'value', 8192, true) };
    case 'press':
      shape(['key']);
      return { type, key: text(input.key, 'key', 80) };
    case 'viewport':
      shape(['width', 'height']);
      return { type, width: number(input.width, 'width', 240, 4096, true), height: number(input.height, 'height', 240, 4096, true) };
    case 'textScale':
      shape(['percent']);
      return { type, percent: number(input.percent, 'percent', 50, 300) };
    case 'offline':
      shape(['value']);
      if (typeof input.value !== 'boolean') fail('offline value must be boolean');
      return { type, value: input.value };
    case 'reload':
      shape([]);
      return { type };
    case 'wait':
      shape(['selector', 'state']);
      return { type, selector: selector(input.selector), state: state(input.state) };
    case 'checkpoint':
      shape(['label']);
      return { type, label: text(input.label, 'label', 160) };
    case 'scene': {
      shape(['track', 'frac', 'cameras']);
      const result = { type, track: slug(input.track, 'track'), frac: number(input.frac, 'frac', 0, 1) };
      if (input.cameras !== undefined) {
        if (!Array.isArray(input.cameras) || input.cameras.length !== 1) fail('a scene action has one final camera; use scene --scene-views for a capture fan-out');
        result.cameras = Array.from(input.cameras, camera => slug(camera, 'camera'));
      }
      return result;
    }
    default: fail(`unsupported action type: ${String(type)}`);
  }
}

function oracle(input) {
  object(input, 'oracle');
  switch (input.type) {
    case 'game': {
      fields(input, ['type', 'track', 'weather', 'state'], 'game oracle');
      if (!input.track && !input.weather && !input.state) fail('game oracle needs a specific state');
      const result = { type: input.type };
      if (input.track !== undefined) result.track = slug(input.track, 'track');
      if (input.weather !== undefined) result.weather = choice(input.weather, ['dry', 'wet', 'rain', 'storm', 'fog', 'overcast'], 'weather');
      if (input.state !== undefined) result.state = choice(input.state, ['menu', 'count', 'race', 'results'], 'state');
      return result;
    }
    case 'selector':
      fields(input, ['type', 'selector', 'state'], 'selector oracle');
      return { type: input.type, selector: selector(input.selector), state: state(input.state) };
    case 'text':
      fields(input, ['type', 'selector', 'text'], 'text oracle');
      return { type: input.type, selector: selector(input.selector), text: text(input.text, 'text') };
    case 'console': {
      fields(input, ['type', 'pattern', 'kind'], 'console oracle');
      const result = { type: input.type, pattern: text(input.pattern, 'pattern') };
      if (input.kind !== undefined) result.kind = choice(input.kind, ['pageerror', 'console'], 'kind');
      return result;
    }
    case 'layout': {
      fields(input, ['type', 'kind', 'selector'], 'layout oracle');
      const result = { type: input.type };
      if (input.kind !== undefined) result.kind = choice(input.kind, ['offscreen', 'unnamed', 'overflow', 'tiny-target', 'clipped', 'blocked', 'not-hit-testable', 'binding-mismatch'], 'kind');
      if (input.selector !== undefined) result.selector = selector(input.selector);
      return result;
    }
    default: fail(`unsupported oracle type: ${String(input.type)}`);
  }
}

export function validateScenario(input) {
  fields(input, ['version', 'id', 'goal', 'actions', 'oracle'], 'scenario');
  if (input.version !== undefined && input.version !== 1) fail('scenario version must be 1');
  if (!Array.isArray(input.actions) || input.actions.length > 256) fail('actions must be an array of at most 256 actions');
  const result = { version: 1, id: slug(input.id, 'id'), goal: text(input.goal, 'goal'), actions: Array.from(input.actions, action) };
  if (input.oracle !== undefined) result.oracle = oracle(input.oracle);
  return result;
}

function signature(snapshot) {
  object(snapshot, 'snapshot');
  const result = {};
  for (const group of ['roots', 'dialogs', 'controls']) {
    const entries = snapshot[group] ?? [];
    if (!Array.isArray(entries) || entries.length > 2048) fail(`${group} must be a bounded array`);
    result[group] = Array.from(entries, entry => {
      if (typeof entry === 'string') return text(entry, group);
      object(entry, group);
      const picked = {};
      for (const key of SEMANTIC) if (entry[key] !== undefined) {
        const value = entry[key];
        if (!['string', 'boolean', 'number'].includes(typeof value) && value !== null) fail(`${group}.${key} must be scalar`);
        if (typeof value === 'number' && !Number.isFinite(value)) fail(`${group}.${key} must be finite`);
        if (typeof value === 'string') text(value, `${group}.${key}`, 8192, true);
        picked[key] = value;
      }
      return picked;
    }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
  }
  object(snapshot.viewport, 'viewport');
  result.viewport = {
    width: number(snapshot.viewport.width, 'width', 240, 4096, true),
    height: number(snapshot.viewport.height, 'height', 240, 4096, true),
  };
  if (snapshot.viewport.textScale !== undefined) result.viewport.textScale = number(snapshot.viewport.textScale, 'textScale', 50, 300);
  return result;
}

export function stateKey(snapshot) {
  return createHash('sha256').update(JSON.stringify(signature(snapshot))).digest('hex');
}

export function addGraphStep(graph, before, after, input) {
  object(graph, 'graph');
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) fail('graph requires nodes and edges arrays');
  const operation = action(input);
  const states = [before, after].map(snapshot => {
    const normalized = signature(snapshot);
    const key = stateKey(normalized);
    return { id: `s-${key}`, key, snapshot: normalized };
  });
  const missing = states.filter((node, i) => !graph.nodes.some(old => old.key === node.key) && states.findIndex(other => other.key === node.key) === i);
  const edge = { from: states[0].id, to: states[1].id, action: operation };
  const exists = graph.edges.some(old => old.from === edge.from && old.to === edge.to && JSON.stringify(old.action) === JSON.stringify(operation));
  if (graph.nodes.length + missing.length > 256 || graph.edges.length + Number(!exists) > 1024) throw new RangeError('atlas graph capacity reached (256 states / 1024 edges)');
  graph.nodes.push(...missing);
  if (!exists) graph.edges.push(edge);
  return edge;
}

/** Caller resets the browser on EVERY callback and returns true only for the same oracle.
 * Complete means deletion-1-minimal for successful replays, never globally shortest.
 */
export async function minimizeActions(actions, reproduces, { maxAttempts = 30 } = {}) {
  if (!Array.isArray(actions) || actions.length > 256 || typeof reproduces !== 'function') fail('minimizer requires at most 256 actions and a replay callback');
  number(maxAttempts, 'maxAttempts', 1, 1000, true);
  let current = Array.from(actions, action), attempts = 0, replayErrors = 0;
  const replay = async candidate => {
    attempts++;
    try {
      const result = await reproduces(structuredClone(candidate));
      if (typeof result !== 'boolean') throw new TypeError('replay must return a boolean');
      return result;
    } catch { replayErrors++; return false; }
  };
  const result = (reproduced, complete, reason) => ({ actions: current, attempts, reproduced, complete, ...(reason ? { reason } : {}) });
  if (!await replay(current)) return result(false, false, replayErrors ? 'baseline-replay-error' : 'baseline-not-reproduced');
  if (!current.length) return result(true, true);
  if (attempts >= maxAttempts) return result(true, false, 'budget-exhausted');
  if (await replay([])) { current = []; return result(true, true); }
  let granularity = 2;
  while (current.length > 1) {
    const size = Math.ceil(current.length / granularity);
    let reduced = false;
    for (let start = 0; start < current.length; start += size) {
      if (attempts >= maxAttempts) return result(true, false, replayErrors ? 'budget-exhausted-with-replay-errors' : 'budget-exhausted');
      const candidate = [...current.slice(0, start), ...current.slice(start + size)];
      if (await replay(candidate)) {
        current = candidate;
        granularity = Math.max(2, granularity - 1);
        reduced = true;
        break;
      }
    }
    if (!reduced) {
      if (granularity >= current.length) break;
      granularity = Math.min(current.length, granularity * 2);
    }
  }
  return result(true, replayErrors === 0, replayErrors ? 'candidate-replay-error' : undefined);
}
