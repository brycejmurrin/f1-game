/* Apex 26 — TrackMaps: offline 2D circuit outlines for the track picker.
   Builds each circuit's centreline from the game's own spline engine (no race,
   no network) and caches the normalised minimap polyline + detected corners per
   track id. */
const TrackMaps = (function () {
  "use strict";

  const cache = {};   // id -> { pts:[[x,y]...], corners:[{n,x,y}], turns } | null

  // theme accent colour for a circuit (used to tint its outline)
  const THEME = {
    green: "#5ec269",
    modern: "#39b7f0",
    desert: "#f0b429",
    street_night: "#a78bfa",
    street_day: "#fb923c"
  };
  function themeColor(def) {
    return (def && THEME[def.theme]) || "#cfd2d8";
  }

  // Build the outline + corner list once from the spline engine, then cache.
  function compute(def) {
    if (Object.prototype.hasOwnProperty.call(cache, def.id)) return cache[def.id];
    let out = null;
    try {
      const tr = Tracks.build(def);
      if (tr && tr.map && tr.map.length > 2) {
        const pts = tr.map.map(function (p) { return [p[0], p[1]]; });
        out = { pts: pts, corners: detectCorners(tr), turns: 0 };
        out.turns = out.corners.length;
      }
    } catch (e) {
      out = null;
    }
    cache[def.id] = out;
    return out;
  }

  function outline(def) {
    const c = def && compute(def);
    return c ? c.pts : null;
  }
  function corners(def) {
    const c = def && compute(def);
    return c ? c.corners : [];
  }

  // Local maxima of |curvature| above a threshold, merged when close together,
  // numbered in driving order. Each corner carries its normalised map position.
  function detectCorners(tr) {
    const n = tr.n, total = tr.total, m = tr.map.length;
    const kv = new Array(n);
    for (let k = 0; k < n; k++) kv[k] = Math.abs(Tracks.curvature(tr, (k / n) * total));
    const THRESH = 0.0075;
    const peaks = [];
    for (let k = 0; k < n; k++) {
      const a = (k - 1 + n) % n, b = (k + 1) % n;
      if (kv[k] > THRESH && kv[k] >= kv[a] && kv[k] > kv[b]) peaks.push({ k: k, v: kv[k] });
    }
    // merge peaks within ~2% of the lap, keeping the sharper one
    const gap = Math.max(2, Math.round(0.02 * n));
    const merged = [];
    peaks.sort(function (p, q) { return p.k - q.k; });
    for (let i = 0; i < peaks.length; i++) {
      const last = merged[merged.length - 1];
      if (last && peaks[i].k - last.k < gap) {
        if (peaks[i].v > last.v) merged[merged.length - 1] = peaks[i];
      } else {
        merged.push(peaks[i]);
      }
    }
    return merged.map(function (p, i) {
      const idx = Math.floor((p.k / n) * m) % m;
      const mp = tr.map[idx];
      return { n: i + 1, x: mp[0], y: mp[1] };
    });
  }

  // Draw the outline into a canvas, fit with margin, preserving aspect ratio.
  // opts: { color, casing, width, pad, start, startColor, corners, cornerColor }
  function draw(canvas, def, opts) {
    opts = opts || {};
    const g = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height, pad = opts.pad != null ? opts.pad : 14;
    g.clearRect(0, 0, W, H);
    const data = compute(def);
    if (!data || data.pts.length < 3) return false;
    const pts = data.pts;

    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0];
      if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
    }
    const spanx = (maxx - minx) || 1, spany = (maxy - miny) || 1;
    const sc = Math.min((W - 2 * pad) / spanx, (H - 2 * pad) / spany);
    const ox = (W - spanx * sc) / 2, oy = (H - spany * sc) / 2;
    function PX(x) { return ox + (x - minx) * sc; }
    function PY(y) { return oy + (y - miny) * sc; }

    const width = opts.width || 3;
    g.lineJoin = "round"; g.lineCap = "round";
    g.beginPath();
    for (let i = 0; i <= pts.length; i++) {
      const p = pts[i % pts.length];
      const x = PX(p[0]), y = PY(p[1]);
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.closePath();
    g.strokeStyle = opts.casing || "rgba(0,0,0,0.55)"; g.lineWidth = width + 2.5; g.stroke();
    g.strokeStyle = opts.color || themeColor(def); g.lineWidth = width; g.stroke();

    if (opts.start !== false) {
      const s = pts[0];
      g.fillStyle = opts.startColor || "#e10600";
      g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 1.5;
      g.beginPath(); g.arc(PX(s[0]), PY(s[1]), width + 1.5, 0, Math.PI * 2); g.fill(); g.stroke();
    }

    // numbered corner markers (large preview only)
    if (opts.corners) {
      const cs = data.corners, r = opts.cornerR || 8;
      g.font = "700 " + (opts.cornerFont || 10) + "px system-ui, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      for (let i = 0; i < cs.length; i++) {
        const x = PX(cs[i].x), y = PY(cs[i].y);
        g.fillStyle = "rgba(10,10,16,0.9)";
        g.strokeStyle = opts.cornerColor || "#fff"; g.lineWidth = 1.5;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = "#fff";
        g.fillText(String(cs[i].n), x, y + 0.5);
      }
      g.textAlign = "left";
    }
    return true;
  }

  return { outline: outline, corners: corners, themeColor: themeColor, draw: draw };
})();
