const PauseOpts = (function () {
  "use strict";

  const KEY_LAYOUT = "pauseLayout";
  const KEY_SIDE = "pauseSide";
  const KEY_DIM = "pauseDim";
  const KEY_CONFIRM = "pauseConfirm";
  const LAYOUTS = [["grid", "GRID"], ["list", "LIST"], ["compact", "COMPACT"], ["wide", "WIDE"], ["sidebar", "SIDEBAR"]];
  const SIDES = [["centre", "CENTRE"], ["left", "LEFT"], ["right", "RIGHT"]];
  const DIMS = [["full", "FULL"], ["soft", "SOFT"], ["off", "OFF"]];
  const CONFIRMS = [["on", "ON"], ["off", "OFF"]];
  const ARM_MIN_MS = 350;
  const ARM_MAX_MS = 5000;
  const GUARDED = { "pm-quit": 1, "pm-restart": 1 };
  const ARMED_LABEL = "TAP AGAIN";
  const ARIA = { "pm-quit": "Confirm: quit to menu", "pm-restart": "Confirm: restart race" };

  const store = GameStore.store;
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const hasDoc = typeof document !== "undefined";

  function pick(key, allowed, def) {
    const v = store.get(key, null);
    for (const [id] of allowed) if (id === v) return v;
    return def;
  }
  const layoutMode = () => pick(KEY_LAYOUT, LAYOUTS, "grid");
  const sideMode = () => pick(KEY_SIDE, SIDES, "centre");
  const dimMode = () => pick(KEY_DIM, DIMS, "full");
  const confirmMode = () => pick(KEY_CONFIRM, CONFIRMS, "on");
  const shipped = () => layoutMode() === "grid" && sideMode() === "centre"
    && dimMode() === "full" && confirmMode() === "on"
    && (typeof ScreenLooks === "undefined" || ScreenLooks.isShipped("pause"));

  function stamp(attr, value, def) {
    if (!root || !root.dataset) return;
    if (value === def) delete root.dataset[attr];
    else root.dataset[attr] = value;
  }
  function paintSummary() {
    const sum = hasDoc ? document.getElementById("pm-pausemenu-sum") : null;
    if (sum) sum.textContent = "PAUSE MENU · " + (shipped() ? "SHIPPED" : "CUSTOM");
  }
  function apply() {
    stamp("pauseLayout", layoutMode(), "grid");
    stamp("pauseSide", sideMode(), "centre");
    stamp("pauseDim", dimMode(), "full");
    paintSummary();
  }

  function paintRow(id, value) {
    if (typeof SettingRow !== "undefined" && SettingRow.paint) SettingRow.paint(id, value);
  }
  function setter(key, allowed, def, rowId, read) {
    return (v) => {
      let next = def;
      for (const [id] of allowed) if (id === v) next = v;
      store.set(key, next);
      apply();
      paintRow(rowId, read());
      if (typeof ScreenLooks !== "undefined" && ScreenLooks.peek) ScreenLooks.peek("pause", ScreenLooks.PEEK_MS);
      return read();
    };
  }
  const setLayout = setter(KEY_LAYOUT, LAYOUTS, "grid", "pm-pauselayout", layoutMode);
  const setSide = setter(KEY_SIDE, SIDES, "centre", "pm-pauseside", sideMode);
  const setDim = setter(KEY_DIM, DIMS, "full", "pm-pausedim", dimMode);
  const setConfirmRaw = setter(KEY_CONFIRM, CONFIRMS, "on", "pm-pauseconfirm", confirmMode);
  function setConfirm(v) { const r = setConfirmRaw(v); if (r === "off") disarm(); return r; }

  let armed = null;
  let armTimer = 0;
  let expiredArm = null;
  let confirmPending = null;
  let confirmPendingAt = 0;
  let confirmPendingEv = null;
  let confirmFallback = false;
  let downQ = [];
  function clearPending() { confirmPending = null; confirmPendingAt = 0; confirmPendingEv = null; confirmFallback = false; }
  function wallNow() {
    try { return performance.now(); } catch (_) { return Date.now(); }
  }
  function guardedBtn(node) {
    const btn = node && node.closest ? node.closest("#pm-quit, #pm-restart") : null;
    return btn && GUARDED[btn.id] ? btn : null;
  }
  function pruneDowns() {
    const now = wallNow();
    if (downQ.length) downQ = downQ.filter((d) => now - d.wall < ARM_MAX_MS);
  }
  function noteDown(e) {
    const btn = guardedBtn(e && e.target);
    if (!btn || !e.isTrusted || !Number.isFinite(e.timeStamp)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pruneDowns();
    if (armed && armed.btn === btn) downQ = downQ.filter((d) => d.id !== btn.id);
    downQ.push({ id: btn.id, ts: e.timeStamp, wall: wallNow() });
    if (downQ.length > 6) downQ.shift();
  }
  function peekDown(id) {
    pruneDowns();
    for (const d of downQ) if (d.id === id) return d.ts;
    return null;
  }
  function takeDown(id) {
    pruneDowns();
    const i = downQ.findIndex((d) => d.id === id);
    if (i < 0) return null;
    const ts = downQ[i].ts;
    downQ.splice(i, 1);
    return ts;
  }
  function stampOf(e) {
    if (!e || !e.isTrusted) return null;
    const btn = guardedBtn(e.target);
    if (btn && e.type !== "pointerdown") {
      const down = peekDown(btn.id);
      if (Number.isFinite(down)) return down;
    }
    return Number.isFinite(e.timeStamp) ? e.timeStamp : null;
  }
  function clearArmTimer() {
    if (armTimer) { clearTimeout(armTimer); armTimer = 0; }
  }
  function eventAge(e) {
    if (!armed || armed.evAt == null || !e || !e.isTrusted) return null;
    const ts = stampOf(e);
    if (!Number.isFinite(ts)) return null;
    return ts - armed.evAt;
  }
  function expireIfStale(e) {
    if (!armed || wallNow() - armed.wallAt < ARM_MAX_MS) return;
    const ev = eventAge(e);
    if (ev != null && ev >= 0 && ev < ARM_MAX_MS) return;
    disarm();
  }
  function youngTap(e) {
    if (!armed || wallNow() - armed.wallAt >= ARM_MIN_MS) return false;
    const ev = eventAge(e);
    return !(ev != null && ev >= ARM_MIN_MS);
  }
  function revertBtn(a) {
    a.btn.textContent = a.text;
    if (a.aria == null) a.btn.removeAttribute("aria-label");
    else a.btn.setAttribute("aria-label", a.aria);
    if (a.btn.classList) a.btn.classList.remove("armed");
  }
  function disarm() {
    expiredArm = null;
    if (!armed) return;
    const a = armed;
    armed = null;
    clearArmTimer();
    revertBtn(a);
  }
  function expireArmTimer() {
    armTimer = 0;
    if (!armed) return;
    const a = armed;
    armed = null;
    revertBtn(a);
    expiredArm = { btn: a.btn, evAt: a.evAt, wallAt: a.wallAt };
  }
  function arm(btn, e) {
    const fromDown = e && e.isTrusted ? takeDown(btn.id) : null;
    disarm();
    armed = {
      btn,
      evAt: Number.isFinite(fromDown) ? fromDown
        : (e && e.isTrusted && Number.isFinite(e.timeStamp) ? e.timeStamp : null),
      text: btn.textContent,
      aria: btn.getAttribute ? btn.getAttribute("aria-label") : null,
      wallAt: wallNow(),
    };
    btn.textContent = ARMED_LABEL;
    btn.setAttribute("aria-label", ARIA[btn.id]);
    if (btn.classList) btn.classList.add("armed");
    armTimer = setTimeout(expireArmTimer, ARM_MAX_MS);
  }
  const armAge = (t) => {
    if (!armed) return Infinity;
    const now = t != null ? t : wallNow();
    return now - armed.wallAt;
  };
  const isArmed = (id) => !!(armed && armed.btn && armed.btn.id === id);

  function onPauseClick(e) {
    expireIfStale(e);
    const t = e && e.target;
    const btn = t && t.closest ? t.closest("#pm-quit, #pm-restart") : null;
    if (confirmPending) {
      const onPending = !!(btn && confirmPending === btn.id);
      const ev = (onPending && confirmPendingEv != null && e && e.isTrusted && Number.isFinite(e.timeStamp))
        ? e.timeStamp - confirmPendingEv : null;
      if (wallNow() - confirmPendingAt >= ARM_MAX_MS && !(ev != null && ev >= 0 && ev < ARM_MAX_MS)) clearPending();
    }
    if (confirmPending && btn && confirmPending === btn.id) {
      if (!e.isTrusted && !confirmFallback) {
        e.stopImmediatePropagation();
        if (e.preventDefault) e.preventDefault();
        return;
      }
      clearPending();
      expiredArm = null;
      return;
    }
    if (!btn || !GUARDED[btn.id] || btn.disabled) { if (armed) disarm(); else expiredArm = null; return; }
    if (confirmMode() === "off") { disarm(); return; }
    if (!armed && expiredArm && expiredArm.btn === btn && e && e.isTrusted && e.detail !== 0
        && expiredArm.evAt != null && Number.isFinite(e.timeStamp)) {
      const ev = e.timeStamp - expiredArm.evAt;
      if (ev >= ARM_MIN_MS && ev < ARM_MAX_MS) { expiredArm = null; return; }
    }
    if (expiredArm && expiredArm.btn === btn) expiredArm = null;
    const live = !!(armed && armed.btn === btn);
    const ghost = live && e.isTrusted && e.detail !== 0 && youngTap(e);
    if (ghost) takeDown(btn.id);
    if (live && !ghost) { takeDown(btn.id); disarm(); return; }
    e.stopImmediatePropagation();
    if (e.preventDefault) e.preventDefault();
    if (!ghost) arm(btn, e);
  }
  function onPausePointerDown(e) { noteDown(e); }
  function finishPointerConfirm(btn, stamp) {
    setTimeout(() => {
      if (confirmPending !== btn.id || confirmPendingAt !== stamp) return;
      confirmFallback = true;
      try { btn.click(); } finally { confirmFallback = false; }
    }, 0);
  }
  function onPausePointerUp(e) {
    if (!e || e.pointerType === "mouse" && e.button !== 0) return;
    expireIfStale(e);
    const t = e.target;
    const btn = t && t.closest ? t.closest("#pm-quit, #pm-restart") : null;
    if (!btn || !GUARDED[btn.id] || btn.disabled || confirmMode() === "off") return;
    if (!armed || armed.btn !== btn || !e.isTrusted) return;
    if (youngTap(e)) return;
    const gesture = peekDown(btn.id);
    takeDown(btn.id);
    confirmPending = btn.id;
    confirmPendingAt = wallNow();
    confirmPendingEv = Number.isFinite(gesture) ? gesture : (Number.isFinite(e.timeStamp) ? e.timeStamp : null);
    const stamp = confirmPendingAt;
    disarm();
    btn.click();
    finishPointerConfirm(btn, stamp);
  }
  function onPauseKey(e) {
    if (!e || e.key !== "Escape") return;
    const pm = hasDoc ? document.getElementById("pausemenu") : null;
    if (!pm || pm.hidden) return;
    disarm();
  }

  function paintBuild() {
    if (!hasDoc) return;
    const tag = document.getElementById("pm-build");
    if (!tag) return;
    const meta = document.querySelector('meta[name="apex-build"]');
    const build = meta && meta.content;
    tag.textContent = build ? ("build " + build) : "build unknown";
  }

  function initUI(gate) {
    if (gate) gate(wireRows); else wireRows();
    paintSummary();
    paintBuild();
    const pm = hasDoc ? document.getElementById("pausemenu") : null;
    if (!pm || pm._pauseOptsWired) return;
    pm._pauseOptsWired = true;
    if (typeof InputHoldButtons !== "undefined") InputHoldButtons.secondaryTap(document.getElementById("pausebtn"), {
      beforeActivate: e => {
        let blocked = false;
        if (typeof TopModal !== "undefined") TopModal.onClickShield({
          isTrusted: e.isTrusted, detail: 1, target: e.target, timeStamp: e.timeStamp,
          clientX: e.clientX, clientY: e.clientY,
          preventDefault() { blocked = true; }, stopImmediatePropagation() {},
        });
        return !blocked;
      },
    });
    const mq = typeof matchMedia === "function" ? matchMedia("(orientation: landscape) and (max-height: 500px)") : null;
    if (mq && document.body && document.body.toggleAttribute) {
      const stamp = () => document.body.toggleAttribute("data-pause-short", !!mq.matches);
      stamp();
      if (mq.addEventListener) mq.addEventListener("change", stamp);
    }
    pm.addEventListener("click", onPauseClick, true);
    pm.addEventListener("pointerdown", onPausePointerDown, true);
    pm.addEventListener("pointerup", onPausePointerUp, true);
    document.addEventListener("keydown", onPauseKey, true);
    if (typeof MutationObserver !== "undefined") {
      const mo = new MutationObserver(() => { if (pm.hidden) { disarm(); clearPending(); downQ = []; } });
      mo.observe(pm, { attributes: true, attributeFilter: ["hidden"] });
    }
  }

  function wireRows() {
    if (typeof SettingRow === "undefined" || !SettingRow.build) return;
    const body = hasDoc ? document.getElementById("pm-pausemenu-body") : null;
    if (!body) return;
    if (body.dataset.pauseRowsMounted) {
      for (const [id, read] of [["pm-pauselayout", layoutMode], ["pm-pauseside", sideMode],
        ["pm-pausedim", dimMode], ["pm-pauseconfirm", confirmMode]]) paintRow(id, read());
      return;
    }
    body.dataset.pauseRowsMounted = "1";
    const help = document.createElement("p");
    help.className = "adv-help";
    help.id = "pm-pausemenu-help";
    help.textContent = "LAYOUT: GRID pairs RESTART and SETTINGS, LIST gives every button its own row, COMPACT fits three to a row, WIDE runs them along the bottom of the screen, SIDEBAR makes a full-height strip on the SIDE edge. SIDE: LEFT or RIGHT keeps half the race in view. BACKGROUND: how much the race darkens behind the card. CONFIRM QUIT: ON asks for a second tap before QUIT TO MENU or RESTART RACE.";
    body.appendChild(help);
    const rows = [
      ["pm-pauselayout", "LAYOUT", LAYOUTS, layoutMode, setLayout],
      ["pm-pauseside", "SIDE", SIDES, sideMode, setSide],
      ["pm-pausedim", "BACKGROUND", DIMS, dimMode, setDim],
      ["pm-pauseconfirm", "CONFIRM QUIT", CONFIRMS, confirmMode, setConfirm],
    ];
    for (const [id, label, values, read, write] of rows) {
      const r = SettingRow.build(id, label, values);
      if (r.sel) r.sel.setAttribute("aria-describedby", "pm-pausemenu-help");
      SettingRow.wire(r.row, { values, read, write: (v) => write(v) });
      body.appendChild(r.row);
    }
  }

  apply();

  if (typeof document !== "undefined") {
    if (document.readyState === "complete") initUI();
    else document.addEventListener("DOMContentLoaded", () => initUI(typeof SettingsNav !== "undefined" ? SettingsNav.lazy : null), { once: true });
  }

  return {
    KEY_LAYOUT, KEY_SIDE, KEY_DIM, KEY_CONFIRM, LAYOUTS, SIDES, DIMS, CONFIRMS, ARM_MIN_MS, ARM_MAX_MS,
    layoutMode, sideMode, dimMode, confirmMode, shipped,
    setLayout, setSide, setDim, setConfirm,
    apply, initUI, wireRows, disarm, isArmed, armAge, onPauseClick,
  };
})();
Object.freeze(PauseOpts);
