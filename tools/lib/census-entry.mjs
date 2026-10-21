// @doc gpu-game-check's --entry api|menu|menu-full and --cam A>B parsing, its menu-prep wait and its race gate.
/*
 * census-entry.mjs — HOW THE GPU CENSUS ENTERS THE RACE (hunt 5 E).
 *
 * Every census before this one started the race through `__apex.race(track)`,
 * which never runs the player's path: the menu builds the circuit, then
 * `menuFinish` (js/game.js) runs `prepareMenuCarAssets` (the car pre-build,
 * PR #1755's flap and planted-wheel steps included) and requests the TLX program
 * warm (`warmPrograms`, which sets the `_warmKey` startRaceBody's requestWarm
 * compares). race() reaches startRaceBody with none of that done, so every
 * race-entry number the census printed was the COLD entry no player gets.
 *
 *   api        __apex.race(track[, tod]) — the census as it always was (default)
 *   menu       title -> RACE -> RACE SETUP -> wait for __apex.menuPrep() -> START RACE,
 *              under the harness's intro shortcut (the 700 ms card, no drive-out,
 *              no flyby: LoadingScreen.isAutomation)
 *   menu-full  the same at PLAYER PACE (?fullIntro=1): garage drive-out and flyby
 *
 * `--cam A>B` starts the leg on camera A and switches to B halfway through the
 * driven window — `chase>cockpit` is how the opt-in lazy mirror warm
 * (apex26.tlxMirWarmLazy=1, tlx.js startMirrorWarm) is paid mid-race, where a
 * player who switches onboard would feel it.
 *
 * Pure and dependency-free so tests/unit/ci-coverage.test.mjs runs it without a
 * browser; menuPrepReady ships to the page through waitForFunction (no closures).
 */

export const ENTRIES = ["api", "menu", "menu-full"];

/** The --entry value, or null when it is not one of ENTRIES (the caller refuses it). */
export function parseEntry(v) {
  const e = v == null || v === "" ? "api" : String(v).trim();
  return ENTRIES.includes(e) ? e : null;
}

/** `--cam` spec: "chase" -> {start: "chase", switchTo: null}; "chase>cockpit" -> a mid-window switch.
 *  null/"" -> the game's own default camera. A malformed spec ("a>", ">b", "a>b>c") is null. */
export function parseCam(v) {
  if (v == null || v === "") return { start: null, switchTo: null };
  const parts = String(v).split(">").map((s) => s.trim());
  if (parts.length > 2 || parts.some((p) => !p)) return null;
  return { start: parts[0], switchTo: parts[1] || null };
}

/** The beat (0-based) the switch fires on: the middle of the window, never the first beat. */
export function switchBeat(beats) {
  return Math.max(1, Math.floor(Math.max(1, beats) / 2));
}

/** THE RACE GATE (gpu-game-check, after park()): state "race", nothing compiling, and
 *  — when race entry ASKED for a TLX warm — that warm finished. Serializable; it keeps
 *  its bookkeeping on window.__raceGate, which the tool reads back afterwards
 *  (warmMark: the RaceEntryProfile warm mark this entry fired; warmRequested).
 *
 *  NO WARM REQUESTED IS A STATE, NOT A WAIT (hunt 5 E). startRaceBody calls
 *  RaceEntryProfile.requestWarm only when the material pack has settled, and it
 *  marks warm:request, warm:skipped-menu (the menu warmed this world) or warm:noop
 *  (no gfx.warm: GLX/WGX). With none of them — the pack gate skipped the call —
 *  or with skipped-menu/noop, no entry warm exists, memState().warm.done never
 *  turns true for it, and the old gate timed out: runs 491/492/502/503/505/507 all
 *  read "RACE NOT REACHED" and their spans came from an entry re-armed ~95 s later.
 *  The decision is made synchronously with setState("count"), so once the state is
 *  "race" (park() runs after count) and this entry's window is open (a begin: mark),
 *  the absence of warm:request is final. A build with no raceEntryProfile hook keeps
 *  the older rule (warm timeline done, or seen-and-ended, or 5 s of race with none). */
