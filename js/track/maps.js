/* Apex 26 — TrackMaps: offline 2D circuit outlines for the track picker. Builds each circuit's centreline from the game's own spline engine (no race, no network) … */
const TrackMaps = (function () {
  "use strict";

  const cache = {};   // id -> { pts, py, corners, dir, elevRange, drsZones, sectors } | null

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

  const CLASS_COLORS = {
    HAIRPIN: "#f87171",
    SLOW: "#fb923c",
    MEDIUM: "#facc15",
    FAST: "#4ade80"
  };

  // Classify from approximate apex radius (m) + heading sweep (deg).
  // Peak |curvature| alone called every chicane a HAIRPIN (Rettifilo, Bus Stop);
  // real hairpins (La Source, Loews) are very tight AND reverse heading.
  // Absolute bands (R≥70 FAST, R<40 SLOW) match Monza/Spa guides on our
  // centreline; tracks whose corners all sit in one band (Indy, Jacarepagua,
  // GP-Stil short-radius packs) get a relative tertile spread so the popup
  // never paints every chip the same colour.
  function classifyCorner(rM, angDeg) {
    if (rM < 28 && angDeg >= 110) return "HAIRPIN";
    if (rM >= 70) return "FAST";
    if (rM < 40) return "SLOW";
    return "MEDIUM";
  }

  function assignCornerClasses(crns) {
    if (!crns || !crns.length) return crns;
    for (let i = 0; i < crns.length; i++) {
      crns[i].cls = classifyCorner(crns[i].r, crns[i].ang);
    }
    const rest = [];
    for (let i = 0; i < crns.length; i++) {
      if (crns[i].cls !== "HAIRPIN") rest.push(crns[i]);
    }
    if (rest.length < 4) return crns;
    let nSlow = 0, nMed = 0, nFast = 0;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].cls === "SLOW") nSlow++;
      else if (rest[i].cls === "MEDIUM") nMed++;
      else nFast++;
    }
    const kinds = (nSlow > 0 ? 1 : 0) + (nMed > 0 ? 1 : 0) + (nFast > 0 ? 1 : 0);
    const dominant = Math.max(nSlow, nMed, nFast);
    if (kinds >= 2 && dominant / rest.length < 0.7) return crns;
    rest.sort(function (a, b) { return a.r - b.r; });
    const n = rest.length;
    for (let i = 0; i < n; i++) {
      const q = n === 1 ? 0.5 : i / (n - 1);
      rest[i].cls = q <= 1 / 3 ? "SLOW" : q >= 2 / 3 ? "FAST" : "MEDIUM";
    }
    return crns;
  }

  function measureApex(tr, frac) {
    const total = tr.total, n = tr.n, ds = total / n;
    const f = (((frac % 1) + 1) % 1);
    const s0 = f * total;
    let kPeak = Math.abs(Tracks.curvature(tr, s0)), sPeak = s0;
    for (let d = -50; d <= 50; d += 2) {
      const s = ((s0 + d) % total + total) % total;
      const k = Math.abs(Tracks.curvature(tr, s));
      if (k > kPeak) { kPeak = k; sPeak = s; }
    }
    const thr = Math.max(0.0035, kPeak * 0.3);
    let a = sPeak, b = sPeak;
    for (let step = 0; step < 100; step++) {
      const s = ((sPeak - (step + 1) * ds) % total + total) % total;
      if (Math.abs(Tracks.curvature(tr, s)) < thr) break;
      a = s;
    }
    for (let step = 0; step < 100; step++) {
      const s = ((sPeak + (step + 1) * ds) % total + total) % total;
      if (Math.abs(Tracks.curvature(tr, s)) < thr) break;
      b = s;
    }
    let len = (b - a + total) % total;
    if (len < ds) len = ds;
    const steps = Math.max(10, Math.round(len / ds));
    let dHead = 0, prev = null;
    for (let j = 0; j <= steps; j++) {
      const s = (a + (len * j / steps)) % total;
      const fi = s / total * n;
      const i = Math.floor(fi) % n, jj = (i + 1) % n, ff = fi - Math.floor(fi);
      const tx = tr.tx[i] + (tr.tx[jj] - tr.tx[i]) * ff;
      const tz = tr.tz[i] + (tr.tz[jj] - tr.tz[i]) * ff;
      const h = Math.atan2(tz, tx);
      if (prev != null) {
        let dh = h - prev;
        while (dh > Math.PI) dh -= 2 * Math.PI;
        while (dh < -Math.PI) dh += 2 * Math.PI;
        dHead += dh;
      }
      prev = h;
    }
    const ang = Math.abs(dHead) * 180 / Math.PI;
    const r = kPeak > 1e-6 ? 1 / kPeak : 999;
    return { v: kPeak, r: r, ang: ang, cls: classifyCorner(r, ang), fPeak: ((sPeak / total) % 1 + 1) % 1 };
  }

  function cornerAt(tr, frac, n) {
    const m = tr.map.length;
    const f = (((frac % 1) + 1) % 1);
    const idx = Math.floor(f * m) % m;
    const mp = tr.map[idx];
    const mes = measureApex(tr, f);
    return { n: n, x: mp[0], y: mp[1], v: mes.v, r: mes.r, ang: mes.ang, cls: mes.cls };
  }

  // Build the outline + corner list once from the spline engine, then cache.
  function compute(def) {
    if (Object.prototype.hasOwnProperty.call(cache, def.id)) return cache[def.id];
    Log.info("track", "maps compute " + def.id);
    let out = null;
    try {
      // Centreline-only build: the minimap needs the spline (positions, tangents,
      // curvature, elevation) but NOT the 3D road/terrain/props meshes or any GPU
      // upload. Using the full build here meant the select screen ran 24 complete
      // 3D circuit builds on first open (~16 s stall).
      const tr = Tracks.buildCenterline(def);
      if (tr && tr.map && tr.map.length > 2) {
        const pts = tr.map.map(function (p) { return [p[0], p[1]]; });
        let crns;
        if (def.turns && def.turns.length) {
          crns = def.turns.map(function (frac, i) { return cornerAt(tr, frac, i + 1); });
        } else {
          crns = detectCorners(tr);
        }
        assignCornerClasses(crns);
        const dir = circuitDirection(tr);
        const elevRange = elevationRange(tr);
        const drsZones = detectDRS(tr);
        const sectors = (def.sectors && def.sectors.length === 2) ? def.sectors.slice() : null;
        out = { pts: pts, py: tr.py, corners: crns, dir: dir, elevRange: elevRange, drsZones: drsZones, sectors: sectors };
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

  // World-space outline aspect (x/z span), clamped so a pathological centreline
  // cannot blow the canvas. Used by the picker preview + track-detail modal so
  // CSS never has to stretch a fixed 520×300 bitmap into a different box.
  function aspect(def) {
    const pts = outline(def);
    if (!pts || pts.length < 2) return 520 / 300;
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i][0] < minx) minx = pts[i][0]; if (pts[i][0] > maxx) maxx = pts[i][0];
      if (pts[i][1] < miny) miny = pts[i][1]; if (pts[i][1] > maxy) maxy = pts[i][1];
    }
    return Math.max(0.5, Math.min(2.5, (maxx - minx) / ((maxy - miny) || 1)));
  }

  // How a circuit-preview card should spend its space, as pure arithmetic over
  // ONE card's measured geometry. It lives here, beside fitCanvas, rather than
  // in the menu module for one reason: every bug this logic has had was a
  // number bug, and numbers can be tested without a browser. The browser sweep
  // is minutes per run under SwiftShader; this table is milliseconds.
  //
  // The knobs, and the failure each one is holding shut:
  const CAPTION_MIN = 185;        // caption keeps its facts on one or two lines;
                                  //   a flat width share clipped the third chip
  const BESIDE_MIN_W = 340;       // below this a card cannot seat both columns
  const BESIDE_ASPECT_MAX = 1.1;  // only a circuit TALLER than wide is helped by
                                  //   turning sideways (Singapore got worse)
  const BESIDE_DEAD_FRAC = 0.34;  // a third of the card empty beside the map is
                                  //   what "stacking is wasting this" looks like
  const FLOOR_MAX_H = 240;        // never trade the map away at a big UI SIZE;
                                  //   let the column scroll instead (36x72 @175%)
  const MIN_SLOT_W = 120;
  const SLACK = 10;               // breathing room so the card cannot cause the
                                  //   scroller it is measured against to appear
  //
  // Every length is LOCAL (pre-zoom) CSS px. Mixing in a getBoundingClientRect
  // value inside `zoom: var(--ui-scale)` is what drove the budget negative at
  // UI SIZE 175% — the caller owes offsetHeight/clientWidth, not visual px.
  function planPreview(m) {
    m = m || {};
    const a = Math.max(0.05, +m.aspect || 1);
    const cardInnerW = Math.max(80, +m.cardInnerW || 0);
    const gap = Math.max(0, +m.gap || 0);
    const padY = Math.max(0, +m.padY || 0);
    const infoH = Math.max(0, +m.infoH || 0);
    const labelH = Math.max(0, +m.labelH || 0);
    const sectionH = +m.sectionH > 0 ? +m.sectionH : 0;
    // With no measured column to spend, fall back to the width and let the
    // aspect pick the height — the pre-layout first paint.
    const ceilFor = function (stacked) {
      if (!sectionH) return Math.max(72, Math.round(cardInnerW / a));
      return sectionH - labelH - padY - (stacked ? infoH + gap : 0) - SLACK;
    };
    const stackedH = Math.min(Math.round(cardInnerW / a), ceilFor(true));
    const stackedW = Math.min(cardInnerW, Math.round(stackedH * a));
    const beside = a < BESIDE_ASPECT_MAX && cardInnerW >= BESIDE_MIN_W &&
      (cardInnerW - stackedW) / cardInnerW > BESIDE_DEAD_FRAC;
    const widthCap = Math.floor(beside ? cardInnerW - gap - CAPTION_MIN : cardInnerW);
    const floorH = Math.min(FLOOR_MAX_H, Math.round(widthCap / a));
    const slotH = Math.max(floorH, Math.floor(ceilFor(!beside)));
    const slotW = Math.max(MIN_SLOT_W, Math.min(widthCap, Math.round(slotH * a)));
    return { shape: beside ? "beside" : "stacked", slotW: slotW, slotH: slotH };
  }

  function fitCanvas(canvas, maxW, maxH, def, pinCss) {
    const a = aspect(def);
    // A ResizeObserver can briefly report a zero slot while zoom/layout classes
    // converge. Never turn that transient into a visible 1x1 canvas; 40 local
    // px is the compact preview's own height floor and the next settled refit
    // can still grow it normally.
    let boxW = Math.max(40, Math.floor(maxW || 1));
    let boxH = Math.max(40, Math.floor(maxH || 1));
    let w = boxW, h = Math.round(w / a);
    if (h > boxH) { h = boxH; w = Math.round(h * a); }
    w = Math.max(1, w); h = Math.max(1, h);
    canvas.width = w;
    canvas.height = h;
    canvas.style.aspectRatio = String(a);
    if (pinCss) {
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      canvas.style.maxWidth = w + "px";
      canvas.style.maxHeight = h + "px";
    } else {
      canvas.style.width = "";
      canvas.style.height = "";
      canvas.style.maxWidth = "";
      canvas.style.maxHeight = "";
    }
    return { w: w, h: h, aspect: a };
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
    // A run still open after the k<=n loop means node 0 is itself straight — the
    // start/finish line falls INSIDE a straight — so the corner-closing branch
    // never fired for it. Left as-is, that trailing straight (the run-up to the
    // line) is silently dropped from the picker/HUD, splitting a seam-crossing
    // DRS zone in two. Close it at the seam (consumers iterate a→b by node index,
    // so a wrapping a>b range would break them; two adjacent zones render fine).
    if (runStart >= 0) {
      const frac = (n - runStart) / n;
      if (frac >= MIN_FRAC) zones.push({ a: runStart / n, b: 1 });
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
      const frac = p.k / n;
      return cornerAt(tr, frac, i + 1);
    });
  }

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
    const cx = PX((minx + maxx) / 2), cy = PY((miny + maxy) / 2);

    const width = opts.width || 3;
    g.lineJoin = "round"; g.lineCap = "round";

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
      // Draw three coloured sectors on top (curated splits when available)
      const m = pts.length;
      const splits = (data.sectors && data.sectors.length === 2)
        ? [0, data.sectors[0], data.sectors[1], 1]
        : [0, 1 / 3, 2 / 3, 1];
      for (let s = 0; s < 3; s++) {
        const from = Math.floor(splits[s] * m);
        const to = s === 2 ? m - 1 : Math.max(from, Math.floor(splits[s + 1] * m));
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

      if (opts.corners) {
      const cs = data.corners;
      const rDot = opts.cornerR || 7;
      const fontPx = opts.cornerFont || 12;
      // Below this a numbered-label-plus-leader-line per corner cannot fit
      // without overlapping into noise, however small cornerR/fontPx shrink —
      // a dense circuit (20+ turns) squeezed into a narrow measured slot (an
      // elongated street circuit at a small viewport) hits this well before
      // any single-marker size fix helps. A plain coloured dot per apex still
      // reads as "corners are here" without the clutter.
      if (W < 200 || H < 140) {
        for (let i = 0; i < cs.length; i++) {
          const x = PX(cs[i].x), y = PY(cs[i].y);
          const cls = cs[i].cls || classifyCorner(cs[i].r || (cs[i].v > 1e-6 ? 1 / cs[i].v : 999), 0);
          const col = CLASS_COLORS[cls] || (opts.cornerColor || "#fff");
          g.fillStyle = col;
          g.beginPath(); g.arc(x, y, Math.max(1.5, rDot * 0.4), 0, Math.PI * 2); g.fill();
        }
        return true;
      }
      const labelR0 = Math.max(20, rDot + 14);
      const labels = [];
      for (let i = 0; i < cs.length; i++) {
        const x = PX(cs[i].x), y = PY(cs[i].y);
        const cls = cs[i].cls || classifyCorner(cs[i].r || (cs[i].v > 1e-6 ? 1 / cs[i].v : 999), 0);
        const col = CLASS_COLORS[cls] || (opts.cornerColor || "#fff");
        let dx = x - cx, dy = y - cy;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        // Alternate radial distance for neighbours so T1/T2 chicanes don't stack.
        const labelR = labelR0 + (i % 2) * 8;
        labels.push({ i: i, x: x, y: y, dx: dx, dy: dy, lx: x + dx * labelR, ly: y + dy * labelR, col: col, n: cs[i].n });
      }
      // Separate colliding labels (min 16 px centre distance).
      for (let pass = 0; pass < 4; pass++) {
        for (let i = 0; i < labels.length; i++) {
          for (let j = i + 1; j < labels.length; j++) {
            const a = labels[i], b = labels[j];
            let vx = b.lx - a.lx, vy = b.ly - a.ly;
            let d = Math.hypot(vx, vy);
            if (d < 16 && d > 1e-3) {
              const push = (16 - d) / 2;
              vx /= d; vy /= d;
              a.lx -= vx * push; a.ly -= vy * push;
              b.lx += vx * push; b.ly += vy * push;
            } else if (d <= 1e-3) {
              a.lx -= 8; b.lx += 8;
            }
          }
        }
      }
      // Clamp into the canvas bounds. labelR0's own floor (20px) and the
      // separation pass above are geometry relative to the OUTLINE, not the
      // canvas edge — on a narrow/short buffer (an elongated circuit's aspect
      // fit into a small measured slot) a pushed-out label can land past the
      // edge with nothing upstream accounting for W/H. This is the one place
      // that guarantees every label stays visible regardless of circuit shape,
      // caller-chosen cornerR, or how small the canvas ends up.
      const bubbleR = fontPx * 0.78;
      for (let i = 0; i < labels.length; i++) {
        const L = labels[i];
        L.lx = Math.min(W - bubbleR, Math.max(bubbleR, L.lx));
        L.ly = Math.min(H - bubbleR, Math.max(bubbleR, L.ly));
      }
      g.font = "700 " + fontPx + "px system-ui, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      for (let i = 0; i < labels.length; i++) {
        const L = labels[i];
        g.strokeStyle = "rgba(255,255,255,0.35)";
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(L.x + L.dx * (rDot + 1), L.y + L.dy * (rDot + 1));
        g.lineTo(L.lx, L.ly);
        g.stroke();
        g.fillStyle = "rgba(10,10,16,0.92)";
        g.strokeStyle = L.col; g.lineWidth = 2.25;
        g.beginPath(); g.arc(L.x, L.y, rDot, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = "rgba(10,10,16,0.88)";
        g.beginPath(); g.arc(L.lx, L.ly, fontPx * 0.78, 0, Math.PI * 2); g.fill();
        g.strokeStyle = L.col; g.lineWidth = 1.25;
        g.stroke();
        g.fillStyle = L.col;
        g.fillText(String(L.n), L.lx, L.ly + 0.5);
      }
      // Compact class legend (large preview only).
      if (W >= 280 && H >= 200) {
        const legend = ["HAIRPIN", "SLOW", "MEDIUM", "FAST"];
        g.font = "600 9px system-ui, sans-serif";
        g.textAlign = "left"; g.textBaseline = "middle";
        let lx = 8, ly = H - 10;
        for (let i = legend.length - 1; i >= 0; i--) {
          const name = legend[i];
          const col = CLASS_COLORS[name];
          const tw = g.measureText(name).width;
          g.fillStyle = col;
          g.beginPath(); g.arc(lx + 4, ly, 3.5, 0, Math.PI * 2); g.fill();
          g.fillStyle = "rgba(220,220,230,0.85)";
          g.fillText(name, lx + 11, ly);
          lx += tw + 22;
        }
      }
      g.textAlign = "left";
    }
    return true;
  }

  return {
    outline, aspect, fitCanvas, planPreview, corners, direction, drsZones, elevRange, elevProfile, themeColor, draw,
    SECTOR_COLORS, CLASS_COLORS, classifyCorner, measureApex, assignCornerClasses
  };
})();
