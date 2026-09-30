/* Apex 26 — PauseOpts: the PAUSE MENU fold under SETTINGS › APPEARANCE, and
   the two-press confirm on its QUIT TO MENU / RESTART RACE buttons.

   Self-wiring like js/ui/title-fx.js: GameStore + SettingRow, no G façade and
   no line in js/game.js. Copies MENU WASH end to end — validated store reads,
   an <html data-*> attribute written ONLY for a non-default answer (so the
   shipped look is the absence of every attribute), the FIRST answer stamped by
   index.html's inline boot script, and CSS that keys off the attribute through
   tokens alone (css/components.css).

   LAYOUT: GRID / LIST. GRID is the shipped two-up (RESTART | SETTINGS share a
   row); LIST stacks every button full width. Lands on <html data-pause-layout>.

   SIDE: CENTRE / LEFT / RIGHT. Where the card sits in the viewport, so a
   thumb-side player can keep the race visible on the other half. Lands on
   <html data-pause-side>.

   BACKGROUND: FULL / SOFT / OFF. How much the pause scrim darkens the race —
   BOTH layers (#pausemenu's own wash and its ::backdrop) read the
   --pause-wash / --pause-scrim tokens, with the shipped numbers as their
   fallbacks. Lands on <html data-pause-dim>. An OS asking for reduced
   transparency still wins on the backdrop (its rule is later in the cascade).

   CONFIRM QUIT: ON (shipped) / OFF. With it ON the first press on QUIT TO MENU
   or RESTART RACE only ARMS the button ("… — TAP AGAIN", .armed fill, an
   aria-label that says so); a second press within ARM_MS runs the game's own
   onclick. A capture-phase click listener on #pausemenu does the gating, so
   the handlers in js/game.js stay untouched. The arm clears on its timer and
   whenever the pause card hides. A disabled button (multiplayer restart) is
   never armed. Behaviour only, so no attribute.

   Needs GameStore at eval (HARD_EDGES). SettingRow is read at call time only. */
