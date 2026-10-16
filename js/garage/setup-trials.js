/* Deliberate unscored launch comparisons. Receipts are session-only; no tuning optimizer. */
const SetupTrials = (() => {
  "use strict";
  const REQUIRED = ["physics", "car", "parts", "track", "point", "weather", "tyres", "fuel", "energy", "assists"];
  const STATIC = ["physics", "car", "parts", "track", "weather", "assists"];
  const json = value => JSON.stringify(value, (_k, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
  const copy = value => JSON.parse(JSON.stringify(value));
  let run = null, sequence = 0;
  const pauseMounts = new WeakMap();
  const listeners = new Set();
  function notify() { for (const fn of listeners) fn(); }
  function same(a, b) { return json(a) === json(b); }
  function contextIssues(a, b, keys = REQUIRED) {
    const issues = [];
    if (!b || b.unscored !== true) issues.push("Unscored session not verified");
    if (!b || b.stableWeather !== true) issues.push("Stable weather not verified");
    for (const k of keys) {
      if (!b || b[k] == null || (a && a[k] == null)) issues.push(k + " unknown");
      else if (a && !same(a[k], b[k])) issues.push(k + " changed");
    }
    return issues;
  }
  function create(o) {
    cancel();
    if (!o || typeof o.launch !== "function") return false;
    run = { id: ++sequence, teamId: o.teamId, store: o.store, launch: o.launch, refresh: o.refresh, cancelRuntime: o.cancelRuntime,
      before: SetupTune.get(o.teamId), baseline: copy(o.baseline), candidate: copy(o.candidateNow ? o.candidateNow() : o.candidate), receipts: [], pending: null,
      owned: null, revision: null, context: null, busy: false };
    notify(); return true;
  }
  function owns(r) { return r.owned && same(SetupTune.get(r.teamId), r.owned) && (!r.store.keyRevision || r.revision === r.store.keyRevision("setup." + r.teamId)); }
  function cancel() {
    const r = run;
    if (!r) return false;
    // Cancel the owned session before restoring the mechanical sheet. The callback
    // must refuse a newer session; it runs while the launch lease is still current.
    if (r.cancelRuntime) r.cancelRuntime();
    run = null;
    if (owns(r)) { SetupTune.set(r.teamId, r.before); if (r.refresh) r.refresh(); }
    notify(); return true;
  }
  async function attempt(arm) {
    const r = run;
    if (!r || r.busy || r.pending || !["baseline", "control", "candidate"].includes(arm) || r.receipts.filter(x => x.arm === arm).length >= 6) return false;
    if (r.owned && !owns(r)) { r.reason = "Mechanical setup changed outside this comparison. Cancel and start again."; notify(); return false; }
    r.busy = true; const tune = arm === "candidate" ? r.candidate : r.baseline;
    r.owned = SetupTune.set(r.teamId, tune); r.revision = r.store.keyRevision ? r.store.keyRevision("setup." + r.teamId) : null;
    notify();
    let result;
    try { result = await r.launch({ teamId: r.teamId, tune: copy(tune), mode: "launch", isCurrent: () => run === r && owns(r) }); }
    catch (_) { result = { ok: false, reason: "Could not start the launch drill." }; }
    if (run !== r) return false;
    r.busy = false;
    if (!result || !result.ok) { r.reason = result && result.reason || "Could not start the launch drill."; notify(); return false; }
    // Normal restart recomputes from this sheet without taking ownership from a later edit.
    if (!owns(r)) { r.reason = "Restart changed the proposed mechanical setup."; notify(); return false; }
    const context = result.context;
    const issues = contextIssues(r.context, context);
    if (!r.context && !issues.length) r.context = copy(context);
    r.pending = { arm, context: context ? copy(context) : null, issues, tune: copy(tune) };
    r.reason = issues.length ? "Not comparable: " + issues.join("; ") : "Launch drill armed. Drive from rest to half racing speed.";
    notify(); return true;
  }
  function observe(context) {
    const r = run, p = r && r.pending;
    if (!p) return false;
    p.issues = [...new Set(p.issues.concat(contextIssues(p.context, context, STATIC), owns(r) ? [] : ["Mechanical setup changed during attempt"]))];
    return true;
  }
  function record(result, context) {
    const r = run, p = r && r.pending;
    if (!p || !result || result.mode !== "launch") return false;
    r.pending = null;
    const issues = p.issues.concat(contextIssues(p.context, context, STATIC));
    if (!owns(r)) issues.push("Mechanical setup changed during attempt");
    if (!result.clean || !Number.isFinite(result.score)) issues.push(result.reason || "Unclean or incomplete attempt");
    r.receipts.push({ arm: p.arm, score: Number.isFinite(result.score) ? result.score : null, valid: !issues.length, issues: [...new Set(issues)] });
    r.reason = issues.length ? "Attempt excluded: " + issues.join("; ") : "Clean launch recorded. Return to Garage to choose the next attempt.";
    notify(); return true;
  }
  function invalidate(reason) {
    if (!run || !run.pending) return false;
    return record({ mode: "launch", clean: false, score: null, reason: reason || "Attempt reset" }, run.pending.context);
  }
  function summary() {
    if (!run) return null;
    const groups = {};
    for (const arm of ["baseline", "control", "candidate"]) {
      const rows = run.receipts.filter(x => x.arm === arm && x.valid).map(x => x.score).sort((a, b) => a - b), n = rows.length;
      groups[arm] = { n, median: n ? (rows[Math.floor((n - 1) / 2)] + rows[Math.floor(n / 2)]) / 2 : null, spread: n ? rows[n - 1] - rows[0] : null };
    }
    const enough = Object.values(groups).every(g => g.n >= 3), mismatched = run.receipts.some(x => x.issues.some(i => /changed|unknown|verified/.test(i)));
    const repeatable = enough && Math.abs(groups.baseline.median - groups.control.median) <= Math.max(.01, groups.baseline.spread, groups.control.spread);
    return { teamId: run.teamId, busy: run.busy, pending: !!run.pending, reason: run.reason || "Choose three clean attempts per arm, including the identical-setup control.", groups,
      comparable: enough && !mismatched && repeatable, delta: enough && !mismatched && repeatable ? groups.candidate.median - groups.baseline.median : null,
      changes: SetupTune.FIELDS.filter(k => run.baseline[k] !== run.candidate[k]).map(k => SetupTune.RANGE[k].label + ": " + run.baseline[k] + " → " + run.candidate[k]), receipts: copy(run.receipts) };
  }
  function mountPause(G) {
    if (pauseMounts.has(G)) return pauseMounts.get(G);
    const pause = G.$ && G.$("pausemenu"), host = pause && pause.querySelector(".sheet-body");
    if (!host || !G.quitToMenu || !G.openGarageFrom) return null;
    const box = document.createElement("section"); box.className = "player-tool-panel"; box.setAttribute("aria-label", "Setup comparison");
    const status = document.createElement("p"); status.className = "adv-help"; status.setAttribute("role", "status");
    const row = document.createElement("div"); row.className = "chip-row";
    function button(text, fn) { const b = document.createElement("button"); b.type = "button"; b.className = "sel-chip"; b.textContent = text; b.onclick = fn; row.appendChild(b); }
    const ownsSession = () => !!run && (!G.setupTrialContext || !!G.setupTrialContext());
    button("RETURN TO SETUP COMPARISON", () => {
      if (!ownsSession()) return;
      invalidate("Returned to garage before drill completion");
      G.quitToMenu(); G.openGarageFrom("menu");
    });
    button("CANCEL SETUP COMPARISON", () => {
      if (!ownsSession()) return;
      // Stop the live graph/session first, so restoring a sheet cannot leave
      // a candidate's old computed mods running against the restored values.
      G.quitToMenu(); cancel(); G.openGarageFrom("menu");
    });
    const paint = () => { const s = summary(); box.hidden = !ownsSession(); status.textContent = s ? "Setup comparison: " + s.reason + " Return keeps completed attempts; unfinished attempts are excluded. Cancel ends the session before restoring only the setup still owned by this comparison." : ""; };
    box.append(status, row); host.appendChild(box); listeners.add(paint); paint();
    let observer = null;
    if (typeof MutationObserver === "function") { observer = new MutationObserver(paint); observer.observe(pause, { attributes: true, attributeFilter: ["hidden"] }); }
    const ui = { section: box, refresh: paint, dispose() { if (observer) observer.disconnect(); listeners.delete(paint); box.remove(); pauseMounts.delete(G); } }; pauseMounts.set(G, ui); return ui;
  }
  function mount(host, o) {
    const box = document.createElement("section"); box.className = "player-tool-panel";
    const title = document.createElement("h3"); title.className = "sel-label"; title.textContent = "MEASURE A SETUP · UNSCORED LAUNCH";
    const status = document.createElement("p"); status.className = "adv-help"; status.setAttribute("role", "status");
    const rows = document.createElement("div"); rows.className = "chip-row";
    const buttons = [];
    function button(label, fn) { const b = document.createElement("button"); b.type = "button"; b.className = "sel-chip"; b.textContent = label; b.onclick = fn; rows.appendChild(b); buttons.push(b); return b; }
    const paint = () => {
      const s = summary(), mine = s && s.teamId === o.teamId;
      status.textContent = !mine ? "Compare the setup from this garage visit with the current sheet. Include an identical baseline control; three clean repeats of each are required (up to six attempts per arm). Measures only this launch drill." : s.reason + " Baseline → candidate: " + (s.changes.join("; ") || "identical mechanical sheets (A/A)") + ". " + Object.entries(s.groups).map(([k,g]) => k + ": " + g.n + " clean" + (g.n ? ", median " + g.median.toFixed(3) + "s, spread " + g.spread.toFixed(3) + "s" : "")).join(" · ") + (s.comparable ? " Observed candidate minus baseline: " + s.delta.toFixed(3) + "s. This is not a universal setup ranking." : " No comparison conclusion yet.") + (s.receipts.length ? " Attempts: " + s.receipts.map(x => x.arm + " " + (x.valid ? x.score.toFixed(3) + "s" : "excluded: " + x.issues.join(", "))).join("; ") : "");
      for (let i = 1; i < 4; i++) buttons[i].disabled = !mine || s.busy || s.pending || s.receipts.filter(x => x.arm === ["baseline", "control", "candidate"][i - 1]).length >= 6;
      buttons[0].disabled = !!mine; buttons[4].disabled = !mine; buttons[5].disabled = !mine || !s.pending;
    };
    button("BEGIN COMPARISON", () => { create(o); paint(); });
    for (const arm of ["baseline", "control", "candidate"]) button(arm === "control" ? "RUN A/A CONTROL" : "RUN " + arm.toUpperCase(), () => attempt(arm));
    button("CANCEL / RESTORE OWNED SETUP", cancel);
    button("EXCLUDE CURRENT ATTEMPT", () => invalidate("Stopped before drill completion"));
    box.append(title, status, rows); host.appendChild(box); listeners.add(paint); paint();
    return { dispose() { listeners.delete(paint); box.remove(); } };
  }
  return Object.freeze({ create, cancel, attempt, observe, record, invalidate, summary, contextIssues, mount, mountPause, active: () => !!run });
})();
