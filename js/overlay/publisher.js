const OverlayPublisher = (function () {
  "use strict";

  const TICK_MS = 250;
  const BATTLE_S = 1.0;
  let latest = 0;

  function css(rgb) {
    return Array.isArray(rgb) && rgb.length >= 3
      ? "rgb(" + rgb.slice(0, 3).map((v) => Math.round(Math.max(0, Math.min(1, +v || 0)) * 255)).join(",") + ")" : "";
  }
  function teamColour(teamId, teams) {
    const t = Array.isArray(teams) ? teams.find((x) => x && x.id === teamId) : null;
    return t ? css(t.color) : "";
  }

  function battleOf(rows) {
    let best = null, score = Infinity;
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      if (!a || !b || a.retired || b.retired || a.inPit || b.inPit) continue;
      const g = b.intervalS;
      if (!Number.isFinite(g) || g < 0 || g >= BATTLE_S) continue;
      const sc = g + i * 0.08;
      if (sc < score) { score = sc; best = { ahead: String(a.code || a.id || "—"), behind: String(b.code || b.id || "—"), gapS: +g.toFixed(3) }; }
    }
    return best;
  }

  function input(src) {
    const field = src.field && Array.isArray(src.field.positions) ? src.field : null;
    const info = src.info || {};
    const sec = src.sectors || null;
    const ranked = field ? field.positions.map((r) => ({
      pos: r.pos, code: r.code, team: teamColour(r.team, src.teams),
      intervalS: r.pos === 1 ? null : r.intervalS, gapToLeaderS: r.pos === 1 ? null : r.gapToLeaderS,
      isPlayer: r.isPlayer, pit: !!r.inPit, out: !!r.retired,
    })) : [];
    return {
      seq: src.seq | 0, t: field ? field.t : 0,
      state: info.state || (field && field.raceState) || "idle",
      track: info.track || null,
      lap: field && field.player ? field.player.lap : 0,
      laps: (field && field.lapsTarget) || info.lapsTarget || 0,
      ranked,
      battle: field ? battleOf(field.positions) : null,
      sectorLast: sec && sec.last, sectorBests: sec && sec.bests, fieldSectorBests: sec && sec.fieldBest,
      caption: src.caption || null,
    };
  }

  function tapCaptions(doc, onCaption, Observer) {
    const box = doc && doc.getElementById && doc.getElementById("announce");
    const Obs = Observer || (typeof MutationObserver === "function" ? MutationObserver : null);
    if (!box || !Obs) return null;
    const part = (id) => { const el = doc.getElementById(id); return el ? String(el.textContent || "").trim() : ""; };
    let n = 0, last = "";
    const read = () => {
      const shown = !box.hidden && !box.classList.contains("hidden") && (part("announce-text") || part("announce-who"));
      if (!shown) { if (last) { last = ""; onCaption(null); } return; }
      const c = { n: part("announce-num") || null, who: part("announce-who"), text: part("announce-text"), kind: box.dataset.kind || "" };
      const key = [c.n, c.who, c.text, c.kind].join("|");
      if (key === last) return;
      last = key;
      onCaption(Object.assign(c, { id: "a" + ++n }));
    };
    const obs = new Obs(read);
    obs.observe(box, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden", "class", "data-kind"] });
    read();
    return { read, disconnect: () => obs.disconnect() };
  }

  function start(deps) {
    const timers = deps.timers || { setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (id) => clearInterval(id) };
    const differ = OverlayFeed.createDiffer();
    let seq = 0, caption = null;
    const tap = tapCaptions(deps.document, (c) => { caption = c; });
    function tick() {
      const apex = deps.apex();
      if (!apex) return null;
      let field = null, info = null, sectors = null;
      try { field = apex.field(); } catch (_) {  }
      try { info = apex.info(); } catch (_) {  }
      try { sectors = apex.sectorState(); } catch (_) {  }
      if (field && field.ok === false) field = null;
      if (typeof deps.bridge.peers === "function") deps.bridge.peers();
      if (deps.bridge.takeFresh()) differ.reset();
      latest = ++seq;
      const frame = OverlayFeed.frame(input({ seq, field, info, sectors, caption, teams: deps.teams }));
      const patch = differ.next(frame, Date.now());
      if (patch) deps.bridge.send(patch);
      return patch;
    }
    const timer = timers.setInterval(tick, TICK_MS);
    return {
      tick,
      stop() { timers.clearInterval(timer); if (tap) tap.disconnect(); },
    };
  }

  function boot() {
    if (typeof document === "undefined" || !document.getElementById("announce") || typeof OverlayBridge === "undefined") return null;
    let pub = null;
    const bridge = OverlayBridge.host({
      onPeers(n) {
        if (n > 0 && !pub) {
          const ready = window.__apex ? Promise.resolve()
            : typeof GameMetrics !== "undefined" && GameMetrics.agentLoader && GameMetrics.agentLoader()
              ? Promise.resolve(GameMetrics.agentLoader()()) : Promise.resolve();
          ready.then(() => {
            if (pub || bridge.peers() === 0) return;
            Log.info("ui", "overlay listener connected: publishing");
            pub = start({ bridge, apex: () => window.__apex || null, document,
              teams: typeof Teams !== "undefined" ? Teams.LIST : [] });
          }, () => Log.warn("ui", "overlay: the agent surface did not load"));
        } else if (n === 0 && pub) {
          pub.stop(); pub = null;
          Log.info("ui", "overlay listeners gone: stopped publishing");
        }
      },
    });
    return bridge;
  }

  return Object.freeze({ TICK_MS, BATTLE_S, lastSeq: () => latest, css, battleOf, input, tapCaptions, start, boot });
})();
Object.freeze(OverlayPublisher);
if (typeof document !== "undefined" && !document.querySelector('main#overlay[role="region"]')) OverlayPublisher.boot();
