/* Apex 26 — TrackMaps: offline 2D circuit outlines for the track picker.
   Builds each circuit's centreline from the game's own spline engine (no race,
   no network) and caches the normalised minimap polyline + detected corners per
   track id. */
const TrackMaps = (function () {
  "use strict";

  const cache = {};   // id -> { pts, py, corners, turns, dir, elevRange, drsZones } | null

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

  // F1 sector colours (S1 = purple, S2 = red, S3 = yellow-green)
  const SECTOR_COLORS = ["#c084fc", "#e10600", "#a3e635"];

  // Build the outline + corner list once from the spline engine, then cache.
  function compute(def) {
    if (Object.prototype.hasOwnProperty.call(cache, def.id)) return cache[def.id];
    let out = null;
    try {
      // Centreline-only build: the minimap needs the spline (positions, tangents,
      // curvature, elevation) but NOT the 3D road/terrain/props meshes or any GPU
      // upload. Using the full build here meant the select screen ran 24 complete
      // 3D circuit builds on first open (~16 s stall).
      const tr = Tracks.buildCenterline(def);
      if (tr && tr.map && tr.map.length > 2) {
        const pts = tr.map.map(function (p) { return [p[0], p[1]]; });
        const crns = detectCorners(tr);
        const dir = circuitDirection(tr);
        const elevRange = elevationRange(tr);
        const drsZones = detectDRS(tr);
        out = { pts: pts, py: tr.py, corners: crns, turns: crns.length, dir: dir, elevRange: elevRange, drsZones: drsZones };
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
  function direction(def) {
    const c = def && compute(def);
    return c ? c.dir : null;
  }
  function elevationRange(tr) {
    const py = tr.py;
    if (!py || !py.length) return 0;
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < py.length; i++) {
      if (py[i] < mn) mn = py[i];
      if (py[i] > mx) mx = py[i];
    }
    return Math.round(mx - mn);
  }
  function drsZones(def) {
    const c = def && compute(def);
    return c ? c.drsZones : [];
  }
  function elevRange(def) {
    const c = def && compute(def);
    return c ? c.elevRange : 0;
  }
  function elevProfile(def) {
    const c = def && compute(def);
    return c ? c.py : null;
  }

  // Circuit direction as it READS on the rendered (north-up) minimap, which is
  // the ground truth the player sees. Validated against real OpenF1 lap telemetry
  // for all circuits: positive signed area of (px, pz) renders/drives CLOCKWISE,
  // negative renders ANTI-CLOCKWISE. (The earlier mapping was inverted, so the
  // selector preview labelled every clockwise circuit "Anti-clockwise".)
  function circuitDirection(tr) {
    const px = tr.px, pz = tr.pz, n = tr.n;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += px[i] * pz[j] - px[j] * pz[i];
    }
    return area > 0 ? "CW" : "CCW";
  }

  // Detect DRS-eligible zones: long runs of very low curvature (straights).
  // Returns array of { a, b } fractional indices into map pts (0..1).
  function detectDRS(tr) {
    const n = tr.n, total = tr.total;
    const MIN_FRAC = 0.04;   // minimum 4% of lap = ~200m on a 5km circuit
    const KV_THRESH = 0.003; // straighter than this qualifies
    // sample curvature at each spline node
    const kv = new Array(n);
    for (let k = 0; k < n; k++) kv[k] = Math.abs(Tracks.curvature(tr, (k / n) * total));
    // find runs of low curvature
    const zones = [];
    let runStart = -1;
    for (let k = 0; k <= n; k++) {
      const ki = k % n;
      const straight = kv[ki] < KV_THRESH;
      if (straight && runStart < 0) { runStart = k; }
      else if (!straight && runStart >= 0) {
        const frac = (k - runStart) / n;
        if (frac >= MIN_FRAC) zones.push({ a: runStart / n, b: k / n });
        runStart = -1;
      }
    }
    return zones;
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
      return { n: i + 1, x: mp[0], y: mp[1], v: p.v };
    });
  }

  // Draw the outline into a canvas, fit with margin, preserving aspect ratio.
  // opts: { color, casing, width, pad, start, startColor, corners, cornerColor,
  //         sectors, drs }
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

    // helper: stroke a sub-range of pts (inclusive indices, wrapping)
    function strokeRange(from, to, color) {
      g.strokeStyle = opts.casing || "rgba(0,0,0,0.55)";
      g.lineWidth = width + 2.5;
      g.beginPath();
      const count = ((to - from + pts.length) % pts.length) + 1;
      for (let di = 0; di <= count; di++) {
        const p = pts[(from + di) % pts.length];
        di === 0 ? g.moveTo(PX(p[0]), PY(p[1])) : g.lineTo(PX(p[0]), PY(p[1]));
      }
      g.stroke();
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      for (let di = 0; di <= count; di++) {
        const p = pts[(from + di) % pts.length];
        di === 0 ? g.moveTo(PX(p[0]), PY(p[1])) : g.lineTo(PX(p[0]), PY(p[1]));
      }
      g.stroke();
    }

    if (opts.sectors) {
      // Draw the full casing first so sectors don't have gaps in the outline
      g.strokeStyle = opts.casing || "rgba(0,0,0,0.55)";
      g.lineWidth = width + 2.5;
      g.beginPath();
      for (let i = 0; i <= pts.length; i++) {
        const p = pts[i % pts.length];
        i === 0 ? g.moveTo(PX(p[0]), PY(p[1])) : g.lineTo(PX(p[0]), PY(p[1]));
      }
      g.closePath();
      g.stroke();
      // Draw three coloured sectors on top
      const m = pts.length;
      for (let s = 0; s < 3; s++) {
        const from = Math.floor((s / 3) * m);
        const to = s === 2 ? m - 1 : Math.floor(((s + 1) / 3) * m);
        g.strokeStyle = SECTOR_COLORS[s];
        g.lineWidth = width;
        g.beginPath();
        for (let i = from; i <= to; i++) {
          const p = pts[i];
          i === from ? g.moveTo(PX(p[0]), PY(p[1])) : g.lineTo(PX(p[0]), PY(p[1]));
        }
        // close S3 back to start
        if (s === 2) {
          const p0 = pts[0];
          g.lineTo(PX(p0[0]), PY(p0[1]));
        }
        g.stroke();
      }
    } else {
      // Single-color outline
      g.beginPath();
      for (let i = 0; i <= pts.length; i++) {
        const p = pts[i % pts.length];
        i === 0 ? g.moveTo(PX(p[0]), PY(p[1])) : g.lineTo(PX(p[0]), PY(p[1]));
      }
      g.closePath();
      g.strokeStyle = opts.casing || "rgba(0,0,0,0.55)"; g.lineWidth = width + 2.5; g.stroke();
      g.strokeStyle = opts.color || themeColor(def); g.lineWidth = width; g.stroke();
    }

    // DRS zones: bright cyan overlay on straight segments
    if (opts.drs && data.drsZones && data.drsZones.length) {
      const m = pts.length;
      g.lineWidth = width + 2;
      g.lineCap = "round";
      for (let z = 0; z < data.drsZones.length; z++) {
        const zone = data.drsZones[z];
        const from = Math.floor(zone.a * m);
        const to = Math.min(m - 1, Math.floor(zone.b * m));
        g.strokeStyle = "rgba(0,220,180,0.85)";
        g.beginPath();
        for (let i = from; i <= to; i++) {
          const p = pts[i];
          i === from ? g.moveTo(PX(p[0]), PY(p[1])) : g.lineTo(PX(p[0]), PY(p[1]));
        }
        g.stroke();
      }
    }

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

  return { outline, corners, direction, drsZones, elevRange, elevProfile, themeColor, draw, SECTOR_COLORS };
})();
