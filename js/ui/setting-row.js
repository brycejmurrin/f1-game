"use strict";
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

  function fill(sel, values) {
    if (!sel || !values) return;
    const key = values.map((p) => `${S(p[0])}=${S(p[1])}${p[2] ? "!" : ""}`).join("|");
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

  function paint(h, value, values) {
    const p = parts(h);
    if (!p || !p.sel) return;
    if (values) fill(p.sel, values);
    p.sel.value = S(value);
    paintEnds(p);
  }

  function disable(h, off) {
    const p = parts(h);
    if (!p) return;
    for (const x of [p.sel, p.prev, p.next]) if (x) x.disabled = !!off;
    if (!off) paintEnds(p);
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

  function wraps(p) {
    return !(p && p.sel && p.sel._srLive && p.sel._srLive.wrap === false);
  }

  function paintEnds(p) {
    if (!p || wraps(p) || !p.sel || p.sel.disabled) return;
    const live = options(p.sel).filter((o) => !o.disabled).map((o) => o.value);
    const i = live.indexOf(S(p.sel.value));
    if (p.prev) p.prev.disabled = i <= 0;
    if (p.next) p.next.disabled = i < 0 || i >= live.length - 1;
  }

  function step(p, dir, read, write) {
    const all = options(p.sel);
    const n = all.length;
    if (!all.some((o) => !o.disabled)) return;
    const cur = S(read());
    let i = all.findIndex((o) => o.value === cur);
    if (i < 0) i = dir > 0 ? -1 : 0;
    const wrap = wraps(p);
    for (let k = 1; k <= n; k++) {
      const j = i + dir * k;
      if (!wrap && (j < 0 || j >= n)) break;
      const o = all[wrap ? ((j % n) + n) % n : j];
      if (o.disabled) continue;
      if (o.value !== cur) write(o.value);
      break;
    }
    paint(p.el, read());
  }

  function wire(h, opts) {
    const p = parts(h);
    if (!p || !p.sel) return null;
    if (opts.values) fill(p.sel, opts.values);
    const read = opts.read;
    const write = opts.write;
    const fresh = !p.sel._srLive;
    p.sel._srLive = { read, write, wrap: opts.wrap !== false };
    if (fresh) p.sel.addEventListener("change", (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      const cur = p.sel._srLive;
      const v = p.sel.value;
      if (v !== S(cur.read())) cur.write(v);
      paint(p.el, cur.read());
    });
    const stop = (e) => { if (e && e.stopPropagation) e.stopPropagation(); };
    if (p.prev) p.prev.onclick = (e) => { stop(e); step(p, -1, read, write); };
    if (p.next) p.next.onclick = (e) => { stop(e); step(p, 1, read, write); };
    pointerOnly(p);
    paint(p.el, read());
    return p.el;
  }

  function pointerOnly(p) {
    for (const x of [p.prev, p.next]) {
      if (!x) continue;
      x.tabIndex = -1;
      x.setAttribute("aria-hidden", "true");
    }
  }

  function build(id, labelText, values) {
    const d = doc();
    const row = d.createElement("div");
    row.id = id;
    row.className = "set-row";
    row.setAttribute("role", "group");
    const labelId = `${id}-label`;
    row.setAttribute("aria-labelledby", labelId);
    const label = d.createElement("span");
    label.className = "tune-label";
    label.id = labelId;
    label.textContent = labelText;
    const ctl = d.createElement("div");
    const prev = d.createElement("button");
    prev.id = `${id}-prev`;
    prev.type = "button";
    prev.setAttribute("data-step", "-1");
    prev.setAttribute("aria-label", `Previous ${labelText.toLowerCase()}`);
    prev.textContent = "‹";
    const sel = d.createElement("select");
    sel.id = `${id}-sel`;
    sel.setAttribute("aria-labelledby", labelId);
    const next = d.createElement("button");
    next.id = `${id}-next`;
    next.type = "button";
    next.setAttribute("data-step", "1");
    next.setAttribute("aria-label", `Next ${labelText.toLowerCase()}`);
    next.textContent = "›";
    ctl.appendChild(prev);
    ctl.appendChild(sel);
    ctl.appendChild(next);
    row.appendChild(label);
    row.appendChild(ctl);
    if (values) fill(sel, values);
    return { row, label, sel, prev, next };
  }

  const labels = (list) => list.map((v) => [v, S(v).toUpperCase()]);

  return { parts, paint, disable, optionDisabled, value, wire, build, labels };
})();
