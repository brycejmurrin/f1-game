// @doc Bounded adaptive classification histories and forward/reverse viewport path comparisons.
/** Self-contained for page.evaluate: sample layout and bounded classifier history. */
export function settleLayout({ root } = {}) {
  const scope = document.querySelector(root || "body");
  if (!scope) throw new Error(`Inspector root missing: ${root}`);
  const keys = ["shape", "density", "pair", "rail", "fit"];
  const limits = { elements: 500, frames: 120, elapsedMs: 2000, contexts: 128, statesPerContext: 16, states: 1024, evidencePerContext: 8, valueLength: 256, selectorLength: 2048 };
  const started = performance.now(), entries = new Map(), selectors = new Map();
  const history = { contexts: [], limits, truncated: false, unknowns: [], limitation: "Sampled classification changes and revisits are observations, not confirmed bugs; quiet frames cannot rule out later changes. Context insertion/removal is not a classification transition." };
  let previous = "", same = 0, frames = 0, states = 0, truncated = false, animating = 0;
  // Geometry alone misses a fade or a pointer-events transition: a sheet whose
  // opacity is still animating has a final box and still answers hit tests
  // with <html> (career/garage/track-detail at the boot size, 2026-10-17).
  // Count finite running animations on the root, inside it or on an ancestor;
  // infinite ones (HUD pulses) can never finish and are ignored.
  const runningAnimations = () => {
    try {
      return document.getAnimations().filter(a => {
        const t = a.effect?.target, end = a.effect?.getComputedTiming?.().endTime;
        return a.playState === "running" && Number.isFinite(end) && !!t && (scope.contains(t) || t.contains(scope));
      }).length;
    } catch (_) { return 0; }
  };
  const selector = e => {
    const parts = [];
    for (let n = e; n && n.nodeType !== 9; n = n.parentElement) {
      if (n.id && document.querySelectorAll(`#${CSS.escape(n.id)}`).length === 1) { parts.unshift(`#${CSS.escape(n.id)}`); break; }
      const tag = n.tagName.toLowerCase();
      const siblings = n.parentElement ? [...n.parentElement.children].filter(c => c.tagName === n.tagName) : [n];
      parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(n) + 1})`);
    }
    return parts.join(" > ");
  };
  const elements = () => {
    const found = scope.querySelectorAll('.sheet,[data-shape],[data-density],[data-pair],[data-rail],[data-fit],button,input,select,[role="tab"]');
    truncated ||= found.length + 1 > limits.elements;
    const result = [scope];
    for (let i = 0; i < found.length && result.length < limits.elements; i++) result.push(found[i]);
    return result;
  };
  const observe = e => {
    const adaptation = {}; let valuesTruncated = false;
    for (const key of keys) if (e.dataset?.[key] !== undefined) {
      const value = String(e.dataset[key]); adaptation[key] = value.slice(0, limits.valueLength);
      if (value.length > limits.valueLength) history.truncated = valuesTruncated = true;
    }
    let entry = entries.get(e);
    if (!entry && !Object.keys(adaptation).length) return;
    if (!entry) {
      const sel = selector(e);
      if (entries.size >= limits.contexts || sel.length > limits.selectorLength || selectors.has(sel)) { history.truncated = true; return; }
      const context = { selector: sel, present: true, selectorStable: true, states: [], changes: 0, revisited: 0, alternating: 0, evidence: [], truncated: false };
      entry = { context, seen: new Set(), last: null, previous: null }; entries.set(e, entry); selectors.set(sel, e); history.contexts.push(context);
    }
    const key = JSON.stringify(adaptation), context = entry.context;
    context.present = true;
    if (selector(e) !== context.selector) { context.selectorStable = false; context.truncated = history.truncated = true; }
    if (key === entry.last) { context.final.truncated = valuesTruncated; if (valuesTruncated) context.truncated = true; return; }
    const state = { adaptation, frame: frames, elapsedMs: Math.round(performance.now() - started) };
    context.final = { ...state, truncated: valuesTruncated };
    if (valuesTruncated) context.truncated = true;
    if (entry.last !== null) {
      context.changes++;
      const revisited = entry.seen.has(key), alternating = key === entry.previous;
      if (revisited) context.revisited++;
      if (alternating) context.alternating++;
      if (revisited || alternating) {
        if (context.evidence.length < limits.evidencePerContext) context.evidence.push({ ...state, revisited, alternating });
        else context.truncated = history.truncated = true;
      }
    }
    if (context.states.length < limits.statesPerContext && states < limits.states) {
      context.states.push(state); states++; entry.seen.add(key);
    } else context.truncated = history.truncated = true;
    entry.previous = entry.last; entry.last = key;
  };
  return new Promise((resolve, reject) => {
    let frame = null, finished = false;
    const clear = () => { clearTimeout(deadline); if (frame !== null) cancelAnimationFrame(frame); };
    const finish = stable => {
      if (finished) return;
      finished = true; clear();
      if (truncated) history.unknowns.push("Element sampling cap reached; unsampled contexts and transitions are unknown.");
      if (history.truncated) history.unknowns.push("History or value cap reached; omitted transitions, values and revisit counts are unknown.");
      resolve({ stable, frames, elapsedMs: Math.round(performance.now() - started), truncated: truncated || history.truncated, animating,
        ...(stable ? {} : { reason: animating ? "CSS animations were still running at the sampling budget" : "Layout did not settle within the sampling budget" }), history });
    };
    // rAF pauses in background tabs: the deadline must remain independent.
    // https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
    const deadline = setTimeout(() => finish(false), limits.elapsedMs);
    const sample = () => {
      if (finished) return;
      try {
        frames++;
        const sampled = elements();
        for (const e of sampled) observe(e);
        // Retain attribute removals even when a context stops matching the query.
        for (const [e, entry] of entries) if (!sampled.includes(e)) {
          if (scope.contains(e)) observe(e);
          else entry.context.present = false;
        }
        const signature = JSON.stringify(sampled.map(e => {
          const r = e.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height, e.scrollWidth, e.scrollHeight, ...keys.map(k => e.dataset?.[k])];
        }));
        same = signature === previous ? same + 1 : 0; previous = signature;
        animating = runningAnimations();
        if (same >= 3 && !animating && performance.now() - started >= 150) finish(true);
        else if (frames >= limits.frames) finish(false);
        else frame = requestAnimationFrame(sample);
      } catch (error) { finished = true; clear(); reject(error); }
    };
    try { for (const e of elements()) observe(e); frame = requestAnimationFrame(sample); }
    catch (error) { finished = true; clear(); reject(error); }
  });
}

/** Compare observed classifier states at the same requested size across paths. */
export function compareSweepPaths(records) {
  const limits = { records: 32, contextsPerRecord: 256, comparisons: 32, differences: 128, unknowns: 64, selectorLength: 2048, valueLength: 256 };
  const result = { comparisons: [], differencesTotal: 0, unknowns: [], truncated: false, limits,
    limitation: "Same-size path differences are observations; intentional hysteresis, application state and asynchronous work can explain them. Missing or bounded evidence is unknown, not equal." };
  const unknown = message => { if (result.unknowns.length < limits.unknowns) result.unknowns.push(message); else result.truncated = true; };
  if (!Array.isArray(records)) { unknown("Sweep records unavailable."); return result; }
  if (records.length > limits.records) { result.truncated = true; unknown("Record cap reached; remaining path comparisons are unknown."); }
  const indexed = [], keys = ["shape", "density", "pair", "rail", "fit"];
  for (let index = 0; index < Math.min(records.length, limits.records); index++) {
    const record = records[index], size = record?.requestedViewport;
    if (!["forward", "reverse"].includes(record?.phase) || !Number.isInteger(size?.width) || !Number.isInteger(size?.height) || size.width <= 0 || size.height <= 0) { unknown(`Record ${index}: phase or requested viewport unavailable.`); continue; }
    const contexts = record.inspection?.layoutContexts, map = new Map();
    if (!Array.isArray(contexts)) unknown(`Record ${index}: layout contexts unavailable.`);
    if (contexts?.length > limits.contextsPerRecord || record.inspection?.layoutContextsTruncated) { result.truncated = true; unknown(`Record ${index}: context coverage truncated.`); }
    for (const context of Array.isArray(contexts) ? contexts.slice(0, limits.contextsPerRecord) : []) {
      if (!context || typeof context.selector !== "string" || !context.selector || context.selector.length > limits.selectorLength || !context.adaptation || typeof context.adaptation !== "object" || Array.isArray(context.adaptation)) { unknown(`Record ${index}: invalid context or adaptation omitted.`); continue; }
      const state = {}; let valid = true;
      for (const key of keys) if (Object.hasOwn(context.adaptation, key)) {
        const value = context.adaptation[key];
        if (typeof value !== "string" || value.length > limits.valueLength) { valid = false; break; }
        state[key] = value;
      }
      if (map.has(context.selector)) { map.set(context.selector, null); unknown(`Record ${index}: duplicate context selector omitted.`); }
      else if (valid) map.set(context.selector, state);
      else { map.set(context.selector, null); unknown(`Record ${index}: unbounded or invalid adaptation value omitted.`); }
    }
    // A text/canvas-only classified sheet has no semantic controls, so it may
    // never appear in inspectUI's control ancestry. Supplement it with sampled
    // final states; the later inspection remains authoritative where present.
    const history = record.settlement?.history;
    if (record.settlement?.truncated || history?.truncated || (Array.isArray(history?.unknowns) && history.unknowns.length)) {
      result.truncated = true; unknown(`Record ${index}: sampled history coverage truncated or incomplete.`);
    }
    const sampled = history?.contexts;
    if (Array.isArray(sampled)) for (const context of sampled.slice(0, limits.contextsPerRecord)) {
      const selector = context?.selector;
      if (typeof selector !== "string" || !selector || selector.length > limits.selectorLength || map.has(selector)) continue;
      if (map.size >= limits.contextsPerRecord) { result.truncated = true; unknown(`Record ${index}: combined context cap reached.`); break; }
      const final = context.final, state = {}; let valid = context.present !== false && context.selectorStable !== false && !!final?.adaptation && !final.truncated && typeof final.adaptation === "object" && !Array.isArray(final.adaptation);
      if (valid) for (const key of keys) if (Object.hasOwn(final.adaptation, key)) {
        const value = final.adaptation[key];
        if (typeof value !== "string" || value.length > limits.valueLength) { valid = false; break; }
        state[key] = value;
      }
      map.set(selector, valid ? state : null);
      if (!valid) unknown(`Record ${index}: sampled final adaptation unavailable or truncated.`);
    }
    if (Array.isArray(sampled) && sampled.length > limits.contextsPerRecord) { result.truncated = true; unknown(`Record ${index}: sampled context cap reached.`); }
    indexed.push({ index, phase: record.phase, size: { width: size.width, height: size.height }, map });
  }
  for (const forward of indexed.filter(r => r.phase === "forward")) {
    const matches = indexed.filter(r => r.phase === "reverse" && r.size.width === forward.size.width && r.size.height === forward.size.height);
    if (!matches.length) { unknown(`Record ${forward.index}: no reverse observation at the same requested size.`); continue; }
    for (const reverse of matches) {
      if (result.comparisons.length >= limits.comparisons) { result.truncated = true; unknown("Comparison cap reached; remaining pairs are unknown."); return result; }
      const comparison = { requestedViewport: forward.size, forwardIndex: forward.index, reverseIndex: reverse.index, comparedContexts: 0, differences: [], unknownContexts: 0 };
      for (const selector of new Set([...forward.map.keys(), ...reverse.map.keys()])) {
        const a = forward.map.get(selector), b = reverse.map.get(selector);
        if (!a || !b) { comparison.unknownContexts++; continue; }
        if (!Object.keys(a).length && !Object.keys(b).length) continue;
        comparison.comparedContexts++;
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          result.differencesTotal++;
          if (result.differencesTotal <= limits.differences) comparison.differences.push({ selector, forward: a, reverse: b });
          else result.truncated = true;
        }
      }
      if (comparison.unknownContexts) unknown(`Records ${forward.index}/${reverse.index}: missing or invalid contexts cannot be compared.`);
      if (!comparison.comparedContexts) unknown(`Records ${forward.index}/${reverse.index}: no comparable classified contexts were observed.`);
      result.comparisons.push(comparison);
    }
  }
  if (!result.comparisons.length) unknown("No forward/reverse observations at the same requested viewport size.");
  return result;
}
