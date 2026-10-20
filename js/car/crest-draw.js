/* Apex 26 — LiveryCrests: the team-mark painters of LiveryTex (traced, Mercedes, Haas, Audi, generic) and the CRESTS table.
   Pure move out of js/car/liverytex.js (#1663). create(d) closes over the atlas module's helpers and constants
   (css, fit, drawWordmark, teamShort, crestSpecFor, crestKey, legendOf, CREST_DISC, CREST_MARGIN, STROKE_MIN,
   TEXT_MIN) so the painters read exactly what they read when they were nested; LiveryTex destructures the result. */
const LiveryCrests = (function () {
  "use strict";

  function create(d) {
    const { css, fit, drawWordmark, teamShort, crestSpecFor, crestKey, legendOf, CREST_DISC, CREST_MARGIN, STROKE_MIN, TEXT_MIN } = d;

    // Narrowest limb any crest may draw. Every stroke goes through this, so the
    // 34 px worst case is enforced by construction rather than by review.
    const swMin = (f, k) => f.S(Math.max(STROKE_MIN, k));

    // ── traced marks ───────────────────────────────────────────────────────────
    // Eight of the eleven marks are path data in js/car/crest-paths.js, traced
    // from bitmaps (tools/car/trace-logo.mjs). Hand-drawn from memory as chained
    // canvas calls, Red Bull's two charging bulls come out as a pair of pigs and
    // Aston's spread wings as three chevrons. A silhouette is data.
    //
    // Only M, L and Z — the tracer emits polylines, because a contour walked at
    // 384 px and simplified to a few tenths of a percent is already smoother than
    // a curve anyone would fit to it, and a straight-line path needs no curve
    // support here or in the offline rasteriser that measures these.
    function tracePath(ctx, f, d) {
      let i = 0, cmd = "";
      const num = () => {
        while (i < d.length && (d[i] === " " || d[i] === ",")) i++;
        const st = i;
        while (i < d.length && "-+.0123456789eE".indexOf(d[i]) >= 0) i++;
        return parseFloat(d.slice(st, i));
      };
      ctx.beginPath();
      // EVERY ITERATION MUST CONSUME A CHARACTER. Two branches here could spin
      // forever on input this parser does not handle, and an infinite loop in a
      // livery build is the worst failure shape the game has: the tab locks with
      // no exception, nothing in __apex.logs(), no crash strike and no
      // webglcontextlost, because the OS watchdog takes the whole process. That is
      // indistinguishable from the jetsam kill we spent a night hunting.
      //
      //   "M0 0L1 1Z\n"        spins at the newline
      //   "M0 0L1 1z"          spins at a LOWERCASE command
      //   "M0 0L1 1Zm2 2l3 3z" spins at the relative moveto
      //
      // `Z` continued before any i++, so anything after a close that was not an
      // uppercase letter looped; and num() returns parseFloat("") = NaN having
      // consumed NOTHING when it meets a character outside its set.
      //
      // js/car/crest-paths.js is GENERATED (tools/car/trace-logo.mjs) and its
      // current output is clean — I checked every `d` string for characters
      // outside [A-Z0-9 ,.+-eE]. This is a latent trap, not a live one, and the
      // last day added six new crest-trace surfaces (nose, endplate, fin, spine,
      // garage wall, picker tiles), so the next regeneration is the risk.
      let guard = d.length * 4 + 16;   // no legal path needs four passes per char
      while (i < d.length) {
        if (guard-- <= 0) { Log.warn("car", "tracePath: no progress in '" + d.slice(0, 40) + "' at " + i); break; }
        const c = d[i];
        if (c === " " || c === ",") { i++; continue; }
        if (c >= "A" && c <= "Z") { cmd = c; i++; }
        else if (!(c >= "0" && c <= "9") && "-+.".indexOf(c) < 0) { i++; continue; }   // lowercase / unknown: skip it
        if (cmd === "Z") { ctx.closePath(); cmd = ""; continue; }
        const before = i;
        const x = num(), y = num();
        if (i === before) { i++; continue; }              // num() consumed nothing
        if (!isFinite(x) || !isFinite(y)) continue;
        if (cmd === "M") { ctx.moveTo(f.X(x), f.Y(y)); cmd = "L"; }
        else ctx.lineTo(f.X(x), f.Y(y));
      }
    }

    // One crest function for every traced mark. Layers paint back to front and
    // each takes the palette colour its role names. A plate the badge keeps
    // (Ferrari's shield, Red Bull's sun via CREST_DISC) still paints here —
    // dropping it left a bare horse on the tail next to the full lockup on
    // the spine and the garage wall.
    function crestTraced(ctx, R, P, bare, teamId) {
      const spec = crestSpecFor(teamId);
      if (!spec) { crestGeneric(ctx, R, P, bare, teamId); return; }
      const f = fit(R, CREST_MARGIN);
      ctx.save();
      // The authored backing, behind every traced layer. Red Bull's sun is the
      // only one: the trace could give a union silhouette or nothing, and a
      // silhouette painted gold is a rim, not a sun (see CREST_DISC).
      const disc = CREST_DISC[crestKey(teamId)];
      if (disc && P.plate) {
        ctx.fillStyle = css(P.plate);
        ctx.beginPath();
        ctx.arc(f.X(disc.cx), f.Y(disc.cy), f.S(disc.r), 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < spec.d.length; i++) {
        const role = spec.roles[i] || "mark";
        // Skip a plate layer only when the palette has no plate. Ferrari keeps
        // its shield on the badge (crestKeepsPlate); marks whose badge drops
        // the backing arrive here with P.plate already null.
        if (role === "plate" && !P.plate) continue;
        // `part` is a SAME-INK island — a shape the trace found to share no pixel
        // with the rest of its layer, like Racing Bulls' bull beside its letters.
        // Unset it IS the mark, so the crest ships pixel-identical; authored, it
        // is the one place a single-ink mark can take a second colour.
        let roleFill = P.mark;
        if (role === "plate") roleFill = P.plate;
        else if (role === "alt") roleFill = P.alt;
        else if (role === "part") roleFill = P.part || P.mark;
        ctx.fillStyle = css(roleFill);
        tracePath(ctx, f, spec.d[i]);
        // evenodd, so a counter walked as its own loop punches a HOLE rather than
        // filling solid — the whole reason the bitmaps had to go.
        ctx.fill("evenodd");
      }
      ctx.restore();
    }

    // ── the eleven team marks + the custom fallback ────────────────────────────
    // Every one takes the SAME five arguments and paints only from P (see
    // markPalette): P.mark for the dominant shape, P.alt for counters, second
    // colour and lettering, P.plate for a backing shield. No baked colours except
    // the two national bands called out below, no alpha, no destination-out.
    // `bare` is the shark-fin badge: no fillText lettering (34 px cannot carry
    // a wordmark). The lockup itself — shield, disc, ring, weave, box — is the
    // same construction as the engine cover and the garage wall.

    // Mercedes — three-point star inside a ring. Two shapes, and the RING is the
    // one this mark can hand to the DETAIL row: `P.part` is same-ink-unless-
    // authored, so an unset row leaves the star and its ring in one colour, which
    // is the real mark. Drawn at every size, badge included.
    function crestMercedes(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      const cx = f.X(0.5), cy = f.Y(0.5), r = f.S(0.48), rin = f.S(0.39);
      ctx.save();
      ctx.fillStyle = css(P.part || P.mark);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.arc(cx, cy, rin, 0, Math.PI * 2, true);
      ctx.fill("evenodd");
      ctx.fillStyle = css(P.mark);
      // Star tips stop at 0.34, not at 0.99 of the ring's inner radius. That left
      // a 0.004 counter — right for the real mark at print size, and a filled
      // disc the moment the atlas drops to the AI tier.
      const tip = f.S(0.34), baseW = f.S(0.115);
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + i * (Math.PI * 2 / 3);
        const px = cx + Math.cos(a) * tip, py = cy + Math.sin(a) * tip;
        const bx = -Math.sin(a) * baseW, by = Math.cos(a) * baseW;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(cx + bx, cy + by);
        ctx.lineTo(cx - bx, cy - by);
        ctx.closePath();
        ctx.fill();
      }
      ctx.beginPath(); ctx.arc(cx, cy, f.S(0.055), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Haas — slashed H inside a ring. The ring is the lockup, on the fin too.
    function crestHaas(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save();
      ctx.strokeStyle = css(P.alt);
      ctx.lineWidth = swMin(f, 0.085);
      ctx.beginPath();
      ctx.arc(f.X(0.5), f.Y(0.5), f.S(0.42), 0, Math.PI * 2);
      ctx.stroke();
      // Uprights over y 0.20..0.80 with outer edges at 0.24 and 0.76 CROSS the
      // ring: at y 0.20 its inner half-width is only 0.229 (x 0.271..0.729).
      // These bounds are the inscribed box instead —
      // corner distance 0.33 against an inner radius of 0.3775. Same box on the
      // badge: a full-height H with the ring around it is a different logo.
      const xa = 0.27, xb = 0.38;
      const y0 = 0.26, y1 = 0.74;
      ctx.fillStyle = css(P.mark);
      ctx.fillRect(f.X(xa), f.Y(y0), f.S(xb - xa), f.S(y1 - y0));            // left upright
      ctx.fillRect(f.X(1 - xb), f.Y(y0), f.S(xb - xa), f.S(y1 - y0));        // right upright
      // Slashed crossbar, anchored ON the uprights' inner edges so it joins them
      // rather than floating between them.
      // A bar this steep runs corner to corner and the letter reads as an N.
      // Keep it in the middle third with a shallow rise: 0.18 over the span, not
      // 0.33, and centred on the uprights' midline.
      const h = y0 + (y1 - y0) * 0.33, d = (y1 - y0) * 0.18, t = (y1 - y0) * 0.24;
      ctx.beginPath();
      ctx.moveTo(f.X(xb), f.Y(h));
      ctx.lineTo(f.X(1 - xb), f.Y(h + d));
      ctx.lineTo(f.X(1 - xb), f.Y(h + d + t));
      ctx.lineTo(f.X(xb), f.Y(h + t));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Audi — four interlocking rings. P.alt is unused: the auto-scored second
    // colour would repaint every shipped car. The DETAIL row lands on `P.part`
    // instead — the SECOND and FOURTH rings — which is same-ink until the player
    // authors it, so an unset row still draws the four-ring mark it always did.
    function crestAudi(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save();
      const inkFor = (i) => css(i % 2 ? (P.part || P.mark) : P.mark);
      // r 0.135 is the MAXIMUM four rings fit in a unit box at the real ~1.62 r
      // pitch (6.815r + w <= 1); r 0.17 at a 0.20 pitch uses 26% of the box
      // and buries the weave. This lockup is inherently ~3.6:1, so it is the
      // one mark that cannot fill a square box vertically — a written exception,
      // not an oversight.
      const r = f.S(0.135), cy = f.Y(0.5), xs = [0.16, 0.3767, 0.5933, 0.81];
      ctx.lineWidth = swMin(f, 0.075);
      const ring = (i) => {
        ctx.strokeStyle = inkFor(i);
        ctx.beginPath();
        ctx.arc(f.X(xs[i]), cy, r, 0, Math.PI * 2);
        ctx.stroke();
      };
      for (let i = 0; i < 4; i++) ring(i);
      // Weave: re-stroke the OVER ring inside each overlap, alternating which one
      // that is. Four independent arcs lie flat on each other and never interlock.
      // Same weave on the badge — a flat four-ring is a different logo.
      for (let i = 0; i < 3; i++) {
        const mid = (xs[i] + xs[i + 1]) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(f.X(mid - 0.055), f.Y(0.30), f.S(0.11), f.S(0.40));
        ctx.clip();
        ring(i % 2 === 0 ? i + 1 : i);
        ctx.restore();
      }
      ctx.restore();
    }

    // Generic fallback — monogram of the team short code (a wordmark legend: the
    // team's name). The custom team's mark whenever it has no uploaded emblem.
    function crestGeneric(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      const box = { x: f.X(0.06), y: f.Y(0.22), w: f.S(0.88), h: f.S(0.56) };
      ctx.save();
      ctx.strokeStyle = css(P.alt);
      ctx.lineWidth = swMin(f, 0.055);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      const legend = legendOf(teamId);
      const label = legend && legend.car ? String(legend.car).split(" ")[0].toUpperCase() : teamShort(teamId);
      drawWordmark(ctx, label, box, P.mark, { align: "center", pad: f.S(0.06) });
      ctx.restore();
    }

    // The eleven marks. Eight are traced path data (js/car/crest-paths.js); the
    // other three are drawn, because for those three a construction beats a trace:
    // Mercedes is a ring and a three-point star, Audi four interlocking rings, and
    // Haas an H inside a ring. Those are exact as maths, and their source bitmaps
    // were the WORST of the set — haas.png traces to a plain red disc and audi.png
    // to four filled blobs, because both had their counters filled in.
    const CRESTS = {
      mercedes: crestMercedes,
      ferrari: crestTraced,
      mclaren: crestTraced,
      redbull: crestTraced,
      alpine: crestTraced,
      racingbulls: crestTraced,
      haas: crestHaas,
      williams: crestTraced,
      audi: crestAudi,
      astonmartin: crestTraced,
      cadillac: crestTraced,
    };

    // ORIGINAL EMBLEMS (livery.crestStyle): generic marks a player can wear in place of the
    // team's crest — a shield, a roundel, swept wings, an arrowhead, a star. Geometry only,
    // modelled on no team's or sponsor's mark (docs/notes/LIVERY-REF-2026-10-18.md). Each
    // carries the team's initial so the car still says whose it is; colours come from P.
    function emblemLetter(ctx, f, P, teamId, cx, cy, size) {
      const legend = legendOf(teamId);
      const name = legend && legend.car ? String(legend.car) : teamShort(teamId);
      const ch = (name.trim()[0] || "A").toUpperCase();
      drawWordmark(ctx, ch, { x: f.X(cx - size / 2), y: f.Y(cy - size / 2), w: f.S(size), h: f.S(size) }, P.alt, { align: "center", pad: 0 });
    }
    function poly(ctx, f, pts) {
      ctx.beginPath();
      pts.forEach(([u, v], i) => (i ? ctx.lineTo(f.X(u), f.Y(v)) : ctx.moveTo(f.X(u), f.Y(v))));
      ctx.closePath();
    }
    function emblemShield(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save(); ctx.fillStyle = css(P.mark);
      poly(ctx, f, [[0.16, 0.10], [0.84, 0.10], [0.84, 0.50], [0.50, 0.92], [0.16, 0.50]]); ctx.fill();
      ctx.strokeStyle = css(P.alt); ctx.lineWidth = swMin(f, 0.05);
      poly(ctx, f, [[0.24, 0.40], [0.50, 0.58], [0.76, 0.40]]); ctx.stroke();
      emblemLetter(ctx, f, P, teamId, 0.5, 0.27, 0.26);
      ctx.restore();
    }
    function emblemRoundel(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save(); ctx.fillStyle = css(P.mark);
      ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.5), f.S(0.44), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = css(P.alt); ctx.lineWidth = swMin(f, 0.05);
      ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.5), f.S(0.34), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = css(P.alt); ctx.fillRect(f.X(0.10), f.Y(0.46), f.S(0.80), f.S(0.08));
      ctx.fillStyle = css(P.mark); ctx.fillRect(f.X(0.36), f.Y(0.36), f.S(0.28), f.S(0.28));
      emblemLetter(ctx, f, P, teamId, 0.5, 0.5, 0.26);
      ctx.restore();
    }
    function emblemWings(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save(); ctx.fillStyle = css(P.mark);
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const y = 0.34 + i * 0.12, x0 = 0.5 + s * 0.16, x1 = 0.5 + s * (0.46 - i * 0.08);
          poly(ctx, f, [[x0, y], [x1, y - 0.06], [x1 - s * 0.05, y + 0.05], [x0, y + 0.08]]); ctx.fill();
        }
      }
      ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.5), f.S(0.15), 0, Math.PI * 2); ctx.fill();
      emblemLetter(ctx, f, P, teamId, 0.5, 0.5, 0.18);
      ctx.restore();
    }
    function emblemArrow(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save(); ctx.fillStyle = css(P.mark);
      poly(ctx, f, [[0.08, 0.22], [0.92, 0.50], [0.08, 0.78], [0.30, 0.50]]); ctx.fill();
      ctx.fillStyle = css(P.alt);
      poly(ctx, f, [[0.36, 0.42], [0.60, 0.50], [0.36, 0.58], [0.42, 0.50]]); ctx.fill();
      ctx.restore();
    }
    function emblemStar(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN), pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.19 : 0.44;
        pts.push([0.5 + Math.cos(a) * r, 0.53 + Math.sin(a) * r]);
      }
      ctx.save(); ctx.fillStyle = css(P.mark); poly(ctx, f, pts); ctx.fill();
      emblemLetter(ctx, f, P, teamId, 0.5, 0.55, 0.2);
      ctx.restore();
    }
    // Design preview B·D8 (2026-10-19): four more, each a different SILHOUETTE
    // first — a hexagon, a ring of leaves, a stack, a rhombus — so two cars in
    // different emblems still differ at the distance only the outline survives.
    function emblemBolt(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN), pts = [];
      for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; pts.push([0.5 + Math.cos(a) * 0.45, 0.5 + Math.sin(a) * 0.45]); }
      ctx.save(); ctx.fillStyle = css(P.mark); poly(ctx, f, pts); ctx.fill();
      ctx.fillStyle = css(P.alt);
      poly(ctx, f, [[0.56, 0.14], [0.30, 0.54], [0.47, 0.54], [0.40, 0.86], [0.70, 0.42], [0.53, 0.42]]); ctx.fill();
      ctx.restore();
    }
    function emblemLaurel(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save(); ctx.fillStyle = css(P.mark);
      // five broad leaves up each side of an open wreath, tips leaning in toward the
      // crown. Seven narrow ones read as a dotted ring at crest size (flat raster, round 1).
      for (const s of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          const a = Math.PI / 2 + s * (0.42 + i * 0.48), r = 0.36;
          const cx = 0.5 + Math.cos(a) * r, cy = 0.5 + Math.sin(a) * r, ta = a + s * (Math.PI / 2 - 0.5);
          const lx = Math.cos(ta) * 0.13, ly = Math.sin(ta) * 0.13, nx = -ly * 0.55, ny = lx * 0.55;
          poly(ctx, f, [[cx - lx, cy - ly], [cx + nx, cy + ny], [cx + lx, cy + ly], [cx - nx, cy - ny]]); ctx.fill();
        }
      }
      emblemLetter(ctx, f, P, teamId, 0.5, 0.5, 0.34);
      ctx.restore();
    }
    function emblemChevrons(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const y = 0.16 + i * 0.22;
        ctx.fillStyle = css(i === 1 ? P.alt : P.mark);
        poly(ctx, f, [[0.10, y + 0.20], [0.50, y], [0.90, y + 0.20], [0.90, y + 0.36], [0.50, y + 0.16], [0.10, y + 0.36]]); ctx.fill();
      }
      ctx.restore();
    }
    function emblemDiamond(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save(); ctx.fillStyle = css(P.mark);
      poly(ctx, f, [[0.5, 0.04], [0.94, 0.5], [0.5, 0.96], [0.06, 0.5]]); ctx.fill();
      ctx.strokeStyle = css(P.alt); ctx.lineWidth = swMin(f, 0.04);
      poly(ctx, f, [[0.5, 0.16], [0.82, 0.5], [0.5, 0.84], [0.18, 0.5]]); ctx.stroke();
      emblemLetter(ctx, f, P, teamId, 0.5, 0.5, 0.30);
      ctx.restore();
    }
    // Design preview B·D8 round 5 (2026-10-19): four more silhouettes, none of them
    // a circle-in-a-box like the nine above — a toothed wheel, a spiked crown, a
    // flag on a pole and a flame.
    function emblemGear(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN), pts = [], n = 8;
      for (let i = 0; i < n * 4; i++) {
        const a = (i / (n * 4)) * Math.PI * 2, r = (i % 4) < 2 ? 0.48 : 0.37;
        pts.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]);
      }
      ctx.save(); ctx.fillStyle = css(P.mark); poly(ctx, f, pts); ctx.fill();
      ctx.strokeStyle = css(P.alt); ctx.lineWidth = swMin(f, 0.04);
      ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.5), f.S(0.27), 0, Math.PI * 2); ctx.stroke();
      emblemLetter(ctx, f, P, teamId, 0.5, 0.5, 0.28);
      ctx.restore();
    }
    function emblemCrown(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save(); ctx.fillStyle = css(P.mark);
      poly(ctx, f, [[0.08, 0.80], [0.08, 0.30], [0.30, 0.56], [0.50, 0.18], [0.70, 0.56], [0.92, 0.30], [0.92, 0.80]]); ctx.fill();
      for (const [u, v] of [[0.08, 0.24], [0.50, 0.12], [0.92, 0.24]]) { ctx.beginPath(); ctx.arc(f.X(u), f.Y(v), f.S(0.07), 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = css(P.alt);
      ctx.fillRect(f.X(0.08), f.Y(0.66), f.S(0.84), f.S(0.07));
      for (const u of [0.26, 0.50, 0.74]) { ctx.beginPath(); ctx.arc(f.X(u), f.Y(0.56), f.S(0.045), 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    function emblemFlag(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN), cols = 5, rows = 4, x0 = 0.20, y0 = 0.10, w = 0.72, h = 0.56;
      ctx.save(); ctx.fillStyle = css(P.mark);
      ctx.fillRect(f.X(0.08), f.Y(0.06), f.S(0.09), f.S(0.88));    // the pole
      ctx.fillRect(f.X(x0), f.Y(y0), f.S(w), f.S(h));
      ctx.fillStyle = css(P.alt);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if ((r + c) % 2) ctx.fillRect(f.X(x0 + (c * w) / cols), f.Y(y0 + (r * h) / rows), f.S(w / cols), f.S(h / rows));
      }
      ctx.restore();
    }
    function emblemFlame(ctx, R, P, bare, teamId) {
      const f = fit(R, CREST_MARGIN);
      ctx.save(); ctx.fillStyle = css(P.mark);
      poly(ctx, f, [[0.50, 0.96], [0.22, 0.86], [0.12, 0.62], [0.22, 0.36], [0.30, 0.52], [0.36, 0.20], [0.50, 0.04],
        [0.56, 0.30], [0.66, 0.16], [0.78, 0.40], [0.88, 0.62], [0.78, 0.86]]); ctx.fill();
      ctx.fillStyle = css(P.alt);
      poly(ctx, f, [[0.50, 0.88], [0.34, 0.80], [0.30, 0.64], [0.40, 0.48], [0.46, 0.60], [0.54, 0.40], [0.66, 0.60], [0.68, 0.78]]); ctx.fill();
      ctx.restore();
    }
    // "team" (or unset) keeps the team's own crest; the garage lists EMBLEM_IDS in this order.
    const EMBLEMS = Object.freeze({ shield: emblemShield, roundel: emblemRoundel, wings: emblemWings, arrow: emblemArrow, star: emblemStar,
      bolt: emblemBolt, laurel: emblemLaurel, chevrons: emblemChevrons, diamond: emblemDiamond,
      gear: emblemGear, crown: emblemCrown, flag: emblemFlag, flame: emblemFlame });
    const EMBLEM_IDS = Object.freeze(["team", ...Object.keys(EMBLEMS)]);

    // CREST CUSTOMISATION (B·D8 round 5): two rows that dress an original emblem,
    // composed only from the palette markPalette already resolved — no new colour
    // reaches the car, so the legibility guarantees on mark/alt still hold.
    //   crestTone   team (as resolved) | swap (mark and alt trade places) |
    //               mono (one colour: the silhouette alone)
    //   crestFrame  none | disc | shield | badge | ring — a backing in `alt`
    //               keylined in `mark`, the emblem shrunk inside it. `ring`
    //               is the keyline alone.
    // The team's own crest ignores both: its colours are brand pairings the
    // palette protects, and a frame would cover its authored plate.
    const CREST_TONE_IDS = Object.freeze(["team", "swap", "mono"]);
    const CREST_FRAME_IDS = Object.freeze(["none", "disc", "shield", "badge", "ring"]);
    function tonePalette(P, tone) {
      if (tone === "swap") return Object.assign({}, P, { mark: P.alt, alt: P.mark });
      if (tone === "mono") return Object.assign({}, P, { alt: P.mark });
      return P;
    }
    const FRAME_PATH = {
      disc: (ctx, f) => { ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.5), f.S(0.48), 0, Math.PI * 2); },
      ring: (ctx, f) => { ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.5), f.S(0.46), 0, Math.PI * 2); },
      shield: (ctx, f) => poly(ctx, f, [[0.08, 0.04], [0.92, 0.04], [0.92, 0.52], [0.50, 0.97], [0.08, 0.52]]),
      badge: (ctx, f) => poly(ctx, f, [[0.16, 0.04], [0.84, 0.04], [0.96, 0.16], [0.96, 0.84], [0.84, 0.96], [0.16, 0.96], [0.04, 0.84], [0.04, 0.16]]),
    };
    // The emblem's box inside each frame: the shield's point is low, so its
    // inner box rides high.
    const FRAME_INNER = { disc: [0.5, 0.5, 0.66], ring: [0.5, 0.5, 0.70], shield: [0.5, 0.42, 0.62], badge: [0.5, 0.5, 0.72] };
    // Wrap an emblem painter in a tone and a frame. Returns the painter itself
    // when both are default, so the shipped draw stays op-for-op identical.
    function dressEmblem(fn, tone, frame) {
      const t = CREST_TONE_IDS.indexOf(tone) > 0 ? tone : null;
      const fr = Object.hasOwn(FRAME_PATH, frame || "") ? frame : null;
      if (!t && !fr) return fn;
      return function (ctx, R, P0, bare, teamId) {
        const P = t ? tonePalette(P0, t) : P0;
        if (!fr) return fn(ctx, R, P, bare, teamId);
        const f = fit(R, CREST_MARGIN);
        ctx.save();
        FRAME_PATH[fr](ctx, f);
        // mono has no second colour to fill with: the frame is the keyline alone
        if (fr !== "ring" && t !== "mono") { ctx.fillStyle = css(P.alt); ctx.fill(); }
        ctx.strokeStyle = css(P.mark); ctx.lineWidth = swMin(f, fr === "ring" ? 0.06 : 0.035);
        ctx.stroke();
        ctx.restore();
        const [cu, cv, k] = FRAME_INNER[fr], s = f.S(k) / (1 - CREST_MARGIN * 2);
        // On a filled frame the emblem lands on `alt`, so its own mark/alt pair
        // stays as resolved — mark already separates from alt by construction.
        fn(ctx, { x: f.X(cu) - s / 2, y: f.Y(cv) - s / 2, w: s, h: s }, P, bare, teamId);
      };
    }

    return { CRESTS, crestGeneric, tracePath, EMBLEMS, EMBLEM_IDS, CREST_TONE_IDS, CREST_FRAME_IDS, dressEmblem };
  }

  return { create };
})();
Object.freeze(LiveryCrests);
