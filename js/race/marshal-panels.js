/* Apex 26 — marshal light panels. Every marshal post carries an FIA-style
   light panel that shows what race control is showing: a waved (2 Hz) yellow
   at the posts of the sector under a local yellow, a steady yellow at every
   post under VSC or the safety car, a waved red under a red flag, and a green
   at every post for a few seconds when a caution clears. Until 2026-10-01 the
   post flags were coloured at build by a hash and never changed (the second
   graphics-detail survey, item 4) — and until 2026-10-04 that waving hash flag
   still stood on every post beside these panels, yellow on ~72 % of them. The
   post now carries a dark panel board (`panel` on its registry record) and
   the glow lights exactly that board.

   Built like js/race/start-lights.js: no geometry and no uniform — each lit
   frame issues one additive ONE-FRAME disc per panel (Particles.flare, from
   the flare budget's lamp reserve), capped to the NEAREST_N posts to the eye.
   Until 2026-10-04 each panel was a pooled particle of life 0.05 s re-spawned
   every frame: the brightness scaled with the refresh rate (0.38× at 30 Hz,
   1.14× at 60, 3.5× at 144) and at 120 Hz the panels held 96 slots, the whole
   mobile pool, through every SC/VSC. GAIN keeps the 60 Hz look at every rate.
   Posts come from the scenery registry (track.props.list, kind "marshalPost"); a post's sector
   follows race control's convention (the circuit's authored splits or thirds). Race control is
   read through G.cautionLevel (allocation-free, every frame) and
   G.cautionInfo (the sector; polled at 4 Hz under a local yellow only).
   Read by js/game.js: MarshalPanels.create(G).update(dt) each frame before
   Particles.draw. */
