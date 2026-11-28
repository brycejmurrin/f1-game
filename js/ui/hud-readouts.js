/* Apex 26 — the race HUD's derived readouts, kept out of js/ui/hud.js.
   Pure helpers plus two small stateful pieces GameHud owns one of each:
     lapsApart   — a gap of a lap or more reads "+1L", not ~90 s of distance ÷ speed
     gapClock    — the ▲/▼ chip's time gap at a timing line both cars crossed
     gapDecimals / fmtGapSec / fmtGap — shared gap spelling (2 dp under ~10 s)
     energy      — the ERS store as MJ (PhysicsConsts.ES_MJ) and deploy/harvest state
     bbText      — the brake-bias chip ("BB 56%")
     blueFlag    — a car a lap up closing on the player (the AI's own letPassCase test)
     lapTrace    — the player's best lap THIS RACE as time-at-distance, for the
                   DELTA chip when there is no ghost
     speaker     — throttled position / personal-best lines for #announce-live
   DISPLAY ONLY: everything reads car state (prog, s, lapTime, energy, speed),
   never track curvature or the racing line, and nothing here writes a car. */
const HudReadouts = (function () {
  "use strict";

  /** Whole laps between two cars `dist` metres of progress apart (0 under a lap). */
  function lapsApart(dist, L) {
    if (!(L > 0) || !(dist >= L)) return 0;
    return Math.floor(dist / L);
  }

  /** "▲ BEA +1L" / short "▼ -1L" — the lapped spelling of the gap chip. `n` is
   *  SIGNED like HudRelative's: + = that car is a lap UP, - = a lap down. */
  function lapGapText(arrow, code, n, short) {
    const l = (n > 0 ? "+" : "") + n + "L";
    return short ? arrow + " " + l : arrow + " " + code + " " + l;
  }

  // GAP DECIMALS. 2026 Overtake unlocks inside ~1.0 s, so every race HUD
  // profile needs hundredths near that threshold (0.94 vs 1.04). Under ~10 s
  // the chip / REL / tower share two decimals; above that, standard and
  // minimal drop to one (same character count as "9.94" → "10.4") while
  // broadcast keeps TV-style hundredths. Lap-down spells "-1L" (lapGapText).
  // 9.995, not 9.95: two decimals hold until the value would ROUND to 10.00, so
  // 9.949 / 9.95 / 9.951 all read "9.95" and the next step is "10.0" — monotonic,
  // four characters either side (a 9.95 cut-off printed 9.95 then "9.9").
  const GAP_FINE_LT = 9.995;
  /** Decimal places for a gap of `sec` seconds on HUD profile `profile`. */
  function gapDecimals(profile, sec) {
    const p = profile || "standard";
    if (p === "broadcast") return 2;
    const a = Math.abs(+sec);
    if (Number.isFinite(a) && a < GAP_FINE_LT) return 2;
    return 1;
  }
  /** Unsigned magnitude for the gap chip: "0.94", "10.4" — no sign, no "s". */
  function fmtGapSec(sec, profile) {
    const a = Math.abs(+sec);
    if (!Number.isFinite(a)) return "--";
    return a.toFixed(gapDecimals(profile, a));
  }
  /** Signed REL/tower form: "-0.94" ahead, "+0.94" behind; "99+" past ~100 s. */
  function fmtGap(sec, ahead, profile) {
    const a = Math.abs(+sec);
    const sign = ahead ? "-" : "+";
    if (!Number.isFinite(a)) return sign + "--";
    if (a >= 99.5) return sign + "99+";
    return sign + a.toFixed(gapDecimals(profile, a));
  }

  const esMJ = () => (typeof PhysicsConsts !== "undefined" && PhysicsConsts && PhysicsConsts.ES_MJ) || 4;

  /** deploy | harvest | idle from this tick's flags and the store's movement. */
  function ersState(deploying, e, ePrev) {
    if (deploying) return "deploy";
    if (Number.isFinite(e) && Number.isFinite(ePrev) && e - ePrev > 1e-4) return "harvest";
    return "idle";
  }

  /** {text, label} for the ENERGY bar: "3.2 MJ" in the bar, words for a reader.
   *  The ▼/▲ state glyph is NOT in the text (#4270 §5): css/hud.css draws it as
   *  #hud-energy-n::before from #hud-energy[data-ers], idle keeping the slot
   *  unseen, so the label never changes width or text length (hud.js hlKey keys
   *  on that length; a changed key is a full fit). */
  function energy(e, st) {
    const mj = Math.max(0, Math.min(1, Number.isFinite(e) ? e : 0)) * esMJ();
    const n = mj.toFixed(1);
    const word = st === "deploy" ? ", deploying" : st === "harvest" ? ", harvesting" : "";
    return { text: n + " MJ", label: "Energy " + n + " megajoules" + word };
  }

  /** "BB 56%" / "BB 56.5%" from c.brakeBias (front share, 0..1; null = ref). */
  function bbText(bb, ref) {
    const v = (bb != null && Number.isFinite(bb) ? bb : (ref || 0.56)) * 100;
    const r = Math.round(v * 2) / 2;
    return "BB " + (r % 1 ? r.toFixed(1) : r.toFixed(0)) + "%";
  }

  // ONE SPD PLATE. The wheel LCD (car-mesh getWheelStatus) and the floating
  // #hud-speed (phone cockpit brings it back under 900×600) both show speed.
  // AppearanceOpts.unitLabel() spells "KM/H" for settings copy; the wheel
  // fascia uses "KPH". Showing both at once read as dual conflicting plates
  // (cockpit shots 2026-10-05: MPH on the LCD + KM/H on the float, or SPD
  // stacked on KPH). Race plates share one short unit: MPH or KPH.
  const KPH_PER_MPH = 1.609344;
  /** "mph" | "kmh" — AppearanceOpts when present, else kmh. */
  function spdUnits() {
    if (typeof AppearanceOpts !== "undefined" && AppearanceOpts && typeof AppearanceOpts.units === "function") {
      return AppearanceOpts.units() === "mph" ? "mph" : "kmh";
    }
    return "kmh";
  }
  /** Plate spelling for the wheel/cluster/HUD: "MPH" | "KPH" (never "KM/H"). */
  function spdUnit(units) {
    return (units || spdUnits()) === "mph" ? "MPH" : "KPH";
  }
  /**
   * One integer for the wheel LCD AND #hud-speed-n: dash km/h → units →
   * round → clamp 0..999. BOTH call sites must use this (or spdPlate, which
   * shares it) so a Handling-style split cannot return from duplicated
   * Math.round / AppearanceOpts.speed / clamp formulas.
   */
  function spdDigits(kph, units) {
    const u = units || spdUnits();
    const v = Number(kph);
    let n;
    if (units == null && typeof AppearanceOpts !== "undefined" && AppearanceOpts && typeof AppearanceOpts.speed === "function") {
      n = AppearanceOpts.speed(v);
    } else {
      n = Math.round((Number.isFinite(v) ? v : 0) / (u === "mph" ? KPH_PER_MPH : 1));
    }
    if (!Number.isFinite(n)) n = 0;
    // Math.max clears JS's -0 (Math.round of (−0.5, 0) → -0; `-0 < 0` is false).
    return Math.max(0, Math.min(999, n));
  }
  /**
   * One SPD readout from dash km/h: `{ n, unit }`.
   * `n` is spdDigits (same integer as the wheel LCD); `unit` is always the
   * short plate form so the float cannot disagree with the LCD. Pass `units`
   * ("mph"|"kmh") to pin without reading AppearanceOpts.
   * ONE pooled object, rewritten by the next call (the HUD paints it every frame).
   */
  const _plate = { n: 0, unit: "" };
  function spdPlate(kph, units) {
    const u = units || spdUnits();
    _plate.n = spdDigits(kph, units == null ? null : u); _plate.unit = spdUnit(u);
    return _plate;
  }

  // BLUE FLAG. The AI yields (AiDrive.letPassCase in js/game.js) to a chaser a
  // HALF LAP or more up in progress inside 9 m; the flag marshal shows it a
  // little earlier, at about a second. The test is SportingRegs.blueFlagCar's.
  const BLUE_S = 1.2;   // mirrors SportingRegs BLUE_GAP_S (exported for readers)
  const _blueOpts = { total: 0, vFloor: 0 };
  /** The car that should be let through, or null. `held` (the car flagged last tick) keeps
   *  its flag out to SportingRegs.BLUE_KEEP_S (read here, at call time: the race bundle owns it): a lapper hovering at 1.2 s blinked the chip every corner,
   *  and each flip re-ran the HUD fit twice (perf hunt 8). */
  function blueFlag(player, cars, L, vFloor, held) {
    if (typeof SportingRegs === "undefined" || !SportingRegs.blueFlagCar) return null;
    _blueOpts.total = L; _blueOpts.vFloor = vFloor || 1;
    return SportingRegs.blueFlagCar(player, cars, _blueOpts, held, SportingRegs.BLUE_KEEP_S);
  }

  // THE BEST LAP AS TIME-AT-DISTANCE. Only a time-trial ghost was recorded per
  // distance, so a race had no DELTA at all. This keeps the current lap's
  // (s, lapTime) every few metres and adopts it as the reference when the lap
  // it describes became the player's new best (c.best is set at the crossing,
  // only for a valid lap). ~1000 pairs for a 5 km lap.
  const STEP_M = 5, CAP = 4096, JUMP_M = 150;
  function lapTrace() {
    let cur = mk(), ref = null, lap = -1, best = Infinity, total = 0;
    function mk() { return { s: new Float32Array(CAP), t: new Float32Array(CAP), n: 0, ok: true }; }
    function reset() { cur = mk(); ref = null; lap = -1; best = Infinity; total = 0; }
    /** Call every frame with the player car and the lap length. */
    function sample(c, L) {
      if (!c || !(L > 0)) return;
      if (L !== total) { reset(); total = L; }
      const lp = c.lap | 0;
      if (lp !== lap) {
        // The crossing just happened: the lap the trace holds is complete.
        // c.best only moves for a valid lap, and only down.
        if (lap >= 1 && lp === lap + 1 && cur.ok && cur.n > 8 && c.best < best && c.best === c.lastLap) {
          ref = cur; cur = mk();
        } else { cur.n = 0; cur.ok = true; }
        if (Number.isFinite(c.best)) best = Math.min(best, c.best);
        lap = lp;
      }
      if (lap < 1 || !cur.ok) return;
      const s = c.s, t = c.lapTime;
      if (!(s >= 0) || !(t >= 0)) return;
      const n = cur.n;
      if (n) {
        const ds = s - cur.s[n - 1];
        if (ds < STEP_M) { if (ds < -JUMP_M) cur.ok = false; return; }   // backwards across the lap = not one lap
        if (ds > JUMP_M) { cur.ok = false; return; }                      // a teleport (rescue, jump)
      }
      if (n >= CAP) return;
      cur.s[n] = s; cur.t[n] = t; cur.n = n + 1;
    }
    /** The reference lap's time at arc `s`, or null without a reference. */
    function timeAt(s) {
      if (!ref || !(s >= 0)) return null;
      const S = ref.s, T = ref.t, n = ref.n;
      if (s > S[n - 1] + JUMP_M) return null;
      if (s <= S[0]) return S[0] > 0 ? T[0] * (s / S[0]) : T[0];
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
      if (s >= S[hi]) return T[hi] + (n > 1 ? (s - S[hi]) * (T[hi] - T[lo]) / Math.max(1e-6, S[hi] - S[lo]) : 0);
      return T[lo] + (T[hi] - T[lo]) * (s - S[lo]) / Math.max(1e-6, S[hi] - S[lo]);
    }
    return { sample, timeAt, reset, has: () => !!ref };
  }

  // THE SPOKEN HUD. #announce-live is shared with the radio card (game.js
  // showAnnounce) and the flag (hud.js sayFlag), so this yields to them: a
  // line waits until nobody else has written for FOREIGN_MS, and lines are at
  // least GAP_MS apart. A position is spoken only once it has HELD for
  // POS_HOLD_MS — a three-car scrap in a braking zone is one line, not six.
  // Track-limit strikes are NOT here: game.js already speaks them as a
  // race-control card through the same region.
  const POS_HOLD_MS = 2000, GAP_MS = 2000, FOREIGN_MS = 1500;
  function speaker(live) {
    let said = "", foreign = "", foreignT = -1e9, lastT = -1e9;
    let rank = 0, rankT = 0, rankSaid = 0, best = Infinity, queue = [];
    function reset() { rank = 0; rankT = 0; rankSaid = 0; best = Infinity; queue = []; }
    function push(key, text) {
      for (let i = 0; i < queue.length; i++) if (queue[i].key === key) { queue[i].text = text; return; }
      queue.push({ key, text });
    }
    /** HUD tick: the player's rank (0 = none), field size, best lap and its spelling. */
    function tick(now, p, fmt) {
      if (!live) return null;
      const cur = live.textContent || "";
      if (cur && cur !== said && cur !== foreign) { foreign = cur; foreignT = now; }
      if (p) {
        const r = p.rank | 0;
        if (r !== rank) { rank = r; rankT = now; if (!rankSaid) rankSaid = r; }   // the first rank is the grid slot: no news
        else if (r && r !== rankSaid && now - rankT >= POS_HOLD_MS) {
          rankSaid = r; push("pos", "Position " + r + (p.of ? " of " + p.of : ""));
        }
        if (Number.isFinite(p.best) && p.best < best) {
          // The first lap of a race is a best by definition — not worth a line.
          if (Number.isFinite(best)) push("pb", "New best lap, " + (fmt ? fmt(p.best) : p.best.toFixed(3)));
          best = p.best;
        }
      }
      if (!queue.length || now - foreignT < FOREIGN_MS || now - lastT < GAP_MS) return null;
      const line = queue.shift();
      if (line.key === "pb" && /BEST/i.test(foreign) && now - foreignT < 4000) return null;   // the engineer just said it
      said = line.text; lastT = now;
      // Through the region's one writer (js/ui/live-region.js) at HUD priority,
      // the lowest: it keeps the clear-then-write beat, and a flag or a radio
      // call in the same tick goes first instead of being overwritten.
      if (typeof LiveRegion !== "undefined") LiveRegion.say(said, "hud");
      else live.textContent = said;
      return said;
    }
    return { tick, reset };
  }

  // ONE BLINK CLOCK. Each HUD `pulse` (css/hud.css: OT armed, ERS, VSC, pit cue,
  // limits, the 0.4 s redline) began its own phase when its class landed, so two
  // warnings on screen together blinked out of step (DEFECT-LEDGER item H). Pinning
  // every pulse's startTime to the document timeline's zero puts them on one
  // clock: the 0.8 s pulses share a phase and the redline is their harmonic.
  function syncPulse(e) {
    const el = e.target;
    if (e.animationName !== "pulse" || !el || typeof el.getAnimations !== "function") return;
    for (const a of el.getAnimations()) if (a.animationName === "pulse" && a.startTime !== 0) a.startTime = 0;
  }
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") document.addEventListener("animationstart", syncPulse, true);

  function cbCuesOn() {
    return typeof A11yOpts !== "undefined" && A11yOpts.cuesOn && A11yOpts.cuesOn();
  }

  /** session | personal | slow | "" — mirrors hud.js sector colour states. */
  function sectorTimingKind(t, sessionBest, personalBest) {
    if (t == null) return "";
    if (sessionBest) return "session";
    if (personalBest) return "personal";
    return "slow";
  }

  /** yellow | vsc | sc | red | blue | "" for data-flag-cue on #hud-flag. */
  function flagCueKind(caution, blue) {
    if (blue) return "blue";
    if (!caution || !(caution.level > 0)) return "";
    if (caution.level === 4) return "red";
    if (caution.level === 3) return "sc";
    if (caution.level === 2) return "vsc";
    if (caution.level === 1) return "yellow";
    return "";
  }

  function paintSectorRow(rowEl, t, sessionBest, personalBest) {
    if (!rowEl || !rowEl.dataset) return;
    if (!cbCuesOn()) {
      if (rowEl.dataset.secTiming != null) delete rowEl.dataset.secTiming;
      return;
    }
    const k = sectorTimingKind(t, sessionBest, personalBest);
    if (k) {
      if (rowEl.dataset.secTiming !== k) rowEl.dataset.secTiming = k;
    } else if (rowEl.dataset.secTiming != null) delete rowEl.dataset.secTiming;
  }

  // The sign comes from the ROUNDED value: -0.0003 painted "-0.000" (R2-06).
  function signedFixed(v) {
    const t = v.toFixed(3);
    return +t === 0 ? "+0.000" : (v > 0 ? "+" : "") + t;
  }
  // THE GAIN, not only the split: each sector row shows the split's delta to the
  // best it was chasing for SPLIT_DELTA_MS, then the absolute time again.
  const SPLIT_DELTA_MS = 3000;
  /** GameHud's S1-S3 rows (#hud-sectors) and the race DELTA chip, moved from js/ui/hud.js (#6500).
   *  `io` hands in hud.js's write-cached setters (hText/hStyle/hData/hHidden/hToggle), its static
   *  chip nodes `rx`, the best-lap `trace` and `invalidateFit()` (a no-op until the fit exists). */
  function sectors(G, els, io) {
    const { hText, hStyle, hData, hHidden, hToggle, rx } = io;
    let rows = null, deltaShown = false;   // deltaShown: DELTA has painted a number since it last went pending
    const flash = [0, 0, 0], log = { last: -1, raceT: null, calls: 0, painted: 0 };
    // prevBest is sectorBests as the last tick saw it — game.js writes the new
    // best in the same crossing that writes sectorLast, so only the copy taken
    // BEFORE the crossing still holds the time this split was measured against.
    let prevBest = [Infinity, Infinity, Infinity], dlt = [0, 0, 0], dltT = [0, 0, 0];
    // game.js calls this at the crossing, after writing sectorLast[i] and the new
    // best — so the delta is taken against the pre-crossing copy (prevBest).
    // A first-ever split has nothing to beat and keeps the absolute time.
    function flashSector(i) {
      if (!(i >= 0 && i < 3)) return;
      flash[i] = 0.35; log.last = i; log.raceT = G.raceT ?? null; log.calls++;
      const t = G.sectorLast && G.sectorLast[i];
      const ok = t != null && isFinite(prevBest[i]);
      dlt[i] = ok ? t - prevBest[i] : 0;
      dltT[i] = ok ? SPLIT_DELTA_MS : 0;
    }
    function paintDelta(player, timeTrial) {
      const box = rx.delta;   // static in index.html (.hud-top) — no injected markup
      if (!box) return;
      const n = rx.deltaN || box;
      // Prefer a ghost reference (PB or rival). Without one, the player's own best
      // lap THIS RACE (lapTrace, sampled per frame in updateHud); with
      // neither — the opening lap of a race — nothing.
      const ghost = typeof GhostShare !== "undefined" && GhostShare.hasGuest()
        ? GhostShare
        : (typeof Ghost !== "undefined" && Ghost.hasGhost() ? Ghost : null);
      const trace = io.trace;
      const ref = ghost || (trace && trace.has() && (player.lap | 0) >= 1 ? trace : null);
      hData(box, "ref", ghost ? "ghost" : ref ? "best" : null);
      // THE SLOT IS RESERVED ON DESKTOP, NOT REMOVED: a hidden DELTA that unhid
      // after lap 1 widened the centred tower by half a box mid-race, so every
      // other readout jumped sideways. With no number yet the plate keeps its
      // place with only its value invisible (data-pending, css/hud.css), so the
      // four live boxes read centred too. ON TOUCH the pending plate leaves the
      // layout instead: its ~95px of top-band width capped the band at ~0.95 and
      // dropped the gap chip under the tower on every phone (hud-mock
      // 2026-10-14); the one re-centre at the first lap line costs less, and the
      // paint below asks for a refit the moment the number lands (the fit key
      // must not carry it: hud-fit-idempotent pins two fits as one).
      hHidden(box, false);
      // S4: before the first line crossing lapTime is the run-up clock (about 5.5 s
      // of it on a flying start), not the lap the ghost was recorded on.
      const ghostT = ref && (!ghost || (player.lap | 0) >= 1) ? ref.timeAt(player.s) : null;
      if (ghostT == null || !(player.lapTime >= 0)) {
        hData(box, "pending", "");
        if (deltaShown && !Dom.isDesktop()) io.invalidateFit();   // the touch tower just lost a box (TT restart, lap 0, lost ghost)
        deltaShown = false;
        return;
      }
      deltaShown = true;
      const wasPending = box.dataset ? box.dataset.pending != null : box.hasAttribute && box.hasAttribute("data-pending");
      hData(box, "pending", null);
      if (wasPending && !Dom.isDesktop()) io.invalidateFit();   // the touch tower just grew a box
      const deltaTxt = signedFixed(player.lapTime - ghostT);
      hText(n, deltaTxt);
      hData(box, "sign", deltaTxt[0] === "-" || +deltaTxt === 0 ? "fast" : "slow");   // the ROUNDED sign, like the text
      // Practice / TT: the gaps strip already says GHOST — keep DELTA as the
      // glanceable centre-top number. Race: same chip, quieter label stays DELTA.
      void timeTrial;
    }
    function buildRows() {
      // Sector labels carry no identity colour: .sec-lbl inherits the row's ink.
      // (S2 once wore the brand #e10600, ~4.2:1 on black at 14px — under the
      // 4.5:1 AA floor; no HUD text uses the brand red.)
      // Should they ever be coloured, they must NOT use the value palette's
      // --sec-best or --faster, or purple would mean both "sector 1" and
      // "session best". The minimap colours its arcs by sector (js/ui/hud-minimap.js:
      // the podium metals, TrackMaps.sectorColors), where identity is the only
      // thing distinguishing them.
      const labels = ["S1", "S2", "S3"];
      els.hudSectors.textContent = "";
      rows = [];
      for (let i = 0; i < 3; i++) {
        const row = document.createElement("div"); row.className = "sec-row";
        // The label keeps the row's dim ink: sector identity colours only the
        // minimap's arcs, so a label can never collide with a timing colour.
        const lbl = document.createElement("span"); lbl.className = "sec-lbl"; lbl.textContent = labels[i];
        const val = document.createElement("span"); val.className = "sec-val"; val.textContent = "--";
        row.appendChild(lbl); row.appendChild(val); els.hudSectors.appendChild(row);
        rows.push(val);
      }
    }
    function paintFlash(i, personalBest, hasSplit) {
      const row = rows[i].parentElement, active = flash[i] > 0;
      if (active) log.painted++;
      hToggle(row, "sec-flash", active);
      hToggle(row, "sec-flash-pb", active && personalBest);
      hToggle(row, "sec-flash-slow", active && !personalBest && hasSplit);
    }
    /** One painted HUD tick of the rows (top-right): cached span nodes. True when it built them. */
    function paint(tickMs) {
      const built = !rows;
      if (built) buildRows();
      // A bare split makes the driver remember last lap's to read it. The arrow
      // is the announce banner's own glyph (▼ personal best, ▲ slower) held
      // for the whole lap, and lime is the HUD's existing "faster" colour (the
      // ghost delta). sectorBests is updated in the same crossing, so a fresh
      // PB reads t == best; a first-ever lap is every sector's best, correctly.
      const bests = G.sectorBests, field = G.fieldSectorBests;
      for (let i = 0; i < 3; i++) {
        const t = G.sectorLast[i];
        const pb = t != null && bests && t <= bests[i];
        const sb = pb && field && t <= field[i];   // the FIELD's best — the timing screen's purple
        // THREE STATES, THREE GLYPHS. The arrows already carried pb-vs-slower on a
        // non-colour channel, but SESSION best and PERSONAL best both read "▼" and
        // separated only as purple vs green — which is the textbook deuteranopia
        // pair, on the one row where the distinction is the whole point.
        // ★ is the session best, ▼ a personal best, ▲ slower than your own. Same
        // single-glyph width as before, so the fixed row geometry is untouched.
        // For SPLIT_DELTA_MS after the crossing the number is the GAIN on the best
        // it was chasing ("▼-0.142", "▲+0.310"), then the split itself again: the
        // same glyph and colour states, and the same character count for any
        // split or delta under 10 s, so the row geometry does not move.
        const dHeld = dltT[i] > 0 && t != null;
        if (dltT[i] > 0) dltT[i] -= tickMs;
        // signedFixed: the sign from the ROUNDED delta (-0.0004 read "-0.000"); a split
        // of a minute or more spells m:ss.mmm like the lap clock, not "75.123".
        const num = dHeld ? signedFixed(dlt[i]) : t == null ? "" : t >= 60 && G.fmtTime ? G.fmtTime(t) : t.toFixed(3);
        hText(rows[i], t == null ? "--" : (sb ? "★" : pb ? "▼" : "▲") + num);
        prevBest[i] = bests ? bests[i] : Infinity;   // the reference the NEXT crossing's delta is taken against
        // Timing-screen colours: purple session best, green personal best,
        // yellow slower than your own best; no split yet keeps the row's ink.
        hStyle(rows[i], "color", t == null ? "" : sb ? "var(--sec-best)" : pb ? "var(--faster)" : "var(--sec-slow)");
        hData(rows[i].parentElement, "split", t == null ? null : sb ? "session" : pb ? "personal" : "slow");
        paintSectorRow(rows[i].parentElement, t, sb, pb);
        if (flash[i] > 0) flash[i] = Math.max(0, flash[i] - 0.1);
        paintFlash(i, pb, t != null);
      }
      return built;
    }
    /** An unpainted frame (HUD hidden): the held gains and flashes still run down. */
    function decay(dtMs) {
      for (let i = 0; i < 3; i++) {
        if (dltT[i] > 0) dltT[i] -= dtMs;
        if (flash[i] > 0) flash[i] = Math.max(0, flash[i] - dtMs / 1000);
      }
    }
    /** An unpainted HUD tick: take the pre-crossing best copy the painted tick would have. */
    function holdBests() { if (G.sectorBests) for (let i = 0; i < 3; i++) prevBest[i] = G.sectorBests[i]; }
    function clearFlash() {
      flash.fill(0);
      if (rows) for (let i = 0; i < rows.length; i++) paintFlash(i, false, false);
    }
    function resetDeltas() { prevBest = [Infinity, Infinity, Infinity]; dltT = [0, 0, 0]; }
    const read = () => ({ flash: flash.slice(), ...log });
    return { flashSector, paintDelta, paint, decay, holdBests, clearFlash, resetDeltas, read };
  }

  /** opt: { caution } | { blue: true } | null — only when the chip is visible. */
  function paintFlag(el, opt) {
    if (!el || !el.dataset) return;
    if (!cbCuesOn()) {
      if (el.dataset.flagCue != null) delete el.dataset.flagCue;
      return;
    }
    const k = opt && opt.blue ? "blue" : flagCueKind(opt && opt.caution, false);
    if (k) {
      if (el.dataset.flagCue !== k) el.dataset.flagCue = k;
    } else if (el.dataset.flagCue != null) delete el.dataset.flagCue;
  }

  /* THE GAP IS A TIME GAP (#5678). distance ÷ the player's own speed doubled at every brake zone for a car
     a few hundred metres up the road (PER 5.2 → 13.2 → 7.9 → 18.0 s in 40 s at Monaco). Real timing takes
     the interval at a line both cars crossed: this clock keeps each car's crossing time of LINES timing
     lines per lap (prog / step, interpolated between samples), so the gap moves only when the cars do.
     The live reading is "how long ago the car ahead was where the car behind is now".
     A ring of LINES + 4 covers a lap — beyond that the chip reads "+1L" (lapsApart). */
  const LINES = 256;
  function gapClock() {
    const N = LINES + 4, cars = new Map();
    let step = 0;
    /** Record `car` at progress `prog` (m) at race time `T` (s); lap length `L` sets the line spacing. */
    function sample(car, prog, T, L) {
      if (!(L > 0) || !Number.isFinite(prog) || !Number.isFinite(T)) return;
      if (L / LINES !== step) { step = L / LINES; cars.clear(); }
      const c = cars.get(car);
      if (!c) {
        cars.set(car, { p: prog, t: T, k: new Float64Array(N).fill(NaN), at: new Float64Array(N) });
        return;
      }
      // A rewind or re-grid invalidates all crossings. The line keys guard every timestamp read.
      if (prog < c.p - 1 || T < c.t) {
        c.k.fill(NaN); c.p = prog; c.t = T;
        return;
      }
      for (let i = Math.floor(c.p / step) + 1, e = Math.floor(prog / step); i <= e; i++) {
        const j = ((i % N) + N) % N;
        c.k[j] = i; c.at[j] = c.t + (T - c.t) * (i * step - c.p) / (prog - c.p);
      }
      c.p = prog; c.t = T;
    }
    const at = (car, i) => { const c = cars.get(car), j = ((i % N) + N) % N; return c && c.k[j] === i ? c.at[j] : NaN; };
    /** Seconds since `front` was where `back` is now (its crossings either side, interpolated): a stopped car's gap
     *  grows with the clock. The interval at the last shared line before `front` crosses the next; else NaN.
     *  `laps`: whole laps `front` is up on `back` by race distance, so a car on another lap is read at the same
     *  TRACK point (REL's lapped rows), not a lap's worth of seconds. */
    function gap(front, back, laps) {
      const c = cars.get(back);
      if (!c || !(step > 0)) return NaN;
      const i = Math.floor(c.p / step), sh = (laps | 0) * LINES, a = at(front, i + sh), b = at(front, i + sh + 1);
      const d = b >= a ? c.t - (a + (b - a) * (c.p / step - i)) : at(back, i) - a;
      return d >= 0 ? d : NaN;
    }
    /** gap(front, back), or `fallback` while there is none (distance ÷ speed until both cars cross a line). */
    const gapOr = (front, back, fallback, laps) => { const g = gap(front, back, laps); return g >= 0 ? g : fallback; };
    return { sample, gap, gapOr, reset: () => cars.clear() };
  }

  /** THE one race clock: hud.js samples and resets it each HUD tick; the chips, RELATIVE and STRATEGY read it. */
  const gaps = gapClock();
  // GAP_FINE_LT stays module-local (gapDecimals only).
  /** One in-pit predicate (REL tyre cell, STRATEGY rival/behind): any pitState but "none" (lane, box, out). */
  function inPit(car) { return !!(car && car.pitState && car.pitState !== "none"); }
  // Wheel state measures longitudinal spin directly. In the classic model use
  // the same rear-versus-front grip limits as the rear-slide haptic.
  function pedalGrip(car, wheelModelActive) {
    if (!car) return "";
    if (car.brakeDemand > 0) return car.wheelLock > 0.25 ? "lock" : "";
    if (!(car.throttleDemand > 0)) return "";
    if (wheelModelActive) return car.wheelSpin > 0.25 ? "spin" : "";
    if (typeof TyreModel === "undefined") return "";
    const rear = car.rearUtil * TyreModel.CURVE_PEAK_X / TyreModel.CURVE_HOLD_R;
    return rear > 1 && rear > car.frontUtil ? "slip" : "";
  }
  return { inPit, pedalGrip, lapsApart, lapGapText, gapDecimals, fmtGapSec, fmtGap,
    ersState, energy, bbText, blueFlag, lapTrace, speaker, BLUE_S, gapClock, gaps,
    spdUnits, spdUnit, spdDigits, spdPlate, KPH_PER_MPH,
    sectorTimingKind, flagCueKind, paintSectorRow, paintFlag, signedFixed, sectors };
})();
Object.freeze(HudReadouts);
