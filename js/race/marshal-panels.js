var MarshalPanels = (function () {
  "use strict";
  const GAIN = 1.14;
  const NEAREST_N = 16;
  const GREEN_S = 4;
  const INFO_EVERY = 0.25;
  const COL = { yellow: [1.0, 0.78, 0.08], red: [1.0, 0.12, 0.06], green: [0.15, 1.0, 0.25] };

  function create(G, deps) {
    const P = (deps && deps.Particles) || (typeof Particles !== "undefined" ? Particles : null);
    const _postsBy = new WeakMap();
    let _t = 0, _prevLevel = 0, _greenT = 0, _sector = -1, _infoT = -1;
    const _show = { col: null, flash: 1, sector: -1 };
    const _selD = new Float64Array(NEAREST_N), _selI = new Int32Array(NEAREST_N);

    function postsFor(track) {
      if (!track) return null;
      if (_postsBy.has(track)) return _postsBy.get(track);
      const list = track.props && track.props.list;
      if (!list || !(track.n > 2)) return null;
      const sec = track.def && track.def.sectors;
      const splits = (sec && sec.length === 2) ? [sec[0], sec[1]] : [1 / 3, 2 / 3];
      const posts = [];
      for (const r of list) {
        if (r.kind !== "marshalPost" || !(r.k >= 0)) continue;
        const frac = r.k / track.n;
        const sector = frac < splits[0] ? 0 : frac < splits[1] ? 1 : 2;
        const pp = r.panel;
        posts.push(pp ? { x: pp[0], y: pp[1], z: pp[2], sector }
                      : { x: r.x, y: r.y + r.h / 2 + 0.45, z: r.z, sector });
      }
      const out = posts.length ? posts : null;
      _postsBy.set(track, out);
      return out;
    }

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
      const flash = waved ? (Math.sin(_t * Math.PI * 4) > 0 ? 1 : 0.25) : 1;
      _show.col = lvl === 4 ? COL.red : COL.yellow; _show.flash = flash; _show.sector = sector;
      return _show;
    }

    function update(dt) {
      _t += dt > 0 ? dt : 0;
      if (!P || !P.flare) return;
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
      if (!eye || lit <= NEAREST_N) {
        for (let i = 0; i < posts.length; i++) {
          const p = posts[i];
          if (sec < 0 || p.sector === sec) P.flare(p.x, p.y, p.z, 0.45, r, g, b, a, true);
        }
        return;
      }
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