var MarshalPanels = (function () {
  "use strict";
  const GAIN = 1.14;        // the pooled glow's additive sum at 60 Hz (life 0.05 s), now one disc
  const NEAREST_N = 16;     // panels lit per frame — inside Particles' LAMP_RESERVE with the start lights' 5
  const GREEN_S = 4;        // s of green after a caution clears
  const INFO_EVERY = 0.25;  // s between cautionInfo() reads under a local yellow
  const COL = { yellow: [1.0, 0.78, 0.08], red: [1.0, 0.12, 0.06], green: [0.15, 1.0, 0.25] };

  function create(G, deps) {
    const P = (deps && deps.Particles) || (typeof Particles !== "undefined" ? Particles : null);
    const _postsBy = new WeakMap();   // per track object, weakly: never pins a dropped world
    let _t = 0, _prevLevel = 0, _greenT = 0, _sector = -1, _infoT = -1;
    // Pooled (perf hunt 2 F7): the answer showing() hands back, and the nearest-N
    // selection's distances and post indices. A caution ran a filter, a copy, a
    // full sort with a closure and a slice over every post, every frame.
    const _show = { col: null, flash: 1, sector: -1 };
    const _selD = new Float64Array(NEAREST_N), _selI = new Int32Array(NEAREST_N);

    // Every marshal post's panel position and sector, or null; memoised per track.
    function postsFor(track) {
      if (!track) return null;
      if (_postsBy.has(track)) return _postsBy.get(track);
      _postsBy.set(track, null);
      const list = track.props && track.props.list;
      if (!list || !(track.n > 2)) return null;
      // Race control's sector convention (js/physics/debris-world.js hazards()):
      // the circuit's authored splits (def.sectors, two lap fractions) or thirds.
      const sec = track.def && track.def.sectors;
      const splits = (sec && sec.length === 2) ? [sec[0], sec[1]] : [1 / 3, 2 / 3];
      const posts = [];
      for (const r of list) {
        if (r.kind !== "marshalPost" || !(r.k >= 0)) continue;
        const frac = r.k / track.n;
        const sector = frac < splits[0] ? 0 : frac < splits[1] ? 1 : 2;
        // The post's own dark panel (`panel`, js/track/scenery/structures.js
        // marshalPost) lights up; a record without one glows above the roof
        // (the registry's y is the hut's centre, h tall).
        const pp = r.panel;
        posts.push(pp ? { x: pp[0], y: pp[1], z: pp[2], sector }
                      : { x: r.x, y: r.y + r.h / 2 + 0.45, z: r.z, sector });
      }
      const out = posts.length ? posts : null;
      _postsBy.set(track, out);
      return out;
    }

    // What the panels show this frame: { col, flash, sector } or null for dark.
    // ONE pooled object, rewritten by the next call: read it before calling again.
    function showing(dt) {
      const lvl = G.cautionLevel ? G.cautionLevel() : 0;
      if (lvl === 0 && _prevLevel > 0) _greenT = GREEN_S;
      _prevLevel = lvl;
      if (lvl === 0) {
        if (!(_greenT > 0)) return null;
        _greenT -= dt;
        _show.col = COL.green; _show.flash = 1; _show.sector = -1;
        return _show;
      }
      let sector = -1;
      if (lvl === 1) {
        if (_infoT < 0 || _t - _infoT >= INFO_EVERY) {
          const info = G.cautionInfo ? G.cautionInfo() : null;
          _sector = info && info.sector != null ? info.sector : -1;
          _infoT = _t;
        }
        sector = _sector;
      } else {
        _infoT = -1;
      }
      const waved = lvl === 1 || lvl === 4;
      const flash = waved ? (Math.sin(_t * Math.PI * 4) > 0 ? 1 : 0.25) : 1;   // 2 Hz
      _show.col = lvl === 4 ? COL.red : COL.yellow; _show.flash = flash; _show.sector = sector;
      return _show;
    }

    function update(dt) {
      _t += dt > 0 ? dt : 0;
      if (!P || !P.flare) return;
      // showing() arms the 4 s green on the level->0 edge and spends it as it draws, so it runs in the
      // race only: a red-flag restart reads level 0 on the 'count' grid, where the green would be spent
      // unseen. Between sessions (menu/results) the edge state resets so a quit under a caution cannot
      // hand the next race a stale green.
      if (G.state !== "race") { if (G.state !== "count") { _prevLevel = 0; _greenT = 0; } return; }
      const show = showing(dt > 0 ? dt : 0);
      if (!show) return;
      const posts = postsFor(G.track);
      if (!posts) return;
      const eye = (G.frame && G.frame.eye) || null;
      const sec = show.sector, c = show.col, a = 0.9 * show.flash;
      const r = c[0] * GAIN, g = c[1] * GAIN, b = c[2] * GAIN;
      let lit = 0;
      for (let i = 0; i < posts.length; i++) if (sec < 0 || posts[i].sector === sec) lit++;
      // Every post fits (or there is no eye to rank from): all of them, in registry order.
      if (!eye || lit <= NEAREST_N) {
        for (let i = 0; i < posts.length; i++) {
          const p = posts[i];
          if (sec < 0 || p.sector === sec) P.flare(p.x, p.y, p.z, 0.45, r, g, b, a, true);
        }
        return;
      }
      // The NEAREST_N to the eye, nearest first: an insertion select over the
      // candidates in registry order that places a tie AFTER its equals, so the
      // panels and their order are exactly what the stable sort + slice gave.
      let n = 0;
      for (let i = 0; i < posts.length; i++) {
        const p = posts[i];
        if (sec >= 0 && p.sector !== sec) continue;
        const d = (p.x - eye[0]) ** 2 + (p.z - eye[2]) ** 2;
        if (n === NEAREST_N && !(d < _selD[n - 1])) continue;
        let j = n < NEAREST_N ? n++ : n - 1;
        while (j > 0 && _selD[j - 1] > d) { _selD[j] = _selD[j - 1]; _selI[j] = _selI[j - 1]; j--; }
        _selD[j] = d; _selI[j] = i;
      }
      for (let k = 0; k < n; k++) { const p = posts[_selI[k]]; P.flare(p.x, p.y, p.z, 0.45, r, g, b, a, true); }
    }

    return { update, postsFor, showing };
  }

  return { create };
})();
Object.freeze(MarshalPanels);