const PauseOpts = (function () {
  "use strict";

  const KEY_LAYOUT = "pauseLayout";    // apex26.pauseLayout — json: "grid" | "list" | unset
  const KEY_SIDE = "pauseSide";        // apex26.pauseSide — json: "centre" | "left" | "right" | unset
  const KEY_DIM = "pauseDim";          // apex26.pauseDim — json: "full" | "soft" | "off" | unset
  const KEY_CONFIRM = "pauseConfirm";  // apex26.pauseConfirm — json: "on" | "off" | unset
  const LAYOUTS = [["grid", "GRID"], ["list", "LIST"]];
  const SIDES = [["centre", "CENTRE"], ["left", "LEFT"], ["right", "RIGHT"]];
  const DIMS = [["full", "FULL"], ["soft", "SOFT"], ["off", "OFF"]];
  const CONFIRMS = [["on", "ON"], ["off", "OFF"]];
  // Same window as the other two-press guards (settings-export LOAD, the
  // renderer picker's raceGuard), a second longer: this one is read mid-race.
  const ARM_MS = 5000;
  // The guarded buttons and the words the armed label and aria-label use.
  const GUARDED = { "pm-quit": "QUIT TO MENU", "pm-restart": "RESTART" };
  const ARIA = { "pm-quit": "Confirm: quit to menu", "pm-restart": "Confirm: restart race" };

  const store = GameStore.store;
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const hasDoc = typeof document !== "undefined";

  // A value the registry does not name (hand-edited storage) reads as unset.
  function pick(key, allowed, def) {
    const v = store.get(key, null);
    for (const [id] of allowed) if (id === v) return v;
    return def;
  }
  const layoutMode = () => pick(KEY_LAYOUT, LAYOUTS, "grid");
  const sideMode = () => pick(KEY_SIDE, SIDES, "centre");
  const dimMode = () => pick(KEY_DIM, DIMS, "full");
  const confirmMode = () => pick(KEY_CONFIRM, CONFIRMS, "on");
  /** Every knob at its shipped answer — what the fold's summary calls SHIPPED. */
  const shipped = () => layoutMode() === "grid" && sideMode() === "centre"
    && dimMode() === "full" && confirmMode() === "on";

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
      return read();
    };
  }
  const setLayout = setter(KEY_LAYOUT, LAYOUTS, "grid", "pm-pauselayout", layoutMode);
  const setSide = setter(KEY_SIDE, SIDES, "centre", "pm-pauseside", sideMode);
  const setDim = setter(KEY_DIM, DIMS, "full", "pm-pausedim", dimMode);
  const setConfirmRaw = setter(KEY_CONFIRM, CONFIRMS, "on", "pm-pauseconfirm", confirmMode);
  function setConfirm(v) { const r = setConfirmRaw(v); if (r === "off") disarm(); return r; }

  // ── CONFIRM QUIT / RESTART ─────────────────────────────────────────────
  let armed = null;   // { btn, text, aria, at, t }
  function disarm() {
    if (!armed) return;
    const a = armed;
    armed = null;
    clearTimeout(a.t);
    a.btn.textContent = a.text;
    if (a.aria == null) a.btn.removeAttribute("aria-label");
    else a.btn.setAttribute("aria-label", a.aria);
    if (a.btn.classList) a.btn.classList.remove("armed");
  }
  function arm(btn) {
    disarm();
    armed = {
      btn,
      text: btn.textContent,
      aria: btn.getAttribute ? btn.getAttribute("aria-label") : null,
      at: Date.now(),
      t: setTimeout(disarm, ARM_MS),
    };
    btn.textContent = GUARDED[btn.id] + " — TAP AGAIN";
    btn.setAttribute("aria-label", ARIA[btn.id]);
    if (btn.classList) btn.classList.add("armed");
  }
  const isArmed = (id) => !!(armed && armed.btn && armed.btn.id === id);

  // CAPTURE phase on the card: runs before the button's own onclick, so an
  // unarmed press is swallowed here and never reaches js/game.js.
  function onPauseClick(e) {
    const t = e && e.target;
    const btn = t && t.closest ? t.closest("#pm-quit, #pm-restart") : null;
    if (!btn || !GUARDED[btn.id] || btn.disabled) return;
    if (confirmMode() === "off") { disarm(); return; }
    // Age as well as the timer: a throttled background tab can hold the expiry
    // back, and a tap that old is a fresh question.
    const live = armed && armed.btn === btn && (Date.now() - armed.at) <= ARM_MS;
    if (live) { disarm(); return; }          // the second press: let the handler run
    e.stopImmediatePropagation();
    if (e.preventDefault) e.preventDefault();
    arm(btn);
  }

  function initUI() {
    wireRows();
    paintSummary();
    const pm = hasDoc ? document.getElementById("pausemenu") : null;
    if (!pm || pm._pauseOptsWired) return;
    pm._pauseOptsWired = true;
    pm.addEventListener("click", onPauseClick, true);
    if (typeof MutationObserver !== "undefined") {
      const mo = new MutationObserver(() => { if (pm.hidden) disarm(); });
      mo.observe(pm, { attributes: true, attributeFilter: ["hidden"] });
    }
  }

  // Static shell rows in APPEARANCE › PAUSE MENU (#pm-pausemenu).
  function wireRows() {
    if (typeof SettingRow === "undefined") return;
    const rows = [
      ["pm-pauselayout", LAYOUTS, layoutMode, setLayout],
      ["pm-pauseside", SIDES, sideMode, setSide],
      ["pm-pausedim", DIMS, dimMode, setDim],
      ["pm-pauseconfirm", CONFIRMS, confirmMode, setConfirm],
    ];
    for (const [id, values, read, write] of rows) {
      SettingRow.wire(id, { values, read, write: (v) => write(v) });   // a missing row is a no-op
    }
  }

  apply();

  // Deferred scripts run while readyState is "interactive"; only a document
  // that is already COMPLETE wires now (same rule as js/ui/title-fx.js).
  if (typeof document !== "undefined") {
    if (document.readyState === "complete") initUI();
    else document.addEventListener("DOMContentLoaded", initUI, { once: true });
  }

  return {
    KEY_LAYOUT, KEY_SIDE, KEY_DIM, KEY_CONFIRM, LAYOUTS, SIDES, DIMS, CONFIRMS, ARM_MS,
    layoutMode, sideMode, dimMode, confirmMode, shipped,
    setLayout, setSide, setDim, setConfirm,
    apply, initUI, wireRows, disarm, isArmed, onPauseClick,
  };
})();
Object.freeze(PauseOpts);
