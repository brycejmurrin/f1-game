// @doc Replay bounded lazy-script faults through an existing session/action adapter; no browser controller.
// Contracts inspected 2026-10-30: https://playwright.dev/docs/api/class-route
// https://playwright.dev/docs/api/class-browsercontext
// https://playwright.dev/docs/api/class-request#request-resource-type (inspected 2026-10-31)
import { validateScenario } from './core.mjs';

const ID = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const faultTypes = new Set(['faultHold', 'faultWait', 'faultRelease']);
const fail = message => { throw new TypeError(message); };
function faultAction(a) {
  if (!a || !faultTypes.has(a.type) || !ID.test(a.id) || typeof a.id !== 'string') fail('Invalid fault action or id');
  const allowed = a.type === 'faultHold' ? ['type', 'id', 'path', 'timeoutMs'] : a.type === 'faultRelease' ? ['type', 'id', 'outcome'] : ['type', 'id'];
  if (Object.keys(a).some(k => !allowed.includes(k))) fail('Unknown fault action field');
  const out = { type: a.type, id: a.id };
  if (a.type === 'faultHold') {
    if (typeof a.path !== 'string' || a.path.length > 200 || !/^\/js\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.js$/.test(a.path)) fail('Fault path must be an exact /js/ JavaScript pathname');
    const timeoutMs = a.timeoutMs ?? 15000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) fail('Fault deadline must be 100–30000 ms');
    Object.assign(out, { path: a.path, timeoutMs });
  }
  if (a.type === 'faultRelease') {
    if (!['continue', 'reject'].includes(a.outcome ?? 'continue')) fail('Invalid fault outcome');
    out.outcome = a.outcome ?? 'continue';
  }
  return out;
}

/** Extension fixture only: ordinary actions/oracles retain the existing validator. */
export function validateFaultScenario(raw) {
  if (!Array.isArray(raw?.actions) || raw.actions.length > 256) fail('Fault scenario requires at most 256 actions');
  const faults = new Map();
  const normalized = validateScenario({ ...raw, actions: Array.from(raw.actions, (a, i) => {
    if (!faultTypes.has(a?.type)) return a;
    faults.set(i, faultAction(a));
    return { type: 'checkpoint', label: 'Fault schedule operation' };
  }) });
  const holds = new Map(), paths = new Set();
  normalized.actions = normalized.actions.map((a, i) => faults.get(i) || a);
  for (const a of faults.values()) {
    if (a.type === 'faultHold') {
      if (holds.size >= 4 || holds.has(a.id) || paths.has(a.path)) fail('At most four unique fault ids and paths');
      holds.set(a.id, 'armed'); paths.add(a.path);
    } else if (a.type === 'faultWait') {
      if (holds.get(a.id) !== 'armed') fail('Fault wait requires an armed hold');
      holds.set(a.id, 'observed');
    } else {
      if (holds.get(a.id) !== 'observed') fail('Fault release requires a preceding wait');
      holds.set(a.id, 'released');
    }
  }
  if (!holds.size || [...holds.values()].some(state => state !== 'released')) fail('Fault scenario must release every declared hold');
  return normalized;
}

