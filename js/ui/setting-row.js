"use strict";
// SettingRow — the ONE control for an enumerated preference on a settings
// sheet:  LABEL                     ‹ VALUE ›
//
// One line at every UI SIZE and orientation. The value is a native <select>
// (tap it: the platform picker lists every option; a screen reader hears a
// combo box with its label; arrow keys step it), and the chevrons step for the
// quick flips — ON/OFF, AUTO/MANUAL — a thumb makes mid-race. Console racing
// games settle on this shape for the same reasons: a setting costs one row
// however many options it has, Left/Right on a pad changes it, and the label
// and the value truncate independently instead of fighting for the line.
//
// WHY NOT CHIPS HERE. A labelled chip row (the first pass, earlier the same
// day, 2026-09-05) lit every option and needed one tap, but each setting cost a
// label, one to three chip lines and a help line: measured with
// tools/ui/layout-audit.mjs the CONTROLS page ran 3.8 screens deep at landscape
// 150% for THREE settings, and LAYOUT's five chips wrapped to three lines at
// 200%. Chips stay where comparing options IS the task (RACE SETTINGS, the
// garage, team and track pickers) and for multi-select toggles (engine
// layers); a persisted preference in a list is a row.
//
// CONTRACT. The row is static DOM in index.html:
//   <div id="X" class="set-row" role="group" aria-labelledby="X-label">
//     <span class="tune-label" id="X-label">LABEL</span>
//     <div><button data-step="-1">‹</button><select id="X-sel"></select><button data-step="1">›</button></div>
//   </div>
// The OPTIONS are data and come from the caller's own list (`values`), the same
// list its store validates against, so the two cannot drift. `build()` makes
// the same row for the settings JS creates at runtime (cockpit, metrics,
// graphics). Everything walks `children` rather than a selector so the unit
// tests' mini DOM can drive it. A disabled option (a CUSTOM state the sliders
// produced, SPOTIFY before it is connected) is shown but skipped by the steps.
window.SettingRow = (function () {
  const doc = () => (typeof document !== "undefined" ? document : null);
  const byId = (id) => (doc() ? doc().getElementById(id) : null);
  const host = (h) => (typeof h === "string" ? byId(h) : h);
  const S = (v) => String(v);

  function parts(h) {
    const el = host(h);
    if (!el) return null;
    const p = { el, sel: null, prev: null, next: null };
    const walk = (n) => {
      for (const c of n.children || []) {
        if (c.tagName === "SELECT") p.sel = c;
        else if (c.tagName === "BUTTON" && c.getAttribute) {
          const step = c.getAttribute("data-step");
          if (step === "-1") p.prev = c;
          else if (step === "1") p.next = c;
        }
        if (c.tagName !== "SELECT" && c.children && c.children.length) walk(c);
      }
    };
    walk(el);
    return p;
  }

  /* Rebuild the options only when the list actually changed (labels included —
     GRAPHICS appends "— RELOADING…" to one). */
  function fill(sel, values) {
    if (!sel || !values) return;
    const key = values.map((p) => S(p[0]) + "=" + S(p[1]) + (p[2] ? "!" : "")).join("|");
    if (sel._srKey === key) return;
    sel._srKey = key;
    if (typeof sel.replaceChildren === "function") sel.replaceChildren();
    else sel.innerHTML = "";
    for (const [v, label, disabled] of values) {
      const o = doc().createElement("option");
      o.value = S(v);
      o.textContent = S(label);
      if (disabled) o.disabled = true;
      sel.appendChild(o);
    }
  }

  function options(sel) {
    const out = [];
    for (const o of (sel && sel.children) || []) if (o.tagName === "OPTION") out.push(o);
    return out;
  }

  /* Show `value`. `values` (optional) refreshes the option list first. */
  function paint(h, value, values) {
    const p = parts(h);
    if (!p || !p.sel) return;
    if (values) fill(p.sel, values);
    p.sel.value = S(value);
  }

  /* Disable — never hide — the whole row: hiding reflowed the settings grid
     mid-tap and the next tap landed on whatever slid under the finger. */
  function disable(h, off) {
    const p = parts(h);
    if (!p) return;
    for (const x of [p.sel, p.prev, p.next]) if (x) x.disabled = !!off;
  }

  function optionDisabled(h, value, off) {
    const p = parts(h);
    if (!p || !p.sel) return;
    for (const o of options(p.sel)) if (o.value === S(value)) o.disabled = !!off;
  }

  function value(h) {
    const p = parts(h);
    return p && p.sel ? p.sel.value : "";
  }

  function step(p, dir, read, write) {
    const live = options(p.sel).filter((o) => !o.disabled).map((o) => o.value);
    const n = live.length;
    if (!n) return;
    const i = live.indexOf(S(read()));
    const next = live[(((i < 0 ? 0 : i) + dir) % n + n) % n];
    if (next !== S(read())) write(next);
    paint(p.el, read());
  }

  /* opts: { values: [[v, label, disabled?], …], read(): v, write(v) } */
  function wire(h, opts) {
    const p = parts(h);
    if (!p || !p.sel) return null;
    const read = opts.read, write = opts.write;
    if (opts.values) fill(p.sel, opts.values);
    p.sel.addEventListener("change", (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      const v = p.sel.value;
      if (v !== S(read())) write(v);
      paint(p.el, read());
    });
    const stop = (e) => { if (e && e.stopPropagation) e.stopPropagation(); };
    if (p.prev) p.prev.onclick = (e) => { stop(e); step(p, -1, read, write); };
    if (p.next) p.next.onclick = (e) => { stop(e); step(p, 1, read, write); };
    paint(p.el, read());
    return p.el;
  }

  /* Build the same row for a setting the JS creates at runtime. Returns
     { row, label, sel, prev, next }; the caller places `row` and wires it. */
  function build(id, labelText, values) {
    const d = doc();
    const row = d.createElement("div");
    row.id = id;
    row.className = "set-row";
    row.setAttribute("role", "group");
    row.setAttribute("aria-labelledby", id + "-label");
    const label = d.createElement("span");
    label.className = "tune-label";
    label.id = id + "-label";
    label.textContent = labelText;
    const ctl = d.createElement("div");
    const prev = d.createElement("button");
    prev.id = id + "-prev";
    prev.type = "button";
    prev.setAttribute("data-step", "-1");
    prev.setAttribute("aria-label", "Previous " + labelText.toLowerCase());
    prev.textContent = "‹";
    const sel = d.createElement("select");
    sel.id = id + "-sel";
    sel.setAttribute("aria-labelledby", id + "-label");
    const next = d.createElement("button");
    next.id = id + "-next";
    next.type = "button";
    next.setAttribute("data-step", "1");
    next.setAttribute("aria-label", "Next " + labelText.toLowerCase());
    next.textContent = "›";
    ctl.appendChild(prev);
    ctl.appendChild(sel);
    ctl.appendChild(next);
    row.appendChild(label);
    row.appendChild(ctl);
    if (values) fill(sel, values);
    return { row, label, sel, prev, next };
  }

  /* [["auto", "AUTO"], …] from a plain value list. */
  const labels = (list) => list.map((v) => [v, S(v).toUpperCase()]);

  return { parts, paint, disable, optionDisabled, value, wire, build, labels };
})();
