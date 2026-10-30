/* Apex 26 — ScreenLooksUi: the SETTINGS › APPEARANCE folds, the PEEK button
   and the dead-knob marks. LAZY_UI_PRESETS: js/ui/settings-tabs.js injects
   this on the first APPEARANCE enter. The stamp (data-look-* / --look-*)
   stays in js/ui/screen-looks.js and still runs at its eval, so a stored
   look is on the page before this file arrives.

   Read at call time, never at eval: ScreenLooks, SettingRow, PauseOpts,
   SheetShape, Log. No HARD_EDGES and no boot stub. */
const ScreenLooksUi = (function () {
  "use strict";

  const doc = typeof document !== "undefined" ? document : null;
  const root = doc ? doc.documentElement : null;
  const byId = (id) => (doc ? doc.getElementById(id) : null);

  // ── availability: values that change nothing on THIS screen size ─────────
  /* MEASURED (the look-diff CLI, G4 of the UI layout program, 844x390 touch, 2026-10-30): 41 of 127
     values painted nothing there. Some are no-ops on that device class (a sheet
     already as wide as the screen cannot widen; a short sheet is already
     tight), some depend on another knob (CAREER's LEFT COLUMN only exists in
     the split layout). Those values stay selectable in the store — a saved
     look must keep loading — but the fold marks them unavailable with a
     reason. EVERY CHECK LIVES HERE, pure over (look, env), so one unit test
     pins them. FIT mirrors the shipped CSS numbers each check reads:
       cap        the sheet's --sheet-w (card width at WIDTH 100 %)
       compactAt  the sheet's --compact-at (js/ui/sheet-shape.js density)
       pairAt     CAREER's --pair-at (two columns once the sheet is that wide)
       twoColAt   RACE SETTINGS' @container sheet (min-width: 640px) */
  const FIT = Object.freeze({
    datahub: Object.freeze({ cap: 760 }),                                   // css/data.css .dh-card
    select: Object.freeze({ cap: 1020, compactAt: 480 }),                   // css/select.css #sel-inner
    race: Object.freeze({ cap: 760, compactAt: 260, twoColAt: 640 }),       // css/race-setup.css
    career: Object.freeze({ cap: 1020, compactAt: 480, pairAt: 620 }),      // css/career.css #cr-inner
    garage: Object.freeze({ compactAt: 480 }),                              // css/carsetup.css #cs-inner
    popups: Object.freeze({ cap: 760, compactAt: 380 }),                    // css/dialogs.css #standings; @property default
  });
  const GUT = 24;   // the screen's own gutters, both edges together (CSS px)
  /** The viewport in sheet units: w / h divided by UI SIZE, less the gutters;
      shortLandscape is css/dialogs.css's raw `(orientation: landscape) and (max-height: 500px)`. */
  function env(vw, vh, scale) {
    const z = scale > 0 ? scale : 1;
    return { w: (vw - GUT) / z, h: (vh - GUT) / z, shortLandscape: vw > vh && vh <= 500 };
  }
  function compactNow(id, look, e) {
    const f = FIT[id];
    if (!f || !f.compactAt) return false;
    if (look.density === "roomy") return false;
    if (look.density === "tight") return true;
    return e.h < f.compactAt;
  }
  const cardW = (id, look, e) => Math.min(e.w, FIT[id].cap * ((look.w || 100) / 100));
  function careerAutoPairs(look, e) {
    return !compactNow("career", look, e) && cardW("career", look, e) >= FIT.career.pairAt;
  }
  function careerPairs(look, e) {
    return look.layout === "split" || (look.layout !== "stacked" && careerAutoPairs(look, e));
  }
  /** Why value `v` of knob `k` changes nothing here ("" = it does something). */
  function why(id, k, v, look, e) {
    const f = FIT[id];
    if (k === "density" && f && f.compactAt) {
      const auto = e.h < f.compactAt;
      if (v === "tight" && auto) return "Already tight on this screen size.";
      if (v === "roomy" && !auto) return "Already roomy on this screen size.";
    }
    if (id === "pause" && (k === "music" || k === "build") && v === "hide" && e.shortLandscape)
      return "Short landscape already hides this line.";
    if (id === "select" && k === "names" && v === "hide" && compactNow("select", look, e))
      return "This short screen already shows flags only.";
    if (id === "race" && k === "cols") {
      const two = cardW("race", look, e) >= f.twoColAt;
      if (v === "two" && two) return "AUTO already shows two columns here.";
      if (v === "one" && !two) return "AUTO already shows one column here.";
    }
    if (id === "career" && k === "layout") {
      const auto = careerAutoPairs(look, e);
      if (v === "stacked" && !auto) return "AUTO already stacks the columns here.";
      if (v === "split" && auto) return "AUTO already splits the columns here.";
    }
    if (id === "garage" && k === "glass" && v === "solid") return "SHIPPED is already the solid panel.";
    return "";
  }
  /** A note for the whole knob, or null: `off` = the knob does nothing at
      all here (a dependent knob — the row disables), else only part of its
      range is moot (WIDTH above 100 %; the slider stays live). */
  function whyKnob(id, k, look, e) {
    if (id === "career" && (k === "split" || k === "side") && !careerPairs(look, e))
      return { off: true, text: "Applies to the SPLIT layout only (COLUMNS)." };
    if (k === "w" && FIT[id] && FIT[id].cap && FIT[id].cap >= e.w)
      return { off: false, text: id === "popups"
        // POPUPS spans caps from 620 (duel picker) to 1100 (circuit details): only most of them fill.
        ? "Above 100% changes little here: most pop-ups already fill the screen width."
        : "Above 100% changes nothing here: the card already fills the screen width." };
    return null;
  }
  /** The live env, from the window and the declared UI SIZE. */
  function liveEnv() {
    if (typeof window === "undefined" || !(window.innerWidth > 0)) return null;
    let z = 1;
    try { z = parseFloat(getComputedStyle(root).getPropertyValue("--ui-scale")) || 1; } catch (_) { /* no CSSOM */ }
    return env(window.innerWidth, window.innerHeight, z);
  }

  // ── fold building ───────────────────────────────────────────────────────
  function el(tag, props, kids) {
    const e = doc.createElement(tag);
    for (const k in props || {}) {
      if (k === "attrs") { for (const a in props.attrs) e.setAttribute(a, props.attrs[a]); } else e[k] = props[k];
    }
    for (const c of kids || []) e.appendChild(c);
    return e;
  }
  const rangeTxt = (n, v) => (n.token === "pct" ? v + "%" : v + "%");
  /** A PEEK toggle and its polite status line, mounted into `host` for screen `id`.
      `fold` is the details a tap inside should not dismiss. The button state
      lives on ScreenLooks (the peek engine); this file only builds the nodes. */
  function mountPeekButton(host, id, before, fold) {
    if (!host || !doc) return null;
    const btn = el("button", { type: "button", textContent: "PEEK", attrs: { "aria-pressed": "false", "data-peek": id } });
    btn.addEventListener("click", () => ScreenLooks.holdPeek(id));
    const status = el("p", { className: "adv-help", attrs: { "aria-live": "polite", "data-help": "keep" } });
    const slot = ScreenLooks.notePeek(id, fold ? { btn, status, fold } : { btn, status });
    if (before && before.parentNode === host) { host.insertBefore(btn, before); host.insertBefore(status, before); }
    else { host.appendChild(btn); host.appendChild(status); }
    const s = ScreenLooks.PEEK_ONLY[id];
    if (s && s.peekable) {
      const paint = () => { btn.disabled = !s.peekable(); };
      paint();
      const o = byId("overlay");
      if (o && typeof MutationObserver !== "undefined")
        new MutationObserver(paint).observe(o, { attributes: true, attributeFilter: ["hidden"] });
    }
    return slot;
  }

  /* The availability line under a knob, and the painter that keeps it (and
     the disabled options / row) in step with the look and the screen size. */
  function whyPainter(s, n, id, ctl, row, disableRow) {
    const note = el("p", { id: id + "-why", className: "adv-help", hidden: true, attrs: { "data-help": "keep", "data-look-why": n.k } });
    if (ctl && ctl.setAttribute) ctl.setAttribute("aria-describedby", note.id);
    const paint = () => {
      const e = liveEnv(), look = ScreenLooks.read(s.id), lines = [];
      if (n.kind === "cycle") for (const [v, label] of n.values) {
        const w = e ? why(s.id, n.k, v, look, e) : "";
        SettingRow.optionDisabled(row, v, !!w);
        if (w) lines.push(label + ": " + w);
      }
      const kn = e ? whyKnob(s.id, n.k, look, e) : null;
      if (kn) lines.unshift(kn.text);
      disableRow(!!(kn && kn.off));
      const text = lines.join(" ");
      if (note.textContent !== text) note.textContent = text;
      note.hidden = !text;
    };
    return { note, paint };
  }

  function buildRows(s, body, paintSum) {
    const painters = [], avail = [];
    for (const n of s.knobs) {
      const id = "pm-look-" + s.id + "-" + n.k;
      if (n.kind === "cycle") {
        if (typeof SettingRow === "undefined" || !SettingRow.build) continue;
        const r = SettingRow.build(id, n.label, n.values);
        SettingRow.wire(r.row, {
          values: n.values,
          read: () => ScreenLooks.read(s.id)[n.k],
          write: (v) => { const out = ScreenLooks.set(s.id, n.k, v); paintSum(); ScreenLooks.peek(s.id, ScreenLooks.PEEK_MS); return out; },
        });
        body.appendChild(r.row);
        const w = whyPainter(s, n, id, r.sel, r.row, (off) => SettingRow.disable(r.row, off));
        body.appendChild(w.note);
        avail.push(w.paint);
        painters.push(() => SettingRow.paint(r.row, ScreenLooks.read(s.id)[n.k]));
      } else {
        const out = el("b");
        const inp = el("input", { id, type: "range", min: String(n.min), max: String(n.max), step: String(n.step),
          attrs: { "aria-label": s.title.toLowerCase() + " " + n.label.toLowerCase() } });
        const paint = () => {
          const v = ScreenLooks.read(s.id)[n.k];
          if (doc.activeElement !== inp) inp.value = String(v);
          out.textContent = rangeTxt(n, v);
        };
        inp.addEventListener("input", () => {
          const v = ScreenLooks.set(s.id, n.k, parseFloat(inp.value));
          out.textContent = rangeTxt(n, v);
          paintSum();
          ScreenLooks.peek(s.id, ScreenLooks.PEEK_MS);
        });
        inp.addEventListener("pointerdown", () => ScreenLooks.peek(s.id, 0));
        inp.addEventListener("pointerup", () => ScreenLooks.peek(s.id, 1500));
        inp.addEventListener("pointercancel", () => ScreenLooks.endPeek());
        body.appendChild(el("label", { className: "tune-row" }, [
          el("span", { className: "tune-label" }, [el("span", { textContent: n.label + " " }), out]), inp]));
        const w = whyPainter(s, n, id, inp, null, (off) => { inp.disabled = off; });
        body.appendChild(w.note);
        avail.push(w.paint);
        painters.push(paint);
      }
    }
    const paintAvail = () => { for (const p of avail) p(); };
    return { paintRows: () => { for (const p of painters) p(); paintAvail(); }, paintAvail };
  }

  const built = {};
  function buildScreen(s, after) {
    const paintSumFns = [];
    const paintSum = () => { for (const f of paintSumFns) f(); };
    let body, fold;
    if (s.host) {
      body = byId(s.host);
      if (!body) return after;
      fold = body.closest ? body.closest("details") : null;
      if (typeof PauseOpts !== "undefined" && PauseOpts.wireRows) PauseOpts.wireRows();
      body.appendChild(el("h4", { className: "pm-look-h", textContent: "BUTTONS & CARD" }));
      body.appendChild(el("p", { className: "adv-help", textContent: s.help }));
      paintSumFns.push(() => { if (typeof PauseOpts !== "undefined" && PauseOpts.apply) PauseOpts.apply(); });
    } else {
      const sum = el("summary", { className: "adv-more-btn" });
      sum.id = "pm-look-" + s.id + "-sum";
      body = el("div", { attrs: { role: "group", "aria-label": s.title.toLowerCase() + " appearance" } });
      body.id = "pm-look-" + s.id + "-body";
      fold = el("details", { className: "pm-renderer-sub" }, [sum, body]);
      fold.id = "pm-look-" + s.id;
      body.appendChild(el("p", { className: "adv-help", textContent: s.help + " Change anything to see the real screen behind this page." }));
      paintSumFns.push(() => { sum.textContent = s.title + " · " + (ScreenLooks.isShipped(s.id) ? "SHIPPED" : "CUSTOM"); });
    }
    const { paintRows, paintAvail } = buildRows(s, body, paintSum);
    paintSumFns.push(paintAvail);   // every write and onChange: a knob can moot another (CAREER COLUMNS)
    const resetBtn = el("button", { type: "button", textContent: "RESET " + s.title });
    resetBtn.addEventListener("click", () => {
      ScreenLooks.reset(s.id);
      if (s.id === "pause" && typeof PauseOpts !== "undefined") {
        PauseOpts.setLayout("grid"); PauseOpts.setSide("centre"); PauseOpts.setDim("full"); PauseOpts.setConfirm("on");
      }
      paintRows(); paintSum(); ScreenLooks.peek(s.id, ScreenLooks.PEEK_MS);
    });
    const row = el("div", { className: "balanced-row" }, [resetBtn]);
    body.appendChild(row);
    const slot = mountPeekButton(row, s.id, null, fold);
    // The status line belongs under the buttons, not inside the balanced row.
    if (slot && slot.status) body.appendChild(slot.status);
    paintSum();
    ScreenLooks.onChange(s.id, paintSum);
    built[s.id] = { fold, paintRows, paintSum, paintAvail };
    if (!s.host && fold) {
      if (after && after.parentNode) after.parentNode.insertBefore(fold, after.nextSibling);
      else { const panel = byId("pm-panel-appearance"); if (panel) panel.appendChild(fold); }
      return fold;
    }
    return after;
  }

  function build() {
    if (!doc || built._done) return;
    const panel = byId("pm-panel-appearance");
    if (!panel) return;
    built._done = true;
    Log.info("ui", "ScreenLooks.build");
    let after = byId("pm-titlescreen");
    for (const s of ScreenLooks.SCREENS) after = buildScreen(s, after);
    // TITLE SCREEN keeps its own fold; it gains the PEEK button, last (after REPLAY INTRO).
    // Search descriptors are registered by screen-looks.js, so a query works
    // before this file has loaded.
    const tsBody = byId("pm-titlescreen-body");
    if (tsBody) mountPeekButton(tsBody, "title", null, byId("pm-titlescreen"));
    wireAvail();
  }

  /* The screen size moved (resize, rotation, UI SIZE): re-read every
     availability line. SheetShape.reclassify() lands its body answer on
     <body data-density / data-shape / data-width>, so that observer is the
     "SheetShape reclassified" hook; resize covers a change it rounds away. */
  let lastEnv = "";
  function refreshAvail() {
    // The <html> style observer also sees every token write (apply(), the HUD's
    // fitHud), so repaint only when the answer's inputs actually moved.
    const e = liveEnv(), key = e ? Math.round(e.w) + "x" + Math.round(e.h) + (e.shortLandscape ? "s" : "") : "";
    if (key === lastEnv) return;
    lastEnv = key;
    for (const id in built) if (id !== "_done") built[id].paintAvail();
  }
  let availWired = false;
  function wireAvail() {
    if (availWired || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    availWired = true;
    window.addEventListener("resize", refreshAvail);
    window.addEventListener("orientationchange", refreshAvail);
    if (doc && doc.body && typeof MutationObserver !== "undefined")
      new MutationObserver(refreshAvail).observe(doc.body, { attributes: true, attributeFilter: ["data-density", "data-shape", "data-width"] });
    if (root && typeof MutationObserver !== "undefined")   // UI SIZE writes --ui-scale inline on <html>
      new MutationObserver(refreshAvail).observe(root, { attributes: true, attributeFilter: ["style"] });
  }

  function refresh() { for (const id in built) if (id !== "_done") { built[id].paintRows(); built[id].paintSum(); } }

  // Already complete on the appearance-enter inject and in unit VMs. A defer
  // script would be "interactive" and must build now too: DOMContentLoaded
  // has either fired or is about to, and a late listen would miss it.
  if (doc) {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", build, { once: true });
    else build();
  }

  return { FIT, env, why, whyKnob, refreshAvail, build, refresh, mountPeekButton };
})();
Object.freeze(ScreenLooksUi);
