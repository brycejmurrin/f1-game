/* Apex 26 — TrackMaps: offline 2D circuit outlines for the track picker.
   Builds each circuit's centreline from the game's own spline engine (no race,
   no network) and caches the normalised minimap polyline per track id. */
const TrackMaps = (function () {
  "use strict";

  const cache = {};   // id -> [[x,y], ...] (normalised 0..1) | null

  // normalised outline polyline for a track def, built once and cached
  function outline(def) {
    if (!def) return null;
    if (Object.prototype.hasOwnProperty.call(cache, def.id)) return cache[def.id];
    let pts = null;
    try {
      const tr = Tracks.build(def);
      if (tr && tr.map && tr.map.length > 2) {
        pts = tr.map.map(function (p) { return [p[0], p[1]]; });
      }
    } catch (e) {
      pts = null;
    }
    cache[def.id] = pts;
    return pts;
  }

  // Draw the outline into a canvas, fit with margin, preserving aspect ratio.
  // opts: { color, casing, width, pad, start (bool), startColor }
  function draw(canvas, def, opts) {
    opts = opts || {};
    const g = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height, pad = opts.pad != null ? opts.pad : 14;
    g.clearRect(0, 0, W, H);
    const pts = outline(def);
    if (!pts || pts.length < 3) return false;

    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0];
      if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
    }
    const spanx = (maxx - minx) || 1, spany = (maxy - miny) || 1;
    const sc = Math.min((W - 2 * pad) / spanx, (H - 2 * pad) / spany);
    const ox = (W - spanx * sc) / 2, oy = (H - spany * sc) / 2;
    function PX(p) { return ox + (p[0] - minx) * sc; }
    function PY(p) { return oy + (p[1] - miny) * sc; }

    const width = opts.width || 3;
    g.lineJoin = "round"; g.lineCap = "round";
    g.beginPath();
    for (let i = 0; i <= pts.length; i++) {
      const p = pts[i % pts.length];
      const x = PX(p), y = PY(p);
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.closePath();
    g.strokeStyle = opts.casing || "rgba(0,0,0,0.55)"; g.lineWidth = width + 2.5; g.stroke();
    g.strokeStyle = opts.color || "#fff"; g.lineWidth = width; g.stroke();

    if (opts.start !== false) {
      const s = pts[0];
      g.fillStyle = opts.startColor || "#e10600";
      g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 1.5;
      g.beginPath(); g.arc(PX(s), PY(s), width + 1.5, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    return true;
  }

  return { outline: outline, draw: draw };
})();