export function raceGate() {
  const A = window.__apex; const i = A && A.info ? A.info() : null;
  const t = (typeof GLX !== "undefined" && GLX) ? GLX.__tlx : null;
  // TLX requests its warm at race start and STARTS it on the next present, so
  // "not warming" alone is true in the gap before it begins. A leg whose entry
  // asked for a warm must have FINISHED one; GLX/WGX report no warm.
  const m = t && t.memState ? t.memState() : null;
  const w = m && m.warm ? m.warm : null;
  const warming = !!(t && t.warming && t.warming());
  const g = window.__raceGate || (window.__raceGate = { t0: 0, saw: false, warmMark: null, warmRequested: null, profiled: false });
  if (i && i.state === "race" && !g.t0) g.t0 = performance.now();
  if (warming) g.saw = true;
  let snap = null;
  try { snap = A && typeof A.raceEntryProfile === "function" ? A.raceEntryProfile() : null; } catch (_) { snap = null; }
  const marks = snap && Array.isArray(snap.marks) ? snap.marks : [];
  g.profiled = marks.some((x) => x && /^begin:/.test(String(x.n)));
  let wm = null;
  for (const x of marks) if (x && (x.n === "warm:request" || x.n === "warm:skipped-menu" || x.n === "warm:noop")) wm = x.n;
  g.warmMark = wm; g.warmRequested = wm === "warm:request";
  if (!(i && i.state === "race") || warming) return false;
  if (g.profiled && !g.warmRequested) return true;
  // A tree whose memState() has no warm timeline (the pre-#228 TLX) still warms:
  // require the warm SEEN and ended, or 5 s of race with none (census 224).
  const tlxNoTimeline = !!(t && t.warming) && !w;
  return w ? w.done === true : (!tlxNoTimeline || g.saw || (!!g.t0 && performance.now() - g.t0 > 5000));
}

/** THE PREP TIMELINE (B·H8 follow-up): which stage of the menu prep the wait is in.
 *  Installed on the page at RACE SETTINGS, sampled every 50 ms: one row per change of
 *  a menuPrep() field or the garage prewarm's readiness, `[ms, "field=value …"]`.
 *  prepTimelineRead() stops it and adds the gfx/game Log lines of the window (the
 *  "selector car assets ready" / "garage prewarm" records name the stage ends).
 *  Serializable: both ship to the page through page.evaluate (no closures). */
export function prepTimelineStart() {
  const A = window.__apex, t0 = performance.now(), rows = [], last = {};
  const mark = (window.Log && Log.records({}).slice(-1)[0] || { id: 0 }).id;
  const tick = () => {
    let p = null, g = null;
    try { p = A.menuPrep(); } catch (_) { /* surface absent: a row says so */ }
    try { g = A.garagePrebuild && A.garagePrebuild(); } catch (_) { /* */ }
    const k = p ? { world: p.world, building: p.building, done: p.done, warmed: p.warmed, warmFrames: p.warmFrames,
      warming: p.warming, cars: !!p.cars, garageReady: !!(g && g.garageReady) } : { prep: "absent" };
    const ch = Object.keys(k).filter((x) => k[x] !== last[x]).map((x) => x + "=" + k[x]);
    if (ch.length) rows.push([Math.round(performance.now() - t0), ch.join(" ")]);
    Object.assign(last, k);
  };
  tick();
  window.__apexPrepTl = { rows, mark, t0, timer: setInterval(tick, 50) };
  return true;
}
export function prepTimelineRead() {
  const T = window.__apexPrepTl;
  if (!T) return null;
  clearInterval(T.timer);
  let logs = [];
  try {
    logs = Log.records({ since: T.mark }).filter((r) => (r.ns === "gfx" || r.ns === "game") && r.level !== "debug" && r.level !== "trace")
      .slice(-60).map((r) => [Math.round(r.t - T.t0), r.ns + ": " + String(r.msg).slice(0, 160)]);
  } catch (_) { /* Log absent */ }
  return { rows: T.rows.slice(0, 200), logs };
}

/** The menu has prepared what START RACE will use: menuFinish ran to its end for the
 *  current selection, its hidden warm frames are drawn and nothing compiles. Serializable. */
export function menuPrepReady() {
  const A = typeof window !== "undefined" ? window.__apex : null;
  const p = A && typeof A.menuPrep === "function" ? A.menuPrep() : null;
  return !!(p && p.state === "menu" && p.world && p.done && p.warmFrames === 0 && !p.warming);
}
