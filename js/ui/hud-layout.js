const HudLayout = (function () {
  "use strict";

  const KEY = "hudLayout";
  const ELEMENTS = Object.freeze([
    ["tower", "TIMING TOWER", ".hud-top", "top left"],
    ["map", "TRACK MAP", "#minimap", "top left"],
    ["gaps", "GAPS", ".hud-gaps", "top left"],
    ["sectors", "SECTORS", "#hud-sectors", "top right"],
    ["limits", "TRACK LIMITS", "#hud-limits", "top right"],
    ["flag", "FLAGS", "#hud-flag", "top left"],
    ["mirror", "MIRROR", "#hud-mirror", "top left"],
    ["announce", "RACE MESSAGES", "#announce", "top left"],
    ["gearbox", "GEAR", "#hud-gearbox", "bottom center"],
    ["speed", "SPEED", "#hud-speed", "bottom center"],
    ["energy", "ENERGY", "#hud-energy", "bottom center"],
    ["tyre", "TYRES", "#hud-tyre", "bottom center"],
    ["ot", "OVERTAKE", "#hud-ot", "bottom center"],
    ["aero", "AERO", "#hud-aero", "bottom center"],
    ["bb", "BRAKE BIAS", "#hud-bb", "bottom center"],
    ["damage", "DAMAGE", "#hud-damage", "top right"],
    ["rel", "RELATIVE", "#hud-rel", "top right"],
    ["strat", "STRATEGY", "#hud-strat", "top left"],
    ["inputs", "INPUTS", "#hud-inputs", "top right"],
  ].map(Object.freeze));
  const IDS = ELEMENTS.map((e) => e[0]);
  const SETS = Object.freeze(["cockpit", "helmet", "other"]);
  const PROFILES = Object.freeze(["standard", "minimal", "broadcast"]);
  const COCKPIT_CAMS = typeof CamGroups !== "undefined" ? CamGroups.COCKPIT_LAYOUT : Object.freeze({ cockpit: 1 });
  const LAYOUT_SET = typeof CamGroups !== "undefined" && CamGroups.layoutSet ? CamGroups.layoutSet : (id) => (COCKPIT_CAMS[id] ? "cockpit" : "other");
  const LIM = Object.freeze({ x: [-Infinity, Infinity], y: [-Infinity, Infinity], s: [0, Infinity] });
  const DEF = Object.freeze({ x: 0, y: 0, s: 100 });
  const fz = (o) => { for (const k in o) Object.freeze(o[k]); return Object.freeze(o); };
  const COCKPIT_STRIP = {
    energy: { x: -30, y: -4, s: 100 },
    tyre: { x: -30, y: -4, s: 100 },
    ot: { x: 30, y: -14, s: 100 },
    aero: { x: 30, y: -14, s: 100 },
    bb: { x: -18, y: 0, s: 100 },
  };
  const HELMET_STRIP = Object.assign({}, COCKPIT_STRIP, { gearbox: { x: -30, y: -20, s: 100 }, speed: { x: -30, y: -30, s: 100 } });
  const HELMET_TOUCH = { energy: { x: 0, y: -6, s: 100 }, tyre: { x: 0, y: -2, s: 100 },
    gearbox: { x: 0, y: 0, s: 100 }, speed: { x: 12, y: -5, s: 100 } };
  const SHIPPED = Object.freeze({
    standard: Object.freeze({ cockpit: fz(Object.assign({}, COCKPIT_STRIP)), helmet: fz(Object.assign({}, HELMET_STRIP)), other: fz({}) }),
    minimal: Object.freeze({ cockpit: fz(Object.assign({}, COCKPIT_STRIP)), helmet: fz(Object.assign({}, HELMET_STRIP)), other: fz({}) }),
    broadcast: Object.freeze({ cockpit: fz(Object.assign({}, COCKPIT_STRIP)), helmet: fz(Object.assign({}, HELMET_STRIP)), other: fz({}) }),
  });
  const TOUCH_SHIPPED = Object.freeze({ helmet: fz(Object.assign({}, HELMET_TOUCH)) });

  const TOUCH_PRESET_HOLD = {
    cockpit: { energy: 1, tyre: 1, ot: 1, aero: 1, bb: 1 },
    helmet: { gearbox: 1, energy: 1, tyre: 1, ot: 1, aero: 1, bb: 1 },
  };
  const TOUCH_UNFIT = Object.freeze({ big: 1, corners: 1, clean: 1 });
  const presetFits = (pid) => !(touch() && TOUCH_UNFIT[pid]);
  const PRESETS = Object.freeze([
    ["shipped", "SHIPPED", {}],
    ["clean", "CLEAN", { tower: { s: 85 }, map: { s: 85 }, gaps: { s: 90 }, sectors: { s: 90 },
      limits: { s: 90 } }],
    ["big", "BIG", { tower: { s: 115 }, map: { s: 120 }, gaps: { x: 7, s: 100 }, gearbox: { x: -32, y: -18, s: 115 } }],
    ["corners", "CORNERS", { gearbox: { x: 38, y: -18 }, energy: { x: -32, y: 0 }, tyre: { x: -44, y: 0 } }],
  ].map((p) => Object.freeze([p[0], p[1], fz(p[2])])));

  const store = typeof GameStore !== "undefined" ? GameStore.store : null;
  const doc = typeof document !== "undefined" ? document : null;
  let cam = "other";
  let prof = null;
  let preview = null;
  let previewProf = null;
  let arrangePreview = false;
  let foldEl = null;
  let selected = null;
  let onModeChange = null;
  let _pub = false;

  function num(v, k, fallback) {
    const n = typeof v === "number" || (typeof v === "string" && v.trim()) ? Number(v) : NaN;
    return Number.isFinite(n) && (k !== "s" || n > 0) ? n : fallback;
  }
  function normEl(v, fallback = DEF) {
    const o = v && typeof v === "object" ? v : {};
    return { x: num(o.x, "x", fallback.x), y: num(o.y, "y", fallback.y), s: num(o.s, "s", fallback.s) };
  }
  const isDefEl = (e) => e.x === 0 && e.y === 0 && e.s === 100;
  const sameEl = (a, b) => a.x === b.x && a.y === b.y && a.s === b.s;
  const isSet = (s) => SETS.indexOf(s) >= 0;
  const isProf = (p) => PROFILES.indexOf(p) >= 0;
  const touch = () => !!(doc && doc.body && doc.body.classList && !doc.body.classList.contains("desktop"));
  const shippedEl = (id, sn, pn) => normEl(touch() && TOUCH_SHIPPED[sn] ? TOUCH_SHIPPED[sn][id] : SHIPPED[pn] && SHIPPED[pn][sn] && SHIPPED[pn][sn][id]);
  function normSet(v, sn, pn) {
    const out = {};
    if (!v || typeof v !== "object") return out;
    for (const id of IDS) {
      if (!(id in v)) continue;
      if (!v[id] || typeof v[id] !== "object" || Array.isArray(v[id])) continue;
      out[id] = normEl(v[id]);
    }
    return out;
  }
  const normProf = (v, pn) => Object.fromEntries(SETS.map((sn) => [sn, normSet(v && v[sn], sn, pn)]));
  function migrate(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const out = {};
    for (const pn of PROFILES) out[pn] = normProf(r.v === 4 ? r[pn] : null, pn);
    return out;
  }
  let draft = null, draftBase = null;
  function stored() {
    const raw = store ? store.get(KEY, null) : null;
    if (draft && raw !== draftBase) draft = null;
    return migrate(draft || raw);
  }
  function effective(st, sn, pn) {
    const out = {};
    for (const id of IDS) out[id] = st[pn][sn][id] ? normEl(st[pn][sn][id]) : shippedEl(id, sn, pn);
    return out;
  }
  const emptyProf = (p) => SETS.every((sn) => !Object.keys(p[sn]).length);
  function all(pn) {
    const p = isProf(pn) ? pn : shownProf(), st = stored();
    return Object.fromEntries(SETS.map((sn) => [sn, effective(st, sn, p)]));
  }
  function save(st, live) {
    const out = { v: 4 };
    let any = false;
    for (const pn of PROFILES) {
      const p = normProf(st[pn], pn);
      if (!emptyProf(p)) { out[pn] = p; any = true; }
    }
    draft = live ? out : null;
    if (live) draftBase = store ? store.get(KEY, null) : null;
    if (store && !live) store.set(KEY, any ? out : null);
  }
  function commit() {
    if (!draft) return false;
    save(stored());
    return true;
  }
  if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("pagehide", commit);
  const camSet = (modeId) => LAYOUT_SET(modeId);
  const has = (c) => !!(doc && doc.body && doc.body.classList && doc.body.classList.contains(c));
  function hudLive() {
    const h = doc && doc.getElementById ? doc.getElementById("hud") : null;
    return !!(h && !h.hidden);
  }
  function profile() {
    const fromClass = has("hud-prof-minimal") ? "minimal" : has("hud-prof-broadcast") ? "broadcast" : "standard";
    if (hudLive()) return fromClass;
    const v = store ? store.get("hudProfile", null) : null;
    return isProf(v) ? v : fromClass;
  }
  const shown = () => (preview && isSet(preview) ? preview : cam);
  const shownProf = () => (preview && isProf(previewProf) ? previewProf : profile());
  const profArg = (pn) => (isProf(pn) ? pn : shownProf());
  const setArg = (sn) => (isSet(sn) ? sn : shown());

  function get(id, set, pn) {
    return normEl(all(pn)[setArg(set)][id]);
  }
  function scaleOf(id) { return get(id).s / 100; }

  function originOf(id) {
    const row = ELEMENTS.find((e) => e[0] === id);
    if (!row) return null;
    const root = doc && doc.documentElement;
    if (id === "limits" && !stored()[shownProf()][shown()].limits && root && root.hasAttribute && root.hasAttribute("data-limits-left")) return "top left";
    return row[3];
  }

  const manuallyPlaced = (el) => !!(el && el.hasAttribute && el.hasAttribute("data-hl-user"));
  function releaseAutomatic(el) {
    if (!el || !el.style) return;
    if (el.hasAttribute("data-hl-pack")) {
      for (const p of ["translate", "margin-left", "margin-top"]) el.style.removeProperty(p);
    }
    for (const p of ["--hud-clear-x", "--hud-clear-y", "max-width", "max-height"]) el.style.removeProperty(p);
    if (el.id === "hud-rel") el.style.removeProperty("left");
    for (const a of ["data-hl-pack", "data-col-compact", "data-col-drop", "data-lane-collapsed"]) el.removeAttribute(a);
  }

  const bottomHomes = new Map();
  function ownBottom(el) {
    const home = bottomHomes.get(el);
    if (el.hasAttribute("data-hl-v4")) {
      if (!home && el.parentNode && el.parentNode.classList.contains("hud-bottom")) {
        const host = doc.getElementById("hud");
        if (!host) return;
        bottomHomes.set(el, { parent: el.parentNode, next: el.nextSibling });
        el.setAttribute("data-hl-bottom", ""); host.appendChild(el);
      }
    } else if (home) {
      if (home.next && home.next.parentNode === home.parent && home.parent.insertBefore) home.parent.insertBefore(el, home.next);
      else home.parent.appendChild(el);
      el.removeAttribute("data-hl-bottom"); bottomHomes.delete(el);
    }
  }

  function apply() {
    if (!doc) return;
    const sn = shown(), pn = shownProf(), st = stored(), a = effective(st, sn, pn);
    prof = profile();
    const body = doc.body;
    if (body && body.setAttribute) body.setAttribute("data-hl-set", sn);
    for (const [id, , sel] of ELEMENTS) {
      const el = doc.querySelector(sel);
      if (!el || !el.style) continue;
      const e = a[id];
      if (e && (!isDefEl(e) || st[pn][sn][id])) {
        el.style.setProperty("--hl-x", String(e.x));
        el.style.setProperty("--hl-y", String(e.y));
        el.style.setProperty("--hl-s", String(e.s / 100));
        el.style.setProperty("--hl-o", originOf(id));
        el.setAttribute("data-hl", "");
      } else if (el.hasAttribute("data-hl")) {
        el.removeAttribute("data-hl");
        for (const p of ["--hl-x", "--hl-y", "--hl-s", "--hl-o"]) el.style.removeProperty(p);
      }
      if (st[pn][sn][id]) el.setAttribute("data-hl-user", "");
      else if (el.hasAttribute("data-hl-user")) el.removeAttribute("data-hl-user");
      const entry = st[pn][sn][id];
      if (entry) el.setAttribute("data-hl-v4", "");
      else el.removeAttribute("data-hl-v4");
      if (manuallyPlaced(el)) releaseAutomatic(el);
      ownBottom(el);
      if (selected === id && preview) el.setAttribute("data-hl-sel", "");
      else if (el.hasAttribute("data-hl-sel")) el.removeAttribute("data-hl-sel");
    }
    if (body && body.toggleAttribute) {
      const radio = st[pn][sn].announce;
      body.toggleAttribute("data-radio-placed", !!radio);
    }
    fit();
    if (typeof GameHud !== "undefined" && GameHud && typeof GameHud.invalidateFit === "function") GameHud.invalidateFit();
    if (_pub && typeof HudElements !== "undefined" && HudElements && typeof HudElements.apply === "function") {
      const run = () => { if (body && body.hasAttribute("data-hud-arrange")) return; try { HudElements.apply(); } catch (_) {  } };
      if (typeof queueMicrotask === "function") queueMicrotask(run);
      else setTimeout(run, 0);
    }
  }

  const EDGE = 4;
  function screenBounds(W = window.innerWidth, H = window.innerHeight, gap = EDGE) {
    const safe = doc && doc.documentElement && typeof getComputedStyle === "function" ? getComputedStyle(doc.documentElement) : null;
    const inset = (name) => safe && safe.getPropertyValue ? Math.max(0, parseFloat(safe.getPropertyValue(name)) || 0) : 0;
    const vv = typeof window !== "undefined" && window.visualViewport;
    const x = vv && vv.width > 0 ? vv.offsetLeft || 0 : 0, y = vv && vv.height > 0 ? vv.offsetTop || 0 : 0;
    return { left: Math.max(x, inset("--sal")) + gap, top: Math.max(y, inset("--sat")) + gap,
      right: Math.min(W - inset("--sar"), x + (vv && vv.width > 0 ? vv.width : W)) - gap,
      bottom: Math.min(H - inset("--sab"), y + (vv && vv.height > 0 ? vv.height : H)) - gap };
  }
  function clampAxis(lo, hi, min, max) {
    if (hi - lo > max - min) return min - lo;
    if (lo < min) return min - lo;
    if (hi > max) return max - hi;
    return 0;
  }
  function fit() {
    if (!doc || typeof window === "undefined" || !window.innerWidth) return;
    if (preview && !arrangePreview && !(foldEl && foldEl.open && foldEl.getClientRects && foldEl.getClientRects().length)) {
      if (foldEl) foldEl.open = false;
      preview = null; previewProf = null; selected = null; apply();
    }
    resetClearance();
    clearPackMarks();
    const W = window.innerWidth, H = window.innerHeight;
    const bounds = screenBounds(W, H);
    const a = all()[shown()];
    const groups = new Map();
    for (const [id, , sel] of ELEMENTS) {
      const e = a[id];
      if (!e || isDefEl(e)) continue;
      const el = doc.querySelector(sel);
      if (!el || !el.getBoundingClientRect || !el.hasAttribute("data-hl")) continue;
      if (manuallyPlaced(el)) continue;
      el.style.setProperty("--hl-x", String(e.x));
      el.style.setProperty("--hl-y", String(e.y));
      el.style.setProperty("--hl-o", originOf(id));
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const k = e.x || e.y ? e.x + "," + e.y : "solo:" + id;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ el, e, r });
    }
    for (const g of groups.values()) {
      let l = Infinity, t = Infinity, rr = -Infinity, bb = -Infinity;
      for (const m of g) { l = Math.min(l, m.r.left); t = Math.min(t, m.r.top); rr = Math.max(rr, m.r.right); bb = Math.max(bb, m.r.bottom); }
      const dx = clampAxis(l, rr, bounds.left, bounds.right), dy = clampAxis(t, bb, bounds.top, bounds.bottom);
      g.dx = dx; g.dy = dy;
      for (const m of g) {
        if (dx) m.el.style.setProperty("--hl-x", String(+(m.e.x + dx / W * 100).toFixed(2)));
        if (dy) m.el.style.setProperty("--hl-y", String(+(m.e.y + dy / H * 100).toFixed(2)));
      }
    }
    const at = (m, g) => ({ L: m.r.left + g.dx, R: m.r.right + g.dx, T: m.r.top + g.dy, B: m.r.bottom + g.dy });
    for (const g of groups.values()) {
      if (!g.dx) continue;
      for (const h of groups.values()) {
        if (h === g || h.dx || h.dy) continue;
        let push = 0;
        for (const p of g) for (const q of h) {
          const A = at(p, g), B = at(q, h);
          if (A.L < B.R && B.L < A.R && A.T < B.B && B.T < A.B) push = g.dx > 0 ? Math.max(push, A.R + EDGE - B.L) : Math.min(push, A.L - EDGE - B.R);
        }
        if (!push) continue;
        h.dx = push;
        for (const q of h) q.el.style.setProperty("--hl-x", String(+(q.e.x + push / W * 100).toFixed(2)));
      }
    }
    clearControls(W, H);
    packPhone(W, H);
    schedulePackFollowUp();
  }
  let _packFollow = 0;
  function schedulePackFollowUp() {
    if (_packFollow) return;
    _packFollow = 1;
    const run = () => {
      _packFollow = 0;
      if (!doc || typeof window === "undefined" || !window.innerWidth) return;
      packPhone(window.innerWidth, window.innerHeight);
      if (typeof setTimeout === "function") {
        setTimeout(() => {
          if (!doc || typeof window === "undefined" || !window.innerWidth) return;
          packPhone(window.innerWidth, window.innerHeight);
        }, 120);
      }
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(run));
    } else if (typeof setTimeout === "function") {
      setTimeout(run, 32);
    } else {
      _packFollow = 0;
    }
  }

  const PACK_AIR = 4;
  const PACK_SCALE_MIN = 140;
  const PACK_FIXED = Object.freeze({ announce: 1, flag: 1, map: 1, tower: 1 });
  const PACK_DOCK = Object.freeze({ tyre: 1, gearbox: 1, speed: 1, energy: 1 });
  const PACK_MOVE = Object.freeze(Object.keys(PACK_DOCK));
  function packPhoneRects(boxes, W, H, bounds = { left: PACK_AIR, top: PACK_AIR, right: W - PACK_AIR, bottom: H - PACK_AIR }) {
    const by = Object.create(null);
    const fixed = Object.create(null);
    if (!boxes || !(W > 0) || !(H > 0)) return {};
    const dockFixed = H > W;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (!b || !b.id || !(b.w > 0 && b.h > 0)) continue;
      by[b.id] = { id: b.id, x: +b.x, y: +b.y, w: +b.w, h: +b.h, dx: 0, dy: 0 };
      if (PACK_FIXED[b.id] || b.fixed || String(b.id).indexOf("ctrl:") === 0) fixed[b.id] = 1;
      if (dockFixed && PACK_DOCK[b.id]) fixed[b.id] = 1;
    }
    if (by.announce) {
      const a = by.announce;
      const padBottom = Math.max(a.h, Math.min(H * 0.22, a.h + 70));
      a.h = padBottom;
      if (a.y + a.h < H * 0.45) a.h = Math.max(a.h, H * 0.45 - a.y);
    }
    const isFixed = (id) => !!fixed[id];
    const rect = (m) => ({
      L: m.x + m.dx, T: m.y + m.dy, R: m.x + m.dx + m.w, B: m.y + m.dy + m.h,
    });
    const hit = (a, b) => a.L < b.R - 0.5 && b.L < a.R - 0.5 && a.T < b.B - 0.5 && b.T < a.B - 0.5;
    const clampOn = (m) => {
      const r = rect(m);
      m.dx += clampAxis(r.L, r.R, bounds.left, bounds.right);
      m.dy += clampAxis(r.T, r.B, bounds.top, bounds.bottom);
    };
    for (const id of PACK_MOVE) if (by[id] && !isFixed(id)) clampOn(by[id]);
    const separate = (moverId, obstacleId) => {
      const m = by[moverId], o = by[obstacleId];
      if (!m || !o || isFixed(moverId)) return false;
      let changed = false;
      for (let n = 0; n < 10; n++) {
        const mr = rect(m), or = rect(o);
        if (!hit(mr, or)) break;
        const down = or.B - mr.T + PACK_AIR;
        const left = mr.R - or.L + PACK_AIR;
        const right = or.R - mr.L + PACK_AIR;
        const up = mr.B - or.T + PACK_AIR;
        let dx = 0, dy = 0;
        if (isFixed(obstacleId)) {
          if (obstacleId === "map" || obstacleId === "tower") dy = down;
          else if (String(obstacleId).indexOf("ctrl:") === 0 && up > 0 && up <= Math.min(down, left, right)) dy = -up;
          else if (left <= down) dx = -left;
          else dy = down;
        } else if (down <= left) dy = down;
        else dx = -left;
        m.dx += dx;
        m.dy += dy;
        clampOn(m);
        changed = true;
      }
      return changed;
    };
    for (let pass = 0; pass < 12; pass++) {
      let any = false;
      const ids = Object.keys(by);
      for (let mi = 0; mi < PACK_MOVE.length; mi++) {
        const id = PACK_MOVE[mi];
        if (!by[id]) continue;
        for (let oi = 0; oi < ids.length; oi++) {
          const o = ids[oi];
          if (o === id) continue;
          const oj = PACK_MOVE.indexOf(o);
          if (!isFixed(o) && oj >= 0 && oj > mi) continue;
          if (separate(id, o)) any = true;
        }
      }
      if (!any) break;
    }
    const out = Object.create(null);
    for (const id of Object.keys(by)) {
      const m = by[id];
      if (isFixed(id) || String(id).indexOf("ctrl:") === 0) continue;
      if (Math.abs(m.dx) > 0.25 || Math.abs(m.dy) > 0.25) {
        out[id] = { dx: +m.dx.toFixed(2), dy: +m.dy.toFixed(2) };
      }
    }
    return out;
  }
  function clearPackMarks() {
    if (!doc || !doc.querySelectorAll) return;
    let nodes;
    try { nodes = doc.querySelectorAll("[data-hl-pack]"); } catch (_) { return; }
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!el || typeof el.removeAttribute !== "function") continue;
      el.removeAttribute("data-hl-pack");
      if (el.style && typeof el.style.removeProperty === "function") {
        el.style.removeProperty("translate");
        el.style.removeProperty("margin-left");
        el.style.removeProperty("margin-top");

      }
    }
  }
  function packPhone(W, H) {
    resetClearance();
    clearPackMarks();
    packPhonePrimary(W, H);
    clearReadouts(W, H);
  }
  function packPhonePrimary(W, H) {
    if (!doc || !doc.body || !doc.body.classList || doc.body.classList.contains("desktop")) return;
    let pct = 100;
    if (store && typeof store.get === "function") pct = +store.get("hudScale", 100) || 100;
    try {
      const root = doc.documentElement;
      const cs = root && typeof getComputedStyle === "function" ? getComputedStyle(root) : null;
      const cssScale = cs ? parseFloat(cs.getPropertyValue("--hud-scale")) : 0;
      if (cssScale > 1) pct = Math.max(pct, Math.round(cssScale * 100));
    } catch (_) {  }
    if (typeof window !== "undefined" && window.__apex && typeof window.__apex.hudScale === "function") {
      try { const s = window.__apex.hudScale(); if (s && s.pct != null) pct = Math.max(pct, +s.pct || 0); } catch (_) {  }
    }
    if (!(pct >= PACK_SCALE_MIN)) return;
    const boxes = [];
    const want = Object.create(null);
    for (const id of Object.keys(PACK_DOCK)) want[id] = 1;
    want.announce = 1; want.flag = 1; want.map = 1; want.tower = 1;
    for (let i = 0; i < ELEMENTS.length; i++) {
      const [id, , sel] = ELEMENTS[i];
      const el = doc.querySelector(sel);
      if (!el || el.hidden) continue;
      if (!want[id] && !manuallyPlaced(el)) continue;
      const cs = typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
      if (cs && (cs.display === "none" || cs.visibility === "hidden")) continue;
      const r = el.getBoundingClientRect();
      if (!(r.width && r.height)) continue;
      boxes.push({ id, x: r.left, y: r.top, w: r.width, h: r.height, fixed: manuallyPlaced(el) });
    }
    try {
      const btns = doc.querySelectorAll(".touchbtn, .steerbtn, .shiftbtn");
      for (let i = 0; i < btns.length; i++) {
        const el = btns[i];
        if (!el || el.hidden) continue;
        const r = el.getBoundingClientRect();
        if (!(r.width && r.height)) continue;
        boxes.push({ id: "ctrl:" + i, x: r.left, y: r.top, w: r.width, h: r.height, fixed: 1 });
      }
    } catch (_) {  }
    const corr = packPhoneRects(boxes, W, H, screenBounds(W, H));
    if (!corr || !Object.keys(corr).length) return;
    for (const id of Object.keys(corr)) {
      const row = ELEMENTS.find((e) => e[0] === id);
      if (!row) continue;
      const el = doc.querySelector(row[2]);
      if (!el || !el.style) continue;
      if (manuallyPlaced(el)) continue;
      const c = corr[id];
      let z = 1;
      if (typeof el.currentCSSZoom === "number" && el.currentCSSZoom > 0) z = el.currentCSSZoom;
      else if (typeof getComputedStyle === "function") {
        const zz = parseFloat(getComputedStyle(el).zoom);
        if (zz > 0) z = zz;
      }
      const lx = c.dx / z, ly = c.dy / z;
      el.style.setProperty("margin-left", lx.toFixed(1) + "px", "important");
      el.style.setProperty("margin-top", ly.toFixed(1) + "px", "important");
      el.setAttribute("data-hl-pack", "");
    }
  }
  let _packMo = null;
  function watchPackUnhide() {
    if (_packMo || !doc || typeof MutationObserver !== "function") return;
    try {
      _packMo = new MutationObserver(() => {
        if (typeof window === "undefined" || !window.innerWidth) return;
        packPhone(window.innerWidth, window.innerHeight);
      });
      const watch = (id) => {
        const el = doc.getElementById(id);
        if (el) _packMo.observe(el, { attributes: true, attributeFilter: ["hidden"] });
      };
      watch("hud-strat"); watch("hud-rel"); watch("hud-tyre"); watch("hud-inputs");
      watch("hud-limits"); watch("hud-flag");
    } catch (_) { _packMo = null; }
  }

  const CLEAR_CTRL = Object.freeze({ rel: 1, inputs: 1, sectors: 1 });
  function clearControls(W, H) {
    if (!doc || !doc.querySelectorAll) return;
    const btns = [];
    const nodes = doc.querySelectorAll(".touchbtn, #hud-gearbox, #hud-speed");
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!el || el.hidden) continue;
      const cs = typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
      if (cs && (cs.display === "none" || cs.visibility === "hidden")) continue;
      const r = el.getBoundingClientRect();
      if (!(r.width && r.height)) continue;
      if (el.classList && el.classList.contains("touchbtn") && doc.body && doc.body.classList.contains("desktop")) continue;
      btns.push(r);
    }
    if (!btns.length) return;
    const a = all()[shown()];
    for (const [id, , sel] of ELEMENTS) {
      if (!CLEAR_CTRL[id]) continue;
      const e = a[id];
      if (!e || isDefEl(e)) continue;
      const el = doc.querySelector(sel);
      if (!el || !el.hasAttribute("data-hl")) continue;
      if (manuallyPlaced(el)) continue;
      let r = el.getBoundingClientRect();
      if (!(r.width && r.height)) continue;
      const px = el.style.getPropertyValue ? parseFloat(el.style.getPropertyValue("--hl-x")) : NaN;
      const py = el.style.getPropertyValue ? parseFloat(el.style.getPropertyValue("--hl-y")) : NaN;
      let dx = isFinite(px) ? (px - e.x) * W / 100 : 0, dy = isFinite(py) ? (py - e.y) * H / 100 : 0;
      for (let n = 0; n < 4; n++) {
        let hit = null;
        for (let i = 0; i < btns.length; i++) {
          const b = btns[i];
          if (r.left < b.right - 0.5 && b.left < r.right - 0.5 && r.top < b.bottom - 0.5 && b.top < r.bottom - 0.5) { hit = b; break; }
        }
        if (!hit) break;
        const left = r.right - hit.left;
        const up = r.bottom - hit.top;
        if (left <= up) dx -= left + 4;
        else dy -= up + 4;
        el.style.setProperty("--hl-x", String(+(e.x + dx / W * 100).toFixed(2)));
        el.style.setProperty("--hl-y", String(+(e.y + dy / H * 100).toFixed(2)));
        r = el.getBoundingClientRect();
      }
    }
  }

  const CLEAR_READOUTS = ["map", "speed", "limits", "announce", "damage", "rel", "strat", "inputs"];
  function resetClearance() {
    if (!doc || !doc.querySelector) return;
    for (const [id, , sel] of ELEMENTS) {
      const el = doc.querySelector(sel);
      if (manuallyPlaced(el)) { releaseAutomatic(el); continue; }
      if (CLEAR_READOUTS.indexOf(id) < 0) continue;
      if (el && el.style) {
        el.style.removeProperty("--hud-clear-x"); el.style.removeProperty("--hud-clear-y");
        el.removeAttribute("data-col-compact"); el.removeAttribute("data-col-drop");
      }
    }
  }
  let _blkBounds = new Float64Array(128);
  function clearReadouts(W = window.innerWidth, H = window.innerHeight) {
    if (!doc.querySelectorAll) return;
    resetClearance();
    const rows = ELEMENTS.filter((e) => CLEAR_READOUTS.indexOf(e[0]) >= 0);
    const box = (el) => {
      if (!el || el.hidden || !el.getBoundingClientRect) return null;
      const cs = typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
      if (cs && (cs.display === "none" || cs.visibility === "hidden")) return null;
      const r = el.getBoundingClientRect();
      return r.width && r.height ? r : null;
    };
    const bounds = screenBounds(W, H);
    const inside = (r) => r.left >= bounds.left && r.top >= bounds.top && r.right <= bounds.right && r.bottom <= bounds.bottom;
    const mapEl = doc.querySelector("#minimap");
    const mapBox = mapEl && !has("desktop") && has("hud-prof-broadcast") && W > H
      && !mapEl.hasAttribute("data-hl-user") ? box(mapEl) : null;
    const autoMap = mapBox && Array.from(doc.querySelectorAll(".touchbtn, .steerbtn, .shiftbtn")).some((el) => {
      const r = box(el);
      return r && mapBox.left < r.right - 0.5 && mapBox.right > r.left + 0.5
        && mapBox.top < r.bottom - 0.5 && mapBox.bottom > r.top + 0.5;
    });
    const blocks = [];
    for (const el of doc.querySelectorAll(".touchbtn, .steerbtn, .shiftbtn, #pausebtn, #btn-cam, #hud-gearbox, #hud-tyre, #hud-energy, #hud-ot, #hud-aero, #hud-bb, .hud-top, #minimap, .hud-gaps, #hud-sectors, #hud-flag, #hud-mirror")) {
      if (autoMap && el === mapEl) continue;
      const r = box(el); if (r) blocks.push(r);
    }
    const placedRadio = bodyAttr("data-radio-placed");
    if (placedRadio) { const r = box(doc.querySelector("#announce")); if (r) blocks.push(r); }
    for (const [, , sel] of rows) {
      const el = doc.querySelector(sel);
      if (manuallyPlaced(el)) { const r = box(el); if (r) blocks.push(r); }
    }
    let synced = 0;
    const blocked = (l, t, rt, bt) => {
      while (synced < blocks.length) {
        if ((synced + 1) * 4 > _blkBounds.length) { const g = new Float64Array(_blkBounds.length * 2); g.set(_blkBounds); _blkBounds = g; }
        const b = blocks[synced], o = synced * 4;
        _blkBounds[o] = b.left - EDGE; _blkBounds[o + 1] = b.right + EDGE; _blkBounds[o + 2] = b.top - EDGE; _blkBounds[o + 3] = b.bottom + EDGE;
        synced++;
      }
      for (let o = 0, e = synced * 4; o < e; o += 4) {
        if (l < _blkBounds[o + 1] && rt > _blkBounds[o] && t < _blkBounds[o + 3] && bt > _blkBounds[o + 2]) return true;
      }
      return false;
    };
    const findSlot = (r) => {
      if (inside(r) && !blocked(r.left, r.top, r.right, r.bottom)) return r;
      let bx = 0, by = 0, cost = Infinity;
      const xs = [r.left, bounds.left, bounds.right - r.width], ys = [r.top, bounds.top, bounds.bottom - r.height];
      for (const b of blocks) { xs.push(b.left - EDGE - r.width, b.right + EDGE); ys.push(b.top - EDGE - r.height, b.bottom + EDGE); }
      for (const x of xs) for (const y of ys) {
        if (x < bounds.left || y < bounds.top || x + r.width > bounds.right || y + r.height > bounds.bottom) continue;
        if (blocked(x, y, x + r.width, y + r.height)) continue;
        const d = (x - r.left) ** 2 + (y - r.top) ** 2;
        if (d < cost) { bx = x; by = y; cost = d; }
      }
      return cost === Infinity ? null : { left: bx, top: by, right: bx + r.width, bottom: by + r.height, width: r.width, height: r.height };
    };
    for (const id of CLEAR_READOUTS) {
      const row = rows.find((e) => e[0] === id), el = doc.querySelector(row[2]);
      if (manuallyPlaced(el)) continue;
      if (id === "announce" && el && el.hasAttribute("data-lane-collapsed")) {
        el.style.setProperty("--announce-lane-w", Math.max(0, bounds.right - bounds.left) + "px");
        el.removeAttribute("data-lane-collapsed");
      }
      let r = box(el); if (!r) continue;
      if (id === "map" && !autoMap) continue;
      if (id === "announce" && placedRadio) { blocks.push(r); continue; }
      if (id === "speed" && shown() !== "helmet") { blocks.push(r); continue; }
      let best = findSlot(r);
      if (!best && id === "announce") {
        el.style.setProperty("--announce-lane-w", Math.max(0, bounds.right - bounds.left) + "px");
        r = box(el);
        best = r && findSlot(r);
        if (!best && r) {
          const intervals = blocks.filter(b => b.top - EDGE < r.bottom && b.bottom + EDGE > r.top)
            .map(b => [Math.max(bounds.left, b.left - EDGE), Math.min(bounds.right, b.right + EDGE)])
            .filter(([left, right]) => right > left).sort((a, b) => a[0] - b[0]);
          const widths = []; let cursor = bounds.left;
          for (const [left, right] of intervals) { if (left - cursor >= 96) widths.push(left - cursor); cursor = Math.max(cursor, right); }
          if (bounds.right - cursor >= 96) widths.push(bounds.right - cursor);
          for (const width of [...new Set(widths)].sort((a, b) => b - a)) {
            el.style.setProperty("--announce-lane-w", width + "px");
            const wrapped = box(el), slot = wrapped && findSlot(wrapped);
            if (slot) { r = wrapped; best = slot; break; }
          }
        }
        if (!best) { el.setAttribute("data-lane-collapsed", ""); continue; }
      }
      if (!best && id === "inputs") { el.setAttribute("data-col-drop", ""); continue; }
      if (!best && id === "damage") {
        el.setAttribute("data-col-compact", "");
        r = box(el);
        best = r && findSlot(r);
      }
      if (!best && (id === "rel" || id === "strat")) {
        el.setAttribute("data-col-compact", "");
        if (id === "rel" && el.querySelectorAll) {
          const children = el.querySelectorAll(":scope > div");
          for (const child of children) child.removeAttribute("data-col-row");
          const first = Array.from(children).find((child) => !child.hidden && !child.hasAttribute("data-self")) || Array.from(children).find((child) => !child.hidden);
          if (first) first.setAttribute("data-col-row", "");
        }
        r = box(el);
        best = r && findSlot(r);
        if (!best) { el.setAttribute("data-col-drop", ""); continue; }
      }
      if (best && best === r) {
        blocks.push(r);
      } else if (best) {
        el.style.setProperty("--hud-clear-x", (best.left - r.left).toFixed(2) + "px");
        el.style.setProperty("--hud-clear-y", (best.top - r.top).toFixed(2) + "px");
        const painted = box(el);
        if (painted) blocks.push(painted);
      } else blocks.push(r);
    }
  }

  let clearanceObserver = null;
  function watchReadoutSizes() {
    if (clearanceObserver || !doc || typeof ResizeObserver !== "function") return;
    clearanceObserver = new ResizeObserver(() => {
      if (typeof window !== "undefined" && window.innerWidth) clearReadouts();
    });
    for (const [id, , sel] of ELEMENTS) {
      if (CLEAR_READOUTS.indexOf(id) < 0) continue;
      const el = doc.querySelector(sel);
      if (el) clearanceObserver.observe(el, { box: "border-box" });
    }
    { const t = doc.querySelector("#hud-tyre"); if (t) clearanceObserver.observe(t, { box: "border-box" }); }
  }

  function revealMirror() {
    try {
      const mp = typeof MirrorPass !== "undefined" && MirrorPass.instance && MirrorPass.instance();
      if (mp) {
        const st = typeof mp.state === "function" ? mp.state() : null;
        if (st && st.collapsed) {
          const chip = doc && doc.getElementById && doc.getElementById("hud-mirror-chip");
          if (chip && typeof chip.click === "function") chip.click();
        }
        if (typeof mp.mode === "function" && mp.mode() !== "on" && typeof mp.setMode === "function") mp.setMode("on");
      } else if (store) {
        store.set("hudMirror", "on");
      }
      const e = doc && doc.querySelector && doc.querySelector("#hud-mirror");
      if (e) e.hidden = false;
      if (doc && doc.body && doc.body.classList && doc.body.classList.add) doc.body.classList.add("hud-mirror-on");
    } catch (_) {  }
  }
  function mirrorMode() {
    try {
      const mp = typeof MirrorPass !== "undefined" && MirrorPass.instance && MirrorPass.instance();
      if (mp && typeof mp.mode === "function") return mp.mode();
    } catch (_) {  }
    const v = store ? store.get("hudMirror", "auto") : "auto";
    return v === "off" || v === "on" ? v : "auto";
  }

  function set(id, v, setName, pn, live) {
    if (IDS.indexOf(id) < 0) return null;
    const sn = setArg(setName), p = profArg(pn);
    const st = stored();
    const previous = effective(st, sn, p)[id];
    if (!v || typeof v !== "object" || Array.isArray(v)
        || !["x", "y", "s"].some(k => Number.isFinite(num(v[k], k, NaN)))) return previous;
    const e = normEl(Object.assign({}, previous, v || {}), previous);
    st[p][sn][id] = e;
    save(st, live);
    apply();
    if (id === "mirror") {
      const el = doc && doc.querySelector && doc.querySelector("#hud-mirror");
      if (el && el.hasAttribute && el.hasAttribute("data-hl-user")) revealMirror();
    }
    return e;
  }
  function resetEl(id, setName, pn) {
    if (IDS.indexOf(id) < 0) return null;
    const sn = setArg(setName), p = profArg(pn), st = stored();
    delete st[p][sn][id];
    save(st); apply();
    return shippedEl(id, sn, p);
  }
  function resetSet(setName, pn) {
    const st = stored();
    st[profArg(pn)][setArg(setName)] = {};
    save(st); apply();
  }

  function presetLayout(pid, sn, pn) {
    const p = PRESETS.find((q) => q[0] === pid);
    if (!p || !isSet(sn)) return null;
    const pr = isProf(pn) ? pn : "standard";
    const hold = touch() && TOUCH_PRESET_HOLD[sn];
    const out = {};
    for (const id of IDS) {
      const over = hold && hold[id] ? null : p[2][id];
      out[id] = normEl(Object.assign({}, shippedEl(id, sn, pr), over || {}));
    }
    return out;
  }
  function applyPreset(pid, setName, pn) {
    const sn = setArg(setName), p = profArg(pn);
    if (pid === "shipped") { resetSet(sn, p); return true; }
    if (!presetFits(pid)) return false;
    const lay = presetLayout(pid, sn, p);
    if (!lay) return false;
    const st = stored();
    st[p][sn] = Object.fromEntries(IDS.filter((id) => !sameEl(lay[id], shippedEl(id, sn, p))).map((id) => [id, lay[id]]));
    save(st); apply();
    return true;
  }
  function presetOf(setName, pn) {
    const sn = setArg(setName), p = profArg(pn);
    const cur = all(p)[sn];
    for (const [pid] of PRESETS) {
      const lay = presetLayout(pid, sn, p);
      if (IDS.every((id) => sameEl(lay[id], cur[id]))) return pid;
    }
    return "custom";
  }
  function isShipped(setName, pn) {
    const st = stored();
    const ps = pn === "all" ? PROFILES : [profArg(pn)];
    return ps.every((p) => (isSet(setName) ? !Object.keys(st[p][setName]).length : emptyProf(st[p])));
  }

  function setCam(modeId) {
    const s = camSet(modeId), p = profile();
    if (s === cam && p === prof) return;
    cam = s;
    apply();
    if (onModeChange) onModeChange();
  }

  const BOTTOM = ["gearbox", "speed", "energy", "tyre", "ot", "aero", "bb"];
  const CHIPS = ["energy", "ot", "aero"];
  const READOUTS = ["damage", "rel", "strat", "inputs"];
  const bodyAttr = (n) => !!(doc && doc.body && doc.body.hasAttribute && doc.body.hasAttribute(n));
  const REPLAY_HUD = ["tower", "map", "gaps", "sectors", "limits", "flag", "mirror", "announce"]
    .concat(BOTTOM, READOUTS);
  const replayOn = (h) => h("bc-on") || h("watch-controls-on");
  const profIs = (name) => (hudLive() ? has("hud-prof-" + name) : shownProf() === name);
  const metIs = (name) => {
    if (hudLive()) return has("hud-met-" + name);
    const want = store ? store.get("hudMetricsLayout", "full") : "full";
    if (want && want !== "auto" && want !== "full") return want === name;
    return has("hud-met-" + name);
  };
  const HIDE_RULES = Object.freeze([
    [REPLAY_HUD, replayOn, "a real-race watch keeps the driving HUD off"],
    [["map"], (h) => h("hud-hide-map"), "MAP is off for this camera or style (DISPLAY › HUD › MAP)"],
    [["gaps"], (h) => h("hud-hide-gaps"), "GAPS is off for this style (DISPLAY › HUD › GAPS)"],
    [BOTTOM, (h) => h("hud-prof-broadcast") && h("hud-bcam"), "BROADCAST style on a TV camera keeps the frame clean"],
    [CHIPS.concat(["bb", "sectors"], READOUTS), () => profIs("minimal"), "MINIMAL style"],
    [CHIPS.concat(["bb"]), () => metIs("timing"), "LAYOUT is TIMING"],
    [CHIPS.concat(["bb", "sectors", "tyre"]), () => metIs("compact"), "LAYOUT is COMPACT"],
    [["sectors"], () => metIs("driver"), "LAYOUT is DRIVER"],
    [["gearbox", "ot", "aero", "energy", "bb", "limits"].concat(READOUTS), (h) => h("hud-bcam"), "TV camera"],
    [["sectors"], (h) => h("hud-bcam") && !h("hud-prof-broadcast"), "TV camera"],
    [["gearbox", "speed"], (h) => h("cockpit-cam"), "the wheel's display shows it in the cockpit"],
    [["gearbox", "speed", "energy", "tyre", "ot", "aero", "bb", "sectors", "limits"].concat(READOUTS), (h, a, off) => off, "turned off in the HUD element list (DISPLAY › HUD)"],
    [["tyre"], (h, a, off, el, live) => !!(live && el && el.hidden), "TYRE WEAR is off (RACE SETTINGS)"],
    [CHIPS.concat(["tyre", "bb"]), (h, a) => shown() === "cockpit" && !h("desktop") && !a, "touch cockpit: no room beside the wheel — move it to show it", true],
    [["ot", "aero", "bb"], (h, a) => shown() === "helmet" && !h("desktop") && !a, "touch helmet: the OT / AERO buttons carry it — move it to show it", true],
    [["bb"], (h, a) => !h("desktop") && !a, "touch screens: move it to show it", true],
    [["flag"], () => true, "shows when a flag is out", true],
    [["limits"], () => true, "shows on a track-limits strike", true],
    [["announce"], () => true, "shows with a race message", true],
    [["mirror"], (h, a) => !a && mirrorMode() === "off", "MIRROR is off (DISPLAY › HUD › MIRROR)"],
    [["mirror"], (h, a, off, el) => !a && !!(el && el.hidden), "MIRROR is not needed now — move it to show it", true],
  ].map(Object.freeze));
  const TOGGLE = Object.freeze({ gearbox: "gear", speed: "speed", energy: "energy", tyre: "tyre", ot: "ot", aero: "aero", bb: "bb", sectors: "sectors", limits: "limits",
    damage: "damage", rel: "rel", strat: "strat", inputs: "inputs" });
  const VIS_ROWS = Object.freeze({
    map: ["pm-hudmap", "hudMapVis", "on"], gaps: ["pm-hudgaps", "hudGapsVis", "on"], mirror: ["pm-hudmirror", "hudMirror", "auto"],
  });
  const VIS_BINARY = Object.freeze([["on", "SHOW"], ["off", "HIDE"]]);
  const VIS_AUTO = Object.freeze([["auto", "AUTO"], ...VIS_BINARY]);
  function visibilityIds(id) {
    return id === "tower" ? ["pos", "lap", "time", "best", "delta"] : TOGGLE[id] ? [TOGGLE[id]] : [];
  }
  function visibility(id) {
    const row = VIS_ROWS[id];
    if (row) {
      const value = store ? store.get(row[1], row[2]) : row[2];
      return { value: VIS_AUTO.some(([v]) => v === value) ? value : row[2], choices: VIS_AUTO };
    }
    const ids = visibilityIds(id);
    if (!ids.length || typeof HudElements === "undefined") return null;
    const count = ids.filter((key) => HudElements.isOn(key)).length;
    return count && count < ids.length
      ? { value: "mixed", choices: [...VIS_BINARY, ["mixed", "PARTLY SHOWN", true]] }
      : { value: count ? "on" : "off", choices: VIS_BINARY };
  }
  function setVisibility(id, value) {
    const current = visibility(id);
    if (!current || !current.choices.some(([v, , disabled]) => v === value && !disabled)) return false;
    const row = VIS_ROWS[id];
    if (row) {
      const select = doc && doc.getElementById(row[0] + "-sel");
      if (!select || select.disabled) return false;
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    } else HudElements.setMany(visibilityIds(id), value === "on");
    return true;
  }
  function drawn(el) {
    if (!el || el.hidden) return false;
    if (typeof getComputedStyle === "function") {
      try { if (getComputedStyle(el).display === "none") return false; } catch (_) {  }
    }
    if (!el.getBoundingClientRect) return true;
    const r = el.getBoundingClientRect();
    return !!(r.width && r.height);
  }
  function hiddenReason(id) {
    const row = ELEMENTS.find((e) => e[0] === id);
    if (!row || !doc) return null;
    const el = doc.querySelector(row[2]);
    const live = hudLive();
    if (live && el && el.hasAttribute && el.hasAttribute("data-col-drop")) return { reason: "not enough room", soft: true };
    if (live && drawn(el)) return null;
    const user = !!(el && el.hasAttribute && el.hasAttribute("data-hl-user"));
    const hideAttr = doc.body && doc.body.getAttribute ? String(doc.body.getAttribute("data-hud-hide") || "") : "";
    const ids = visibilityIds(id), hidden = hideAttr.split(/\s+/);
    const off = ids.length > 0 && ids.every((key) => hidden.indexOf(key) >= 0);
    for (const [ids, test, reason, soft] of HIDE_RULES) {
      if (ids.indexOf(id) >= 0 && test(has, user, off, el, live)) return { reason, soft: !!soft };
    }
    return live ? { reason: "hidden right now", soft: true } : null;
  }

  function peek(on, holdMs) {
    if (typeof ScreenLooks === "undefined") return;
    if (on) ScreenLooks.peek("hud", holdMs || 0);
    else ScreenLooks.endPeek();
  }
  const txt = (k, n) => {
    if (k === "s") return n + "%";
    if (!n) return "SHIPPED";
    if (k === "x") return Math.abs(n) + "% " + (n < 0 ? "left" : "right");
    return Math.abs(n) + "% " + (n < 0 ? "up" : "down");
  };
  const NAMES = { x: "LEFT / RIGHT", y: "UP / DOWN", s: "SIZE" };

  function build() {
    if (!doc) return;
    const host = doc.getElementById("pm-hud-details");
    if (!host || doc.getElementById("pm-hudlayout")) return;
    const el = (tag, props, kids) => {
      const e = doc.createElement(tag);
      for (const k in props || {}) {
        if (k === "attrs") { for (const a in props.attrs) e.setAttribute(a, props.attrs[a]); } else e[k] = props[k];
      }
      for (const c of kids || []) e.appendChild(c);
      return e;
    };
    const sum = el("summary", { id: "pm-hudlayout-sum", className: "adv-more-btn" });
    const body = el("div", { id: "pm-hudlayout-body", attrs: { role: "group", "aria-label": "HUD element position and size" } });
    const fold = el("details", { className: "pm-renderer-sub" }, [sum, body]);
    fold.id = "pm-hudlayout"; foldEl = fold;
    let editing = cam, editingProf = profile(), sel = IDS[0];
    const paintSum = () => { sum.textContent = "MOVE & SIZE · " + (isShipped(undefined, editingProf) ? "SHIPPED" : "CUSTOM"); };

    const help = el("p", { className: "adv-help" });
    body.appendChild(help);
    const paintHelp = () => {
      help.textContent = "Choose an element to show, hide, move or resize. AUTO follows the camera and HUD style. " +
        "Editing " + editingProf.toUpperCase() + " · " + editing.toUpperCase() + ": other styles and camera layouts keep their own positions. " +
          "Start with a preset or reset an element. Finish editing a value to apply it; leave the value fields to preview the HUD in a race.";
    };
    function stepper(id, label, options, read, write) {
      const built = SettingRow.build(id, label, options);
      SettingRow.wire(built.row, { values: options, read, write });
      body.appendChild(built.row);
      return built.sel;
    }
    const setPick = stepper("pm-hl-set", "LAYOUT FOR", [["cockpit", "COCKPIT CAM"], ["helmet", "HELMET CAM"], ["other", "OTHER CAMS"]], () => editing, (v) => {
      editing = v; if (fold.open) preview = v; apply(); paintAll(); peek(true, 900);
    });
    const presetPick = stepper("pm-hl-preset", "PRESET",
      PRESETS.map((p) => [p[0], p[1]]).concat([["custom", "CUSTOM", true]]), () => presetOf(editing, editingProf), (v) => {
        applyPreset(v, editing, editingProf); paintAll(); peek(true, 900);
      });
    const pick = stepper("pm-hl-el", "ELEMENT", ELEMENTS.map((e) => [e[0], e[1]]), () => sel, (v) => {
      sel = v; selected = sel; apply(); paintAll(); peek(true, 900);
    });

    stepper("pm-hl-visibility", "VISIBILITY", [], () => visibility(sel)?.value || "", (v) => {
      setVisibility(sel, v); paintAll(); peek(true, 900);
    });
    function paintVisibility() {
      const current = visibility(sel);
      doc.getElementById("pm-hl-visibility").hidden = !current;
      SettingRow.paint("pm-hl-visibility", current ? current.value : "", current ? current.choices : []);
    }

    const painters = [], sliders = [];
    let previewPending = false;
    for (const k of ["x", "y", "s"]) {
      const out = el("b");
      const inp = el("input", { type: "number", step: "any",
        attrs: { "aria-label": NAMES[k].toLowerCase() } });
      inp.id = "pm-hl-" + k;
      sliders.push(inp);
      let dirty = false;
      const commit = () => {
        dirty = false;
        const raw = inp.value.trim(), n = raw ? Number(raw) : NaN;
        if (!Number.isFinite(n) || (k === "s" && n <= 0)) {
          inp.value = String(get(sel, editing, editingProf)[k]);
          return;
        }
        const e = set(sel, { [k]: n }, editing, editingProf);
        inp.value = String(e[k]);
        out.textContent = txt(k, e[k]); paintSum(); paintPreset();
        previewPending = true;
      };
      inp.addEventListener("focus", () => peek(false));
      inp.addEventListener("input", () => { dirty = true; peek(false); });
      inp.addEventListener("change", commit);
      inp.addEventListener("blur", () => {
        if (dirty) commit();
        if (!previewPending) return;
        setTimeout(() => {
          if (!fold.open) { previewPending = false; return; }
          if (previewPending && !sliders.includes(doc.activeElement)) {
            previewPending = false;
            peek(true, 900);
          }
        }, 0);
      });
      painters.push(() => {
        const n = get(sel, editing, editingProf)[k];
        if (doc.activeElement !== inp) inp.value = String(n);
        out.textContent = txt(k, n);
      });
      body.appendChild(el("label", { className: "tune-row" }, [
        el("span", { className: "tune-label" }, [el("span", { textContent: NAMES[k] + " " }), out]), inp]));
    }

    const why = el("p", { className: "adv-help", attrs: { "aria-live": "polite" } });
    why.id = "pm-hl-why";
    body.appendChild(why);

    const resetOne = el("button", { type: "button", className: "opt-btn", textContent: "RESET ELEMENT" });
    resetOne.id = "pm-hl-reset-el";
    resetOne.addEventListener("click", () => { resetEl(sel, editing, editingProf); paintAll(); peek(true, 900); });
    const resetAll = el("button", { type: "button", className: "opt-btn", textContent: "RESET LAYOUT" });
    resetAll.id = "pm-hl-reset-set";
    resetAll.addEventListener("click", () => { resetSet(editing, editingProf); paintAll(); peek(true, 900); });
    body.appendChild(el("div", { className: "opt-row" }, [resetOne, resetAll]));

    function paintPreset() {
      for (const pid in TOUCH_UNFIT) SettingRow.optionDisabled("pm-hl-preset", pid, !presetFits(pid));
      const p = presetOf(editing, editingProf); if (presetPick.value !== p) presetPick.value = p;
    }
    function paintHidden() {
      for (const o of pick.options) {
        const r = hiddenReason(o.value), base = ELEMENTS.find((e) => e[0] === o.value)[1];
        const t = r ? base + " (" + (r.soft ? "" : "hidden: ") + r.reason + ")" : base;
        if (o.textContent !== t) o.textContent = t;
      }
      const r = hiddenReason(sel), off = !!(r && !r.soft);
      for (const inp of sliders) inp.disabled = off;
      resetOne.disabled = off;
      why.textContent = off ? "Not drawn now: " + r.reason + ". Its controls come back when it shows." : r ? "Note: " + r.reason + "." : "";
    }
    function paintAll() {
      if (!fold.open) editingProf = profile();
      if (setPick.value !== editing) setPick.value = editing;
      if (pick.value !== sel) pick.value = sel;
      for (const p of painters) p();
      paintSum(); paintPreset(); paintHelp(); paintVisibility(); paintHidden();
    }
    fold.addEventListener("toggle", () => {
      if (fold.open) { editing = cam; editingProf = profile(); preview = editing; previewProf = editingProf; selected = sel; }
      else { preview = null; previewProf = null; selected = null; previewPending = false; }
      apply(); paintAll();
    });
    const refresh = () => {
      if (fold.open) { editingProf = profile(); previewProf = editingProf; apply(); }
      paintAll();
    };
    host.addEventListener("change", (ev) => { if (!fold.contains(ev.target)) setTimeout(refresh, 0); });
    const ROW_KEYS = ["hudProfile", "hudMetricsLayout", "hudMapVis", "hudGapsVis", "hudMirror", "hudElements"];
    if (store && store.subscribe) store.subscribe((c) => {
      if (c && (ROW_KEYS.indexOf(c.key) >= 0 || (Array.isArray(c.keys) && c.keys.some((k) => ROW_KEYS.indexOf(k) >= 0)))) setTimeout(refresh, 0);
    });
    onModeChange = refresh;
    host.appendChild(fold);
    paintAll();
  }

  function init(gate) { apply(); if (gate) gate(build); else build(); watchPackUnhide(); watchReadoutSizes(); }
  apply();
  _pub = true;
  if (doc) {
    const atGate = (fn) => (typeof SettingsNav !== "undefined" && SettingsNav.lazy ? SettingsNav.lazy(fn) : fn());
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", () => init(atGate), { once: true });
    else if (doc.readyState === "complete") init();
    else init((fn) => doc.addEventListener("DOMContentLoaded", () => atGate(fn), { once: true }));
  }

  return {
    ELEMENTS, SETS, PROFILES, COCKPIT_CAMS, SHIPPED, TOUCH_SHIPPED, PRESETS, presetFits,
    PACK_AIR,
    holdArrangePreview: (on) => { arrangePreview = !!on; },
    get, set, commit, resetEl, resetSet, isShipped, scaleOf, setCam, apply, fit, clearReadouts, build,
    camSet, shown: () => shown(), profile, all, migrate, presetLayout, applyPreset, presetOf,
    hiddenReason, originOf, packPhoneRects, visibilityIds, visibility, setVisibility, screenBounds,
  };
})();
Object.freeze(HudLayout);
