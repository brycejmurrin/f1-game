/* Apex 26 — BROADCAST (Broadcast.create(G, replay)) The TV view of a REAL RACE WATCH / HIGHLIGHTS run: a timing tower down the left (position, team colour, the real three-letter code, gap or interval at the last timing line, tyre, PIT / OUT, the fastest lap in purple, places gained since the start) and an AUTO DIRECTOR that cuts the camera the way a broadcast does — onto the car in the next pass, stop or retirement a few seconds before it happens, otherwise onto the closest battle, or the leader — and varies the shot on every cut. Pressing a follow key, cycling the camera or tapping a tower row hands the picture to the viewer for a while. js/race/real-replay.js owns the clock and the puppets; this module only watches them. */
const Broadcast = (function () {
  "use strict";

  // ── The director's rules ──────────────────────────────────────────────────
  const SHOT_MIN_S = 5;      // wall seconds: no cut sooner than this after the last
  const SHOT_MAX_S = 14;     // wall seconds: a quiet shot is changed after this
  const EVENT_LEAD_S = 6;    // race seconds: cut to an event this long before it happens
  const BATTLE_S = 1.0;      // two cars this close (seconds) are a battle
  const MANUAL_S = 20;       // wall seconds the viewer keeps the picture after taking it
  const TOWER_TICK_S = 0.25; // the tower repaints four times a second
  const DELTA_S = 6;         // a place change keeps its arrow this long (wall seconds)
  // The TV shots the director rotates through (CamModes ids; an unknown id is skipped).
  const SHOTS = ["side", "heli", "tcam", "chase", "cinematic", "low"];
  const EVENT_SHOTS = { pass: ["side", "heli", "chase"], pit: ["heli", "side"], out: ["heli", "side"], fastest: ["tcam", "chase", "side"] };
  const EVENT_RANK = { out: 4, pass: 3, fastest: 2, pit: 1 };
  // THE PICTURE-IN-PICTURE: a second car in a corner inset (the mirror's camera,
  // js/render/shared/mirror-pass.js). Held at least SHOT_MIN_S; dropped once
  // nothing has asked for it for PIP_DROP_S.
  const PIP_DROP_S = 2;
  const PIP_LABEL = { battle: "ONBOARD · ", pass: "OVERTAKE · ", pit: "PIT · ", out: "OUT · ", fastest: "FASTEST LAP · ",
                      behind: "BEHIND · ", ahead: "AHEAD · ", leader: "LEADER · " };

  // ── Timing (pure): the tower at race time T ───────────────────────────────
  /** Seconds from lights out at which driver d crossed the line for the k-th time (k >= 1), or null. */
  function crossAt(d, k) {
    const ls = d.lapStart || [], laps = d.laps || [];
    if (ls[k] != null) return ls[k];
    if (ls[k - 1] != null && laps[k - 1] > 0) return ls[k - 1] + laps[k - 1];
    return null;
  }
  /** Laps driver d had completed by T: {k, at} (at = that crossing's time; k = 0 before the first). */
  function doneBy(d, T) {
    let k = 0, at = null;
    const n = (d.laps || []).length;
    for (let j = 1; j <= n; j++) { const c = crossAt(d, j); if (c == null || c > T) break; k = j; at = c; }
    return { k, at };
  }
  function compoundAt(d, lap) {
    let c = null;
    for (const st of d.stints || []) if (st.from <= lap) c = st.c;
    return c ? String(c)[0] : null;
  }
  function inPit(d, T) {
    const t = d.pitT || [], dur = d.pitDur || [];
    for (let i = 0; i < t.length; i++) if (t[i] != null && T >= t[i] - 12 && T <= t[i] + (dur[i] > 0 ? dur[i] : 22) + 6) return true;
    return false;
  }
  /** The tower rows at race time T. `out(num)` says a car is parked (its data ended). Ordered as the timing
   *  shows it: most laps first, then who crossed the last line first; the stopped cars last, the latest out first. */
  function towerAt(script, T, out) {
    const drivers = (script.drivers || []).filter((d) => !d.dns);
    const lead = [], stopped = [];
    for (const d of drivers) {
      const { k, at } = doneBy(d, T);
      const gone = out ? out(d.num) : (d.dnf && d.outT != null && T >= d.outT);
      (gone ? stopped : lead).push({ d, k, at });
    }
    // Before the first crossing the grid is the order.
    lead.sort((a, b) => (b.k - a.k) || (a.k ? a.at - b.at : (a.d.grid || 99) - (b.d.grid || 99)));
    stopped.sort((a, b) => (b.k - a.k) || ((b.at || 0) - (a.at || 0)));
    const L = lead[0];
    const fast = script.fastest && script.fastest.t != null && T >= script.fastest.t ? script.fastest.num : null;
    const rows = [];
    lead.forEach((r, i) => {
      let gap = null, interval = null, down = 0;
      if (i && r.k && L.k) {
        // Laps down: the leader's crossings that came before this car's last one.
        for (let j = r.k + 1; j <= L.k; j++) { const c = crossAt(L.d, j); if (c != null && c <= r.at) down++; }
        if (!down) { const lc = crossAt(L.d, r.k); if (lc != null) gap = r.at - lc; }
        const A = lead[i - 1];
        if (!down && A.k >= r.k) { const ac = crossAt(A.d, r.k); if (ac != null) interval = r.at - ac; }
      }
      rows.push({ pos: i + 1, num: r.d.num, code: r.d.code, lap: r.k, gap, interval, down,
                  tyre: compoundAt(r.d, Math.max(1, r.k + 1)), pit: inPit(r.d, T), out: false, fastest: fast === r.d.num, grid: r.d.grid || null });
    });
    stopped.forEach((r, i) => rows.push({ pos: lead.length + i + 1, num: r.d.num, code: r.d.code, lap: r.k, gap: null, interval: null, down: 0,
                                          tyre: null, pit: false, out: true, fastest: fast === r.d.num, grid: r.d.grid || null }));
    return rows;
  }
  function fmtGap(r, mode) {
    if (r.out) return "OUT";
    if (r.pit) return "PIT";
    if (r.pos === 1) return mode === "interval" ? "INTERVAL" : "LEADER";
    if (r.down) return "+" + r.down + " LAP" + (r.down > 1 ? "S" : "");
    const v = mode === "interval" ? r.interval : r.gap;
    return v == null ? "" : "+" + v.toFixed(1);
  }

  // ── The director (pure): who to show, and how ─────────────────────────────
  /** The next event worth a cut: kind in EVENT_RANK, with a car `ok(num)` accepts (running), within `lead`
   *  race seconds ahead of T, not already shown. The highest rank in the window wins. */
  function nextEvent(list, T, shown, lead, ok) {
    let best = null;
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      if (h.t < T) continue;
      if (h.t > T + lead) break;
      if (shown.has(i) || h.num == null || !EVENT_RANK[h.kind] || (ok && !ok(h.num))) continue;
      if (!best || EVENT_RANK[h.kind] > EVENT_RANK[best.h.kind]) best = { i, h };
    }
    return best;
  }
  // Pooled fight rows: Director + ExtraRigs + WATCH PiP call battles() every
  // cut/tick; a fresh array + objects each time was steady-state GC in a race.
  const _fights = [];
  /** The closest battle among running cars ordered by progress: [{chaser, gapS}] best first — tighter and
   *  further up the order is better. cars: [{key, prog, speed, pos}] sorted by prog descending.
   *  Returns a module-owned pooled array (mutated on the next call). */
  function battles(cars) {
    let n = 0;
    for (let i = 1; i < cars.length; i++) {
      const a = cars[i - 1], b = cars[i];
      const v = Math.max(b.speed || 0, 20);
      const g = (a.prog - b.prog) / v;
      if (g < 0 || g >= BATTLE_S) continue;
      let f = _fights[n];
      if (!f) { f = { key: null, ahead: null, gapS: 0, score: 0 }; _fights[n] = f; }
      f.key = b.key; f.ahead = a.key; f.gapS = g; f.score = g + i * 0.08;
      n++;
    }
    _fights.length = n;
    _fights.sort((x, y) => x.score - y.score);
    return _fights;
  }
  /** The PiP's car (pure): the followed car's battle partner — the car BEHIND when
   *  it is sandwiched, the threat — on an onboard shot; else the car in the next
   *  event; else (with `running`, [{key}] by progress) the car right behind the
   *  followed one, or ahead of it, or the leader — so a WATCH always has an
   *  inset. Never the followed car. fights: battles(); evKey/evKind: the event's
   *  car (its OTHER car when the director is already on the first) and kind. */
  function pipPick(fights, followKey, evKey, evKind, running) {
    let behind = null, ahead = null;
    for (const f of fights) {
      if (f.ahead === followKey && behind == null) behind = f.key;
      if (f.key === followKey && ahead == null) ahead = f.ahead;
    }
    const partner = behind != null ? behind : ahead;
    if (partner != null && partner !== followKey) return { key: partner, cam: "tcam", kind: "battle" };
    if (evKey != null && evKey !== followKey) return { key: evKey, cam: "chase", kind: evKind || "pass" };
    if (running && running.length > 1) {
      const i = running.findIndex((r) => r.key === followKey);
      if (i < 0) return { key: running[0].key, cam: "chase", kind: "leader" };
      if (running[i + 1]) return { key: running[i + 1].key, cam: "tcam", kind: "behind" };
      if (running[i - 1]) return { key: running[i - 1].key, cam: "chase", kind: "ahead" };
    }
    return null;
  }

  /** The shot for a cut: from the kind's list when it has one, never the shot on air. */
  function shotFor(kind, onAir, n) {
    const pool = (EVENT_SHOTS[kind] || SHOTS).filter((s) => s !== onAir);
    return pool.length ? pool[(n | 0) % pool.length] : onAir;
  }

  // ── The live module ───────────────────────────────────────────────────────
  function create(G, replay) {
    let on = false, auto = false, locked = false, tower = null, rowsEl = [], head = null, listEl = null;
    let wall = 0, lastCut = -1e9, manualUntil = 0, cuts = 0, onAirShot = null, setCam = null;
    let shown = new Set(), towerT = 0, mode = "gap", prevPos = new Map(), deltaAt = new Map();
    let clickBound = null;
    let pip = null;   // {key, label, at (wall), seen (wall)} — the car in the inset

    function modeIdx(id) {
      const modes = typeof CamModes !== "undefined" ? CamModes.CAM_MODES : [];
      return modes.findIndex((m) => m.id === id);
    }
    function camTo(id) {
      const i = modeIdx(id);
      if (i < 0 || !G.setCamMode) return false;
      G.setCamMode(i, { persist: false });
      onAirShot = id; setCam = i;
      return true;
    }

    /** start({auto, tower}) — replay has already posed the field and chosen whom to follow. */
    function start(o) {
      stop();
      on = true; auto = !!(o && o.auto); locked = false; wall = 0; lastCut = -1e9; manualUntil = 0; cuts = 0;
      shown = new Set(); towerT = 0; mode = "gap"; prevPos = new Map(); deltaAt = new Map();
      onAirShot = null; setCam = G.camMode;
      if (auto) { camTo(SHOTS[0]); lastCut = 0; }
      buildTower(o && o.tower !== false);
      Log.info("game", "Broadcast.start auto=" + auto + " tower=" + !!tower);
    }
    function stop() {
      if (!on) return;
      on = false;
      setPip(null);
      if (tower) {
        if (clickBound) tower.removeEventListener("click", clickBound);
        tower.hidden = true; tower.textContent = "";
      }
      clickBound = null; tower = null; rowsEl = []; head = null; listEl = null;
      try { document.body.classList.remove("bc-on"); } catch (e) { /* no document: a VM */ }
    }

    /** The viewer took the picture (a follow key, the camera button, a tower row): the director waits. */
    function manual() { if (on) { manualUntil = wall + MANUAL_S; setCam = G.camMode; } }   // the shot on air is now the viewer's baseline
    // Back to the director: it cuts at once, and the shot on air now is its
    // baseline — not a "viewer change" that would hand the picture back for 20 s.
    function setAuto(v) { auto = !!v; if (auto) { locked = false; manualUntil = 0; lastCut = -1e9; setCam = G.camMode; } return auto; }
    function setLocked(v) { locked = !!v; if (locked) { manualUntil = 0; setCam = G.camMode; } return locked; }
    function resetTiming() { shown.clear(); prevPos.clear(); deltaAt.clear(); towerT = 0; lastCut = -1e9; setPip(null); }
    /** The director has the picture: AUTO and not waiting out a viewer's choice. */
    function autoOn() { return on && auto && !locked && wall >= manualUntil; }

    function buildTower(want) {
      const el = typeof document !== "undefined" ? document.getElementById("bc-tower") : null;
      if (!el || !want) return;
      tower = el; tower.textContent = "";
      head = document.createElement("button"); head.type = "button"; head.className = "bc-head";
      head.setAttribute("aria-label", "Timing tower: show intervals between drivers");
      tower.appendChild(head);
      listEl = document.createElement("ol"); listEl.className = "bc-rows";
      tower.appendChild(listEl);
      rowsEl = [];
      clickBound = (e) => {
        const t = e.target && e.target.closest ? e.target.closest("[data-code]") : null;
        if (t && t.dataset.code) { manual(); if (replay.follow) replay.follow(t.dataset.code); return; }
        if (e.target && e.target.closest && e.target.closest(".bc-head")) {
          mode = mode === "gap" ? "interval" : "gap"; towerT = 0;
          head.setAttribute("aria-label", mode === "gap" ? "Timing tower: show intervals between drivers" : "Timing tower: show gaps to leader");
        }
      };
      tower.addEventListener("click", clickBound);
      tower.hidden = false;
      document.body.classList.add("bc-on");
    }
    function rowEl(i) {
      if (rowsEl[i]) return rowsEl[i];
      const li = document.createElement("li");
      li.className = "bc-row";
      const b = document.createElement("button"); b.type = "button";
      const part = (cls) => { const sp = document.createElement("span"); sp.className = cls; b.appendChild(sp); return sp; };
      const e = { li, b, pos: part("bc-pos"), team: part("bc-team"), code: part("bc-code"), gap: part("bc-gap"), tyre: part("bc-tyre"), key: "" };
      e.team.setAttribute("aria-hidden", "true");
      li.appendChild(b);
      listEl.appendChild(li);
      return (rowsEl[i] = e);
    }
    function paintTower(st) {
      if (!tower) return;
      const rows = towerAt(st.script, st.T, st.isOut);
      const L = rows.find((r) => !r.out);
      const total = st.script.laps | 0;
      head.textContent = "LAP " + Math.min(total, Math.max(1, ((L && L.lap) | 0) + 1)) + "/" + total + (mode === "interval" ? " · INTERVAL" : " · GAP");
      const followNum = st.followNum;
      rows.forEach((r, i) => {
        const e = rowEl(i);
        const was = prevPos.get(r.num);
        if (was != null && was !== r.pos) deltaAt.set(r.num, { at: wall, up: r.pos < was });
        prevPos.set(r.num, r.pos);
        const dl = deltaAt.get(r.num);
        const delta = dl && wall - dl.at < DELTA_S ? (dl.up ? "up" : "down") : "";
        const key = [r.pos, r.code, fmtGap(r, mode), r.tyre, r.out, r.pit, r.fastest, delta, r.num === followNum].join("|");
        if (key === e.key) return;
        e.key = key;
        e.pos.textContent = String(r.pos);
        e.code.textContent = r.code || "#" + r.num;
        e.gap.textContent = fmtGap(r, mode);
        e.tyre.textContent = r.tyre || "";
        e.tyre.dataset.c = r.tyre || "";
        e.b.dataset.code = r.code || "";
        const col = st.colourOf ? st.colourOf(r.num) : "";
        e.team.style.background = col || "";
        e.li.classList.toggle("out", r.out);
        e.li.classList.toggle("pit", r.pit);
        e.li.classList.toggle("fl", r.fastest);
        e.li.classList.toggle("on", r.num === followNum);
        if (delta) e.li.dataset.delta = delta; else delete e.li.dataset.delta;
        e.b.setAttribute("aria-label", "P" + r.pos + " " + (r.code || r.num) + " " + fmtGap(r, mode) + (r.num === followNum ? ", on camera" : ""));
      });
      for (let i = rows.length; i < rowsEl.length; i++) rowsEl[i].li.hidden = true;
      for (let i = 0; i < rows.length; i++) rowsEl[i].li.hidden = false;
    }

    function direct(st) {
      if (!auto || locked || wall < manualUntil) return;
      // The viewer cycled the camera (C / the CAM button): theirs for a while.
      if (setCam != null && G.camMode !== setCam) { setCam = G.camMode; onAirShot = null; manual(); return; }
      if (st.reel) return;   // HIGHLIGHTS: the reel picks the car and calls onCut
      const age = wall - lastCut;
      if (age < SHOT_MIN_S) return;
      const ev = nextEvent(st.list, st.T, shown, EVENT_LEAD_S * Math.max(1, st.speed), (num) => !st.isOut(num));
      if (ev) { shown.add(ev.i); cut(st.carOf(ev.h.num), ev.h.kind, st.T); return; }
      if (age < SHOT_MAX_S) return;
      const running = st.running();
      const fight = battles(running)[0];
      const next = fight ? fight.key : running.length ? running[cuts % Math.min(3, running.length)].key : null;
      cut(next, fight ? "pass" : null, st.T);
    }
    function cut(c, kind, T) {
      lastCut = wall; cuts++;
      camTo(shotFor(kind, onAirShot, cuts));
      if (c && replay.setFollow) replay.setFollow(c);
      else if (G.snapGameCam) G.snapGameCam();
      Log.debug("game", "Broadcast.cut T=" + (+T).toFixed(1) + " kind=" + (kind || "-") + " shot=" + onAirShot + " car=" + (c ? c.code : "-"));
    }

    /** The reel cut to a new highlight (RealReplay.cutTo): a new shot for it, unless the viewer has the picture. */
    function onCut(kind) {
      if (!on || !auto || locked || wall < manualUntil) return;
      if (setCam != null && G.camMode !== setCam) { setCam = G.camMode; onAirShot = null; manual(); return; }
      lastCut = wall; cuts++;
      camTo(shotFor(kind, onAirShot, cuts));
    }

    /** Every frame from RealReplay.tick: dt wall seconds; st = {script, T, speed, list, reel, followNum,
     *  isOut(num), carOf(num), colourOf(num), running() -> [{key, prog, speed}] by progress}. */
    function pipLabelEl() {
      const e = typeof document !== "undefined" ? document.getElementById("bc-pip") : null;
      return e && e.querySelector ? e.querySelector(".bc-pip-label") : null;
    }
    function setPip(p) {
      pip = p;
      if (G.setPip) G.setPip(p ? p.key : null, p ? p.cam : null);
      const l = pipLabelEl();
      if (l) l.textContent = p ? p.label : "";
    }
    // Four times a second, with the tower: who belongs in the inset now.
    function pipTick(st) {
      const follow = st.follow;
      const running = st.running();
      const ev = nextEvent(st.list, st.T, new Set(), EVENT_LEAD_S * Math.max(1, st.speed), (num) => !st.isOut(num));
      let evCar = ev ? st.carOf(ev.h.num) : null;
      // The director is already on the event's car: the inset takes the other one
      // (the car being passed).
      if (evCar && evCar === follow && ev.h.over != null) evCar = st.carOf(ev.h.over);
      const pick = pipPick(battles(running), follow, evCar, ev && ev.h.kind, running);
      if (pip && (pip.key === follow || pip.key.retired)) { setPip(null); }   // the viewer followed it, or it stopped
      if (!pick) { if (pip && wall - pip.seen > PIP_DROP_S) setPip(null); return; }
      const label = (PIP_LABEL[pick.kind] || "") + ((st.codeOf && st.codeOf(pick.key)) || pick.key.code || "");
      if (pip && pip.key === pick.key) {
        pip.seen = wall;
        if (pip.label !== label) { pip.label = label; const l = pipLabelEl(); if (l) l.textContent = label; }   // same car, new role
        return;
      }
      if (pip && wall - pip.at < SHOT_MIN_S) return;   // hold the shot on air
      setPip({ key: pick.key, cam: pick.cam, label, at: wall, seen: wall });
    }

    function tick(dt, st) {
      if (!on || !st) return;
      wall += dt;
      direct(st);
      towerT -= dt;
      if (towerT <= 0) { towerT = TOWER_TICK_S; paintTower(st); pipTick(st); }
    }
    function refresh(st) { if (on && st) { paintTower(st); pipTick(st); } }
    function status() { return on ? { auto, locked, manual: wall < manualUntil, manualRemaining: Math.max(0, manualUntil - wall), shot: onAirShot, cuts, tower: !!tower, rows: rowsEl.length, mode,
                                      pip: pip ? { code: pip.key.code || null, label: pip.label } : null } : null; }

    return { start, stop, tick, refresh, onCut, manual, setAuto, setLocked, resetTiming, autoOn, status, isOn: () => on };
  }

  return { create, towerAt, crossAt, doneBy, battles, nextEvent, pipPick, shotFor, fmtGap, SHOTS, SHOT_MIN_S, SHOT_MAX_S, MANUAL_S };
})();
Object.freeze(Broadcast);
