/* Apex 26 — PauseOpts: the PAUSE MENU fold under SETTINGS › APPEARANCE, and
   the two-press confirm on its QUIT TO MENU / RESTART RACE buttons.

   Self-wiring like js/ui/title-fx.js: GameStore + SettingRow, no G façade and
   no line in js/game.js. Copies MENU WASH end to end — validated store reads,
   an <html data-*> attribute written ONLY for a non-default answer (so the
   shipped look is the absence of every attribute), the FIRST answer stamped by
   index.html's inline boot script, and CSS that keys off the attribute through
   tokens alone (css/components.css).

   LAYOUT: GRID / LIST / COMPACT / WIDE / SIDEBAR. GRID is the shipped two-up
   (RESTART | SETTINGS share a row); LIST stacks every button full width;
   COMPACT puts three doors to a row at chip height for short screens; WIDE
   lays the doors in one row along the bottom so the race keeps the top;
   SIDEBAR is a full-height strip on the SIDE edge (CENTRE reads as LEFT).
   Lands on <html data-pause-layout>.

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

   SHIPPED composes: the fold's summary says SHIPPED only while these four AND
   ScreenLooks' lookPause knobs (BUTTONS & CARD, mounted into the same fold)
   are at their defaults. Every setter also PEEKS the pause card behind the
   settings page, like the ScreenLooks rows do.

   Needs GameStore at eval (HARD_EDGES). SettingRow and ScreenLooks are read at
   call time only (screen-looks.js loads after this file). */
const PauseOpts = (function () {
  "use strict";

  const KEY_LAYOUT = "pauseLayout";    // apex26.pauseLayout — json: "grid" | "list" | "compact" | "wide" | "sidebar" | unset
  const KEY_SIDE = "pauseSide";        // apex26.pauseSide — json: "centre" | "left" | "right" | unset
  const KEY_DIM = "pauseDim";          // apex26.pauseDim — json: "full" | "soft" | "off" | unset
  const KEY_CONFIRM = "pauseConfirm";  // apex26.pauseConfirm — json: "on" | "off" | unset
  const LAYOUTS = [["grid", "GRID"], ["list", "LIST"], ["compact", "COMPACT"], ["wide", "WIDE"], ["sidebar", "SIDEBAR"]];
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
  /** Every knob at its shipped answer — what the fold's summary calls SHIPPED.
   *  Includes the ScreenLooks lookPause knobs that share this fold. */
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

  // Rows live in #pm-pausemenu-body via SettingRow.build (not the static shell):
  // four full set-rows were +28 shellNodes and pushed the tree past the 40-line
  // absorb. TITLE LAYOUT already mounts this way; wire the built row element.
  function wireRows() {
    if (typeof SettingRow === "undefined" || !SettingRow.build) return;
    const body = hasDoc ? document.getElementById("pm-pausemenu-body") : null;
    if (!body || body.dataset.pauseRowsMounted) return;
    body.dataset.pauseRowsMounted = "1";
    // One fold help (not four per-row lines): same copy the shell used to carry
    // as #pm-pausemenu-help before the rows moved out of index.html.
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