/** Owns routing only; the caller retains ownership of its session/browser. */
export async function installFaultSchedule(context, origin, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (new URL(origin).origin !== origin) fail('Fault origin must be an HTTP(S) origin');
  if (!['http:', 'https:'].includes(new URL(origin).protocol)) fail('Fault origin must be HTTP(S)');
  const holds = new Map(), events = [];
  let closed = false;
  const event = (h, state) => events.push({ id: h.id, path: h.path, state });
  const get = id => { const h = holds.get(id); if (!h) throw new Error(`Unknown fault ${id}`); return h; };
  const finish = (h, outcome) => {
    if (h.outcome) return;
    h.outcome = outcome; clearTimer(h.timer); h.signalObserved(false); h.resume(outcome); event(h, outcome);
  };
  const handler = async route => {
    const request = route.request(), url = new URL(request.url());
    // A cache-warming fetch of a script URL is not classic-script evaluation.
    if (request.resourceType() !== 'script') return route.fallback();
    const h = [...holds.values()].find(h => !h.outcome && !h.request && url.origin === origin && url.pathname === h.path);
    if (!h) return route.fallback();
    h.request = request; event(h, 'observed'); h.signalObserved(true);
    try {
      const outcome = await h.decision;
      if (outcome === 'continue') await route.fallback(); else await route.abort('failed');
      h.settled = true; event(h, 'settled');
    } catch (error) { h.error = String(error?.message || error).slice(0, 512); event(h, 'route-error'); }
    finally { h.complete(); }
  };
  const watchTransfer = h => {
    let timer, done;
    const promise = new Promise(resolve => { done = resolve; });
    const stop = result => {
      clearTimer(timer);
      context.off('requestfinished', finished); context.off('requestfailed', failed); context.off('close', lost);
      done(result);
    };
    const finished = request => { if (request === h.request) stop('finished'); };
    const failed = request => { if (request === h.request) stop('failed'); };
    const lost = () => stop('context-closed');
    context.on('requestfinished', finished); context.on('requestfailed', failed); context.on('close', lost);
    timer = setTimer(() => stop('transfer-timeout'), h.timeoutMs);
    return { promise, cancel: () => stop('cancelled') };
  };
  await context.route('**/*', handler);
  return {
    events,
    hold(input) {
      const a = faultAction({ ...input, type: 'faultHold' });
      if (closed || holds.size >= 4 || holds.has(a.id) || [...holds.values()].some(h => h.path === a.path)) throw new Error('Fault schedule closed, duplicated or full');
      const h = { ...a, outcome: null, request: null, settled: false, waited: false, transfer: false };
      h.observed = new Promise(resolve => { h.signalObserved = resolve; });
      h.decision = new Promise(resolve => { h.resume = resolve; });
      h.completed = new Promise(resolve => { h.complete = resolve; });
      holds.set(h.id, h); event(h, 'armed');
      h.timer = setTimer(() => finish(h, 'timeout'), h.timeoutMs);
    },
    async wait(id) {
      const h = get(id);
      if (!await h.observed || h.outcome || h.waited) throw new Error(`Fault ${id} was not observed before its deadline, or wait was repeated`);
      h.waited = true;
    },
    async release(id, outcome = 'continue') {
      faultAction({ type: 'faultRelease', id, outcome });
      const h = get(id);
      if (!h.waited || h.outcome) throw new Error(`Fault ${id} requires an observed, unreleased hold`);
      const transfer = watchTransfer(h);
      try {
        finish(h, outcome); await h.completed;
        if (h.error) throw new Error(`Fault ${id} route failed: ${h.error}`);
        const terminal = await transfer.promise; event(h, terminal);
        if (terminal !== (outcome === 'continue' ? 'finished' : 'failed')) throw new Error(`Fault ${id} unexpected transfer: ${terminal}`);
        h.transfer = true;
      } finally { transfer.cancel(); }
    },
    assertComplete() {
      for (const h of holds.values()) if (!h.waited || !h.settled || !h.transfer || h.error)
        throw new Error(`Fault ${h.id} incomplete: ${h.error || h.outcome || 'not released'}`);
    },
    async close() {
      if (closed) return;
      closed = true;
      for (const h of holds.values()) finish(h, 'cleanup');
      try { await context.unroute('**/*', handler); }
      finally { await Promise.all([...holds.values()].filter(h => h.request).map(h => h.completed)); }
    },
  };
}

/** Replay saved data with the caller's existing ordinary-action driver and oracle. */
export async function replayFaultScenario(session, raw, { performAction, matchesOracle, ...timers } = {}) {
  const scenario = validateFaultScenario(raw);
  if (typeof performAction !== 'function' || scenario.oracle && typeof matchesOracle !== 'function') fail('Replay requires its existing action/oracle adapters');
  const faults = await installFaultSchedule(session.context, new URL(session.page.url()).origin, timers);
  let failure;
  try {
    for (const a of scenario.actions) {
      if (a.type === 'faultHold') faults.hold(a);
      else if (a.type === 'faultWait') await faults.wait(a.id);
      else if (a.type === 'faultRelease') await faults.release(a.id, a.outcome);
      else await performAction(session, a);
    }
    faults.assertComplete();
    if (scenario.oracle && !await matchesOracle(session, scenario.oracle)) throw new Error('Fault scenario oracle was not satisfied');
  } catch (error) { failure = error instanceof Error ? error : new Error(String(error)); }
  finally {
    try { await faults.close(); }
    catch (error) { failure = failure ? new AggregateError([failure, error], 'Fault replay and cleanup failed') : error; }
  }
  const evidence = { scenario, events: structuredClone(faults.events) };
  if (failure) { failure.faultEvidence = evidence; throw failure; }
  return evidence;
}
