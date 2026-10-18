/* Apex 26 — HUD MINIMAP: the in-race track map on #minimap (js/ui/hud.js's
   GameHud owns the tick and calls draw()). Moved out of hud.js whole (#1656):
   the outline is pre-rendered once into an offscreen canvas and blitted every
   HUD tick, then the car dots, the ghost, the pit marker and the player disc
   are drawn over it. Display only; nothing here is read back by the game. */
const HudMinimap = (function () {
  "use strict";

/** G = game.js's façade; deps = hud.js helpers it shares: vpW, vpH, teamCss,
 *  replayGhost, motionReduced and fitKey (a getter: hud.js's live fit key). */
function create(G, deps) {
const { vpW, vpH, teamCss, replayGhost, motionReduced } = deps;
const els = G.els;
const mm = els.minimap.getContext("2d");
let minimapBg = null;         // offscreen canvas with pre-rendered track shape
let minimapBgKey = "";        // cssW|cssH|ratio it was rendered for — NOT the
                              // derived (W,H): 140css@2x and 280css@1x share a
                              // bitmap size but need different path transforms
let _mmKey = null, _mmCssW = 140, _mmCssH = 140, _mmRatio = 1;  // measure cache
let _mmBgKey = "140|140|1";   // cssW|cssH|ratio of that cache, rebuilt only when it re-measures
let _mmPitP = null, _mmYou = "#aeea00";   // the "P"'s local px + map node, and the resolved --you; set with the bg

function drawMinimap() {
  const player = G.player, cars = G.cars, track = G.track, timeTrial = G.timeTrial;
  if (!player || !track || !track.map) return;
  // hud-hide-map is display:none (cockpit/onboard cams, MINIMAL, map OFF): a
  // map nobody can see was sized, cached, blitted and dotted every HUD tick.
  // Forget its measurement key so the next visible draw measures afresh.
  if (document.body.classList.contains("hud-hidden") || document.body.classList.contains("hud-hide-map")) { _mmKey = null; return; }
  // Logical space = the element's LOCAL CSS box (clientWidth is pre-zoom px,
  // the same convention js/ui/sheet-shape.js relies on). Bitmap = local x effective
  // zoom x DPR so one drawn pixel is one physical pixel — mirroring the menu
  // track preview (js/ui/select-screen.js), which solved this exact blur first.
  // currentCSSZoom, not the raw --hud-scale: the element rides the CAPPED
  // --hud-z, and the raw slider would over-allocate on a capped band. Ratio
  // capped at 3 to bound fill/memory on a DPR-3 phone at HUD SIZE 200%.
  // The fit key includes changing gap spelling/sector rows. Those cannot
  // resize this explicit CSS box unless fitHud changes the band's scale, so
  // keep a separate layout-free key rather than measuring after HUD writes.
  // Density selects the 96/140px CSS box; DPR can change without a resize.
  // Keep the bounded retry while the fit has no laid-out box, and the track
  // invalidation path (minimapBg null) so a newly visible map measures afresh.
  const root = document.documentElement, body = document.body;
  const measureKey = vpW() + "x" + vpH() + "|" + body.className
    + "|" + (body.dataset.density || "") + "|" + root.style.getPropertyValue("--hud-scale")
    + "|" + root.style.getPropertyValue("--hud-z-top") + "|" + (window.devicePixelRatio || 1)
    + "|" + els.minimap.style.getPropertyValue("--hl-s");   // MOVE & SIZE (js/ui/hud-layout.js)
  if (_mmKey !== measureKey || deps.fitKey() === "" || !minimapBg) {
    _mmKey = measureKey;
    _mmCssW = els.minimap.clientWidth || 140;
    _mmCssH = els.minimap.clientHeight || 140;
    _mmRatio = Math.min(3, Math.max(1,
      (els.minimap.currentCSSZoom || 1) * (window.devicePixelRatio || 1)
      * (parseFloat(els.minimap.style.getPropertyValue("--hl-s")) || 1)));
    _mmBgKey = _mmCssW + "|" + _mmCssH + "|" + _mmRatio;
  }
  const cssW = _mmCssW, cssH = _mmCssH, ratio = _mmRatio;
  const W = Math.round(cssW * ratio), H = Math.round(cssH * ratio);
  // Every CSS tier gives #minimap an explicit width/height, so the attribute
  // change never moves the layout box (fitHud reads the same numbers).
  if (els.minimap.width !== W || els.minimap.height !== H) {
    els.minimap.width = W; els.minimap.height = H;
  }
  // pre-render the static track outline once; reuse as a cheap blit every HUD frame
  const bgKey = _mmBgKey;   // no string built per HUD tick
  if (!minimapBg || minimapBgKey !== bgKey) {
    minimapBgKey = bgKey;
    minimapBg = document.createElement("canvas");
    minimapBg.width = W; minimapBg.height = H;
    const mc = minimapBg.getContext("2d");
    // Path math below stays in the local px it was tuned in; the transform
    // carries it to physical px.
    mc.setTransform(ratio, 0, 0, ratio, 0, 0);
    const map = track.map, n = map.length;
    mc.lineWidth = 2; mc.lineJoin = "round"; mc.lineCap = "round";
    // SECTOR IDENTITY: the podium metals in rank order (S1 gold, S2 silver,
    // S3 bronze), from css/tokens.css via TrackMaps.sectorColors — the CIRCUIT
    // DETAIL diagram draws the same three, so the menu and the map agree. It
    // was purple / red / lime: purple is the timing screen's SESSION BEST
    // (--sec-best) and red against lime is the red-green colour-blind pair.
    // The metals separate on lightness and chroma, which every colour-vision
    // type keeps, and none is the AERO blue, the ghost cyan or --you. The
    // HUD's S1/S2/S3 labels carry no colour (buildSecRows), so this is the
    // only place sector identity is a colour at all. 0.8 alpha, as before.
    const SC = TrackMaps.sectorColors();
    mc.globalAlpha = 0.8;
    // Same def.sectors splits as TrackMaps.draw / sectorAt (thirds if missing).
    const sec = track.def && track.def.sectors;
    const splits = (sec && sec.length === 2) ? [0, sec[0], sec[1], 1] : [0, 1 / 3, 2 / 3, 1];
    for (let s = 0; s < 3; s++) {
      const from = Math.floor(splits[s] * n);
      const to = s === 2 ? n - 1 : Math.max(from, Math.floor(splits[s + 1] * n));
      mc.strokeStyle = SC[s];
      mc.beginPath();
      for (let i = from; i <= to; i++) {
        const p = map[i % n];
        const x = 8 + p[0] * (cssW - 16), y = 8 + p[1] * (cssH - 16);
        i === from ? mc.moveTo(x, y) : mc.lineTo(x, y);
      }
      if (s === 2) {
        const p0 = map[0];
        mc.lineTo(8 + p0[0] * (cssW - 16), 8 + p0[1] * (cssH - 16));
      }
      mc.stroke();
    }
    mc.globalAlpha = 1;
    // Activation-zone highlight, slightly thicker, in the AERO chip's own blue
    // (#hud-aero.ax-armed / #btn-aero.armed), so the map and the chip name the
    // zone in one colour.
    const zones = TrackMaps.drsZones(track.def);
    if (zones && zones.length) {
      mc.strokeStyle = "rgba(38,165,245,0.9)"; mc.lineWidth = 3;
      for (const z of zones) {
        // z.b > 1 for a zone across the line: walk on past n and wrap.
        const from2 = Math.floor(z.a * n), to2 = Math.floor(z.b * n);
        mc.beginPath();
        for (let i = from2; i <= to2; i++) {
          const p = map[i % n];
          mc.lineTo(8 + p[0] * (cssW - 16), 8 + p[1] * (cssH - 16));
        }
        mc.stroke();
      }
    }
    // THE PIT LANE: a light dashed run from where the entry road peels off
    // to where the exit road rejoins, a "P" where it PEELS OFF and a tick
    // across the run at the entry line. The "P" marks the peel-off, not the
    // line 70 m past it, where a driver steering at it is already on the road
    // the boards named 100 m earlier.
    const pit = track.pit;
    _mmPitP = null;
    if (pit && pit.entryRoadM != null) {
      const L = track.total, fOf = (s) => (((s % L) + L) % L) / L;
      const fa = fOf(pit.sA), fb = fOf(pit.sB);
      const i0 = Math.floor(fa * n), steps = Math.max(2, Math.round((((fb - fa) % 1) + 1) % 1 * n));
      mc.strokeStyle = "rgba(236,236,246,0.85)"; mc.lineWidth = 3; mc.setLineDash([3, 3]);
      mmRun(mc, map, n, i0, steps, cssW, cssH);
      mc.stroke(); mc.setLineDash([]);
      // The entry line: a tick across the run, normal to the lane there.
      const il = Math.floor(fOf(pit.sIn) * n) % n, pe = map[il], pn = map[(il + 1) % n];
      const ex = 8 + pe[0] * (cssW - 16), ey = 8 + pe[1] * (cssH - 16);
      let tx = (pn[0] - pe[0]) * (cssW - 16), ty = (pn[1] - pe[1]) * (cssH - 16);
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      mc.strokeStyle = "rgba(255,255,255,0.95)"; mc.lineWidth = 2;
      mc.beginPath(); mc.moveTo(ex - ty * 4, ey + tx * 4); mc.lineTo(ex + ty * 4, ey - tx * 4); mc.stroke();
      const pa = map[i0 % n];
      _mmPitP = [8 + pa[0] * (cssW - 16), 8 + pa[1] * (cssH - 16), i0 % n];
      mmPitMark(mc, _mmPitP[0], _mmPitP[1], 5, "rgba(255,255,255,0.95)");
      // The map's own "--you" (the token the cue and the tyre chip carry the
      // stop in), read once per rebuild: a resolved colour is not a hot read.
      _mmYou = (typeof getComputedStyle === "function"
        && getComputedStyle(document.documentElement).getPropertyValue("--you").trim()) || "#aeea00";
    }
  }
  // Canvas resize resets 2D context state, so the transform is set every
  // draw, not once. The blit destination is in local px: under the ratio
  // transform the W-physical-px cache lands on cssW·ratio physical px — a 1:1
  // copy when that product is whole, and a sub-pixel resample of the rounding
  // remainder when it is not. Either way one cheap blit per HUD frame.
  mm.setTransform(ratio, 0, 0, ratio, 0, 0);
  mm.clearRect(0, 0, cssW, cssH);
  mm.drawImage(minimapBg, 0, 0, cssW, cssH);
  const map = track.map, n = map.length;
  // THE NaN AMPLIFIER. `Math.floor(NaN) % n` is NaN, `map[NaN]` is undefined,
  // and `p[0]` then throws — so ANY car whose `s` goes non-finite turns a
  // silent physics NaN into a hard TypeError here. It is the only consumer of a
  // bad `s` that throws; every other one (Tracks.sample and friends) degrades
  // quietly. A negative `s` is the same trap: JS `%` keeps the sign.
  //
  // The throw lands AFTER render() in tickBody, so the world keeps moving and
  // only the HUD freezes; js/perf/loop-health.js then swallows it, and because
  // this path is throttled to ~10 Hz it never trips the 8-consecutive-fault
  // rail — it grinds to the 240 lifetime cap and paints the error overlay
  // ~24 s later at 60 fps. "HUD froze, then it died half a minute afterwards"
  // is the signature, and it is a miserable one to trace back to a NaN.
  const at = (v) => {
    const i = Math.floor(v / track.total * n) % n;
    return Number.isFinite(i) ? map[(i + n) % n] : null;
  };
  for (const c of cars) {
    if (c === player) continue;
    const p = at(c.s);
    if (!p) continue;
    const x = 6 + p[0] * (cssW - 16), y = 6 + p[1] * (cssH - 16);
    mm.fillStyle = teamCss(c);   // keyed on store.rev: a livery edit repaints the dot
    if (c.human && !c.local) {
      mm.fillRect(x - 1, y - 1, 6, 6);
      // A white ring, because the team colour is the one thing it cannot use to
      // stand out — the car it must be told apart from may share it.
      mm.strokeStyle = "#fff";
      mm.lineWidth = 1;
      mm.strokeRect(x - 1.5, y - 1.5, 7, 7);
    } else {
      mm.fillRect(x, y, 4, 4);
    }
  }
  // ghost replay marker (time trial): shared rival first, otherwise your PB
  const ghost = replayGhost();
  if (timeTrial && (player.lap | 0) >= 1 && (GhostShare.hasGuest() || Ghost.hasGhost())) {   // S4
    const gh = ghost.at(player.lapTime);
    if (gh) {
      const gp = at(gh.s);   // a persisted ghost is stored input: never trust its s
      // Skip only the GHOST dot on a bad s — returning here would take the
      // player's own white marker (drawn below) down with it for the session.
      if (gp) {
        mm.fillStyle = "rgba(120, 220, 255, 0.95)";
        mm.beginPath();
        mm.arc(8 + gp[0] * (cssW - 16), 8 + gp[1] * (cssH - 16), 3.4, 0, 7);
        mm.fill();
      }
    }
  }
  const p = at(player.s);
  if (!p) return;
  // THE PIT MARKER CARRIES STATE. The static "P" is the map's "there are pits";
  // over it, from the same three facts the cue reads (PitLane.worthStopping —
  // ONE gate, so the map and the words can never disagree): a stop worth
  // making grows it and gives it --you, an armed stop pulses it, and from
  // CUE_M in an arc from the car to the peel-off says HOW FAR, the way the
  // cue's metres do. The lane and the box turn the player's own disc --you.
  const pits = G.pits, inPit = !!player.pitState && player.pitState !== "none";
  if (_mmPitP && pits && pits.worthStopping && !inPit && pits.worthStopping(player)) {
    const d = pits.toEntry(player), ip = Math.floor(player.s / track.total * n) % n;
    if (d > 0 && d < pits.cueM && Number.isFinite(ip)) {
      mm.strokeStyle = _mmYou; mm.lineWidth = 2;
      mmRun(mm, map, n, (ip + n) % n, ((_mmPitP[2] - ip) % n + n) % n, cssW, cssH);
      mm.stroke();
    }
    if (player.pitArmed && !motionReduced()) mm.globalAlpha = 0.55 + 0.45 * Math.sin(performance.now() / 160);
    mmPitMark(mm, _mmPitP[0], _mmPitP[1], 7, _mmYou);
    mm.globalAlpha = 1;
  }
  mm.fillStyle = inPit ? _mmYou : "#fff";
  mm.beginPath();
  mm.arc(8 + p[0] * (cssW - 16), 8 + p[1] * (cssH - 16), 4, 0, 7);
  mm.fill();
}

/** A polyline along `steps` map nodes forward from node `i0`, in the map's
 *  local px; the caller strokes it (the lane run and the distance arc). */
function mmRun(ctx, map, n, i0, steps, cssW, cssH) {
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const p = map[(i0 + i) % n];
    const x = 8 + p[0] * (cssW - 16), y = 8 + p[1] * (cssH - 16);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
}
/** The "P" disc at the peel-off, radius `r` in local px. Rendered once per
 *  (radius, fill, ratio) into a small canvas and blitted: a per-frame `font`
 *  set + `fillText` was 980 ms of a 30 s window (TLX-PERF-HUNT-5 F1). */
const _mmPitGlyph = new Map();
function mmPitMark(ctx, x, y, r, fill) {
  const key = r + "|" + fill + "|" + _mmRatio;
  let g = _mmPitGlyph.get(key);
  if (g === undefined) {
    if (_mmPitGlyph.size > 8) _mmPitGlyph.clear();   // fill is --you: a theme change is a new key
    g = null;
    const cw = Math.ceil((2 * r + 2) * _mmRatio), cv = document.createElement("canvas");
    cv.width = cw; cv.height = cw;
    const gc = cv.getContext && cv.getContext("2d");
    if (gc) {
      const L = cw / _mmRatio, c = L / 2;
      gc.setTransform(_mmRatio, 0, 0, _mmRatio, 0, 0);
      gc.fillStyle = fill; gc.beginPath(); gc.arc(c, c, r, 0, Math.PI * 2); gc.fill();
      gc.fillStyle = "#14161c"; gc.font = "700 " + (r + 2) + "px system-ui, sans-serif";
      gc.textAlign = "center"; gc.textBaseline = "middle";
      gc.fillText("P", c, c + 0.5);
      g = { cv, L };
    }
    _mmPitGlyph.set(key, g);
  }
  if (g) { ctx.drawImage(g.cv, x - g.L / 2, y - g.L / 2, g.L, g.L); return; }
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#14161c"; ctx.font = "700 " + (r + 2) + "px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("P", x, y + 0.5);
}

return {
  draw: drawMinimap,
  // GameHud.invalidateMap (loadTrack) drops the outline so it re-renders for the new circuit.
  invalidate() { minimapBg = null; },
};
}

return { create };
})();
