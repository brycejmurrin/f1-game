/* Apex 26 — broadcast-profile lower thirds, battle bar and fastest-lap banner.
   Reads G.ranked only; shares OverlayFeed's v1 battle/gap frame. */
const TvGraphics = (function () {
  "use strict";

  const TICK_S = .25;
  const LOWER_S = 5;

  function codeOf(c) { return String(c && (c.code || c.id || c.num) || "—"); }
  function snapshot(ranked) {
    return (ranked || []).map((c, i) => ({ code: codeOf(c), pos: Number.isFinite(c.pos) ? c.pos : i + 1,
      fastest: !!(c.fastest || c.fastestLap) }));
  }
  function diff(previous, ranked) {
    const next = snapshot(ranked), old = new Map();
    for (const row of previous || []) old.set(row.code, row.pos);
    let lower = null, fastest = null;
    for (const row of next) {
      const from = old.get(row.code);
      if (from != null && row.pos < from && (!lower || row.pos < lower.to)) {
        const over = (previous || []).find((r) => r.pos === row.pos);
        lower = { code: row.code, from, to: row.pos, over: over ? over.code : "" };
      }
      const was = (previous || []).find((r) => r.code === row.code);
      if (row.fastest && (!was || !was.fastest)) fastest = { code: row.code };
    }
    return { snapshot: next, lower, fastest };
  }

  function addStyle(doc) {
    if (doc.querySelector && doc.querySelector("#tvg-style")) return;
    const style = doc.createElement("style");
    style.id = "tvg-style";
    style.textContent = [
      "#tvg{position:fixed;inset:0;z-index:24;pointer-events:none;color:#fff;font:800 13px/1.15 system-ui,sans-serif;letter-spacing:.08em}",
      "#tvg [hidden]{display:none!important}.tvg-battle{position:absolute;top:8%;left:50%;translate:-50% 0;padding:9px 14px;border-top:4px solid #e10600;background:rgba(7,8,13,.9);font-variant-numeric:tabular-nums}",
      "#tvg-lower{position:absolute;left:7%;bottom:18%;min-width:260px;padding:13px 18px;border-left:5px solid #e10600;background:rgba(7,8,13,.93);font-size:16px}",
      "#tvg-lower::before{content:'OVERTAKE';display:block;margin-bottom:4px;color:#b7bac5;font-size:10px;letter-spacing:.18em}",
      "#tvg-fastest{position:absolute;right:6%;bottom:18%;padding:12px 16px;border-left:5px solid #b94cff;background:rgba(7,8,13,.93);color:#e29cff}",
    ].join("");
    doc.head.appendChild(style);
  }

  function create(G, parent) {
    const doc = typeof document !== "undefined" ? document : null;
    if (!doc) return { tick() {}, stop() {}, reset() {}, status: () => null, element: () => null };
    addStyle(doc);
    const host = doc.createElement("section");
    host.id = "tvg";
    host.setAttribute("role", "region");
    host.setAttribute("aria-label", "Broadcast race graphics");
    const lower = doc.createElement("div"); lower.id = "tvg-lower"; lower.hidden = true;
    const battle = doc.createElement("div"); battle.className = "tvg-battle"; battle.hidden = true;
    const fastest = doc.createElement("div"); fastest.id = "tvg-fastest"; fastest.hidden = true;
    host.append(lower, battle, fastest);
    (parent || doc.body).appendChild(host);

    let previous = null, wait = 0, seq = 0, lowerFor = 0, fastestCode = "";
    function reset() {
      previous = null; wait = 0; lowerFor = 0; fastestCode = "";
      lower.hidden = battle.hidden = fastest.hidden = true;
    }
    function tick(dt, force) {
      const on = G && G.hudProfile === "broadcast" && (G.state === "race" || G.state === "count");
      host.hidden = !on;
      if (!on) { reset(); return null; }
      wait -= Number.isFinite(dt) ? dt : 0;
      lowerFor = Math.max(0, lowerFor - (Number.isFinite(dt) ? dt : 0));
      if (lowerFor <= 0) lower.hidden = true;
      if (!force && wait > 0) return null;
      wait = TICK_S;
      const ranked = Array.isArray(G.ranked) ? G.ranked : [];
      const frame = OverlayFeed.frame({
        seq: ++seq, t: Number(G.raceT) || 0, state: G.state, track: G.track && G.track.id,
        lap: G.lap || G.player && G.player.lap, laps: G.laps || G.lapsTarget,
        flag: G.flag, ranked, sectorLast: G.sectorLast, sectorBests: G.sectorBests,
        fieldSectorBests: G.fieldSectorBests,
        vScale: G.vTop && typeof PhysicsConsts !== "undefined" ? G.vTop() / PhysicsConsts.VMAX : 1,
      });
      const change = diff(previous, ranked);
      previous = change.snapshot;
      if (change.lower) {
        lower.textContent = change.lower.code + "  P" + change.lower.from + " → P" + change.lower.to
          + (change.lower.over ? "  ·  PASSED " + change.lower.over : "");
        lower.hidden = false; lowerFor = LOWER_S;
      }
      battle.hidden = !frame.battle;
      battle.textContent = frame.battle
        ? "BATTLE  " + frame.battle.ahead + "  ·  " + frame.battle.behind + "   " + frame.battle.gapS.toFixed(2) + "s"
        : "";
      if (change.fastest) fastestCode = change.fastest.code;
      fastest.hidden = !fastestCode;
      fastest.textContent = fastestCode ? "FASTEST LAP  ·  " + fastestCode : "";
      return { frame, lower: change.lower, fastest: change.fastest };
    }
    function stop() { reset(); host.remove(); }
    function status() { return { on: !host.hidden, lower: !lower.hidden, battle: !battle.hidden, fastest: !fastest.hidden }; }
    return { tick, stop, reset, status, element: () => host };
  }

  return { TICK_S, LOWER_S, snapshot, diff, create };
})();
Object.freeze(TvGraphics);
