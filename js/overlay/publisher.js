/* Apex 26 — OverlayPublisher: the game page's half of the stream overlay.
   Samples window.__apex (field, info, sectorState) at 4 Hz on a timer, never in the
   frame loop, and taps #announce with a MutationObserver for captions. Read-only:
   no car writes, no physics reads, and it runs only while an overlay is listening
   (OverlayBridge.host). js/game.js does not know it exists. */
const OverlayPublisher = (function () {
  "use strict";

  const TICK_MS = 250;

  function css(rgb) {
    return Array.isArray(rgb) && rgb.length >= 3
      ? "rgb(" + rgb.slice(0, 3).map((v) => Math.round(Math.max(0, Math.min(1, +v || 0)) * 255)).join(",") + ")" : "";
  }
  function teamColour(teamId, teams) {
    const t = Array.isArray(teams) ? teams.find((x) => x && x.id === teamId) : null;
    return t ? css(t.color) : "";
  }

  // One OverlayFeed.frame input from the __apex reads. Pure: every source is passed in.
  function input(src) {
    const field = src.field && Array.isArray(src.field.positions) ? src.field : null;
    const info = src.info || {};
    const sec = src.sectors || null;
    const ranked = field ? field.positions.map((r) => ({
      pos: r.pos, code: r.code, team: teamColour(r.team, src.teams),
      intervalS: r.pos === 1 ? null : r.intervalS, gapToLeaderS: r.pos === 1 ? null : r.gapToLeaderS,
      isPlayer: r.isPlayer, pit: !!r.retired,
    })) : [];
    return {
      seq: src.seq | 0, t: field ? field.t : 0,
      state: info.state || (field && field.raceState) || "idle",
      track: info.track || null,
      lap: field && field.player ? field.player.lap : 0,
      laps: (field && field.lapsTarget) || info.lapsTarget || 0,
      ranked,
      sectorLast: sec && sec.last, sectorBests: sec && sec.bests, fieldSectorBests: sec && sec.fieldBest,
      caption: src.caption || null,
    };
  }

  // THE CAPTION TAP. showAnnounce fills #announce-num / -who / -text and
  // dataset.kind; every visible change is a new caption id, a hidden card is null.
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

  // Publish while a bridge reports listeners. deps: { bridge, apex(), document,
  // teams, timers }. Returns { tick, stop } (tick is exposed for tests).
  function start(deps) {
    const timers = deps.timers || { setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (id) => clearInterval(id) };
    const differ = OverlayFeed.createDiffer();
    let seq = 0, caption = null;
    const tap = tapCaptions(deps.document, (c) => { caption = c; });
    function tick() {
      const apex = deps.apex();
      if (!apex) return null;
      let field = null, info = null, sectors = null;
      try { field = apex.field(); } catch (_) { /* not ready: no track */ }
      try { info = apex.info(); } catch (_) { /* not ready */ }
      try { sectors = apex.sectorState(); } catch (_) { /* not ready */ }
      if (field && field.ok === false) field = null;
      // Expire silent peers: report() otherwise runs only on an incoming message, so a crashed overlay tab kept this loop alive.
      if (typeof deps.bridge.peers === "function") deps.bridge.peers();
      if (deps.bridge.takeFresh()) differ.reset();
      const frame = OverlayFeed.frame(input({ seq: ++seq, field, info, sectors, caption, teams: deps.teams }));
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

  // GAME PAGE BOOT: listen for overlays; on the first one, make sure __apex is
  // loaded (GameMetrics holds game.js's memoised loader) and publish; stop at none.
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

  return Object.freeze({ TICK_MS, css, input, tapCaptions, start, boot });
})();
Object.freeze(OverlayPublisher);
if (typeof document !== "undefined" && !document.querySelector('main#overlay[role="region"]')) OverlayPublisher.boot();
