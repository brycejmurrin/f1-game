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
   frame re-spawns one additive glow particle per panel (Particles.glow, life
   0.05 s), capped to the NEAREST_N posts to the eye so a safety car on a
   52-post circuit never floods the 256-particle pool. Posts come from the
   scenery registry (track.props.list, kind "marshalPost"); a post's sector
   follows race control's convention (the circuit's authored splits or thirds). Race control is
   read through G.cautionLevel (allocation-free, every frame) and
   G.cautionInfo (the sector; polled at 4 Hz under a local yellow only).
   Read by js/game.js: MarshalPanels.create(G).update(dt) each frame before
   Particles.update. */
const MarshalPanels = (function () {
  "use strict";
  const LIFE = 0.05;        // s: outlives one frame, three alive per panel at most
  const NEAREST_N = 16;     // panels lit per frame (16 × 3 = 48 of the 256 pool)
  const GREEN_S = 4;        // s of green after a caution clears
  const INFO_EVERY = 0.25;  // s between cautionInfo() reads under a local yellow
  const COL = { yellow: [1.0, 0.78, 0.08], red: [1.0, 0.12, 0.06], green: [0.15, 1.0, 0.25] };

  function create(G, deps) {
    const P = (deps && deps.Particles) || (typeof Particles !== "undefined" ? Particles : null);
    const _postsBy = new WeakMap();   // per track object, weakly: never pins a dropped world
    let _t = 0, _prevLevel = 0, _greenT = 0, _sector = -1, _infoT = -1;

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
    function showing(dt) {
      const lvl = G.cautionLevel ? G.cautionLevel() : 0;
      if (lvl === 0 && _prevLevel > 0) _greenT = GREEN_S;
      _prevLevel = lvl;
      if (lvl === 0) {
        if (!(_greenT > 0)) return null;
        _greenT -= dt;
        return { col: COL.green, flash: 1, sector: -1 };
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
      return { col: lvl === 4 ? COL.red : COL.yellow, flash, sector };
    }

    function update(dt) {
      _t += dt > 0 ? dt : 0;
      if (!P || !P.glow) return;
      const show = showing(dt > 0 ? dt : 0);
      if (!show || G.state !== "race") return;
      const posts = postsFor(G.track);
      if (!posts) return;
      const eye = (G.frame && G.frame.eye) || null;
      let lit = posts;
      if (show.sector >= 0) lit = lit.filter((p) => p.sector === show.sector);
      if (eye && lit.length > NEAREST_N) {
        lit = lit.slice().sort((a, b) =>
          ((a.x - eye[0]) ** 2 + (a.z - eye[2]) ** 2) - ((b.x - eye[0]) ** 2 + (b.z - eye[2]) ** 2)).slice(0, NEAREST_N);
      }
      const c = show.col, a = 0.9 * show.flash;
      for (const p of lit) P.glow(p.x, p.y, p.z, 0.45, c[0], c[1], c[2], a, LIFE);
    }

    return { update, postsFor, showing };
  }

  return { create };
})();
Object.freeze(MarshalPanels);
