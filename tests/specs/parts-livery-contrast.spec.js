// @ts-check
// Sponsor / crest legibility: the auto-picked ink must actually contrast with
// the paint it lands on.
//
// Two defects motivated these. (1) lum() applied the Rec.709 coefficients to
// gamma-encoded sRGB without linearising, so mid-tones read far brighter than
// they are and the ink flipped at the wrong point. (2) every region was inked
// against c1, while the rear-wing band sits on the WING colour and the sidepod
// strip sits on the POD panel — Ferrari's default livery put white text on a
// white wing at 1.1:1, i.e. invisible.
//
// ONE BOOT PER WORKER (sharedTest): seven boots became none. Every test here is
// pure — it reads Liveries/Teams/Car3D/LiveryTex off the loaded page and never
// touches a screen or a race — so a live page is all load() has to guarantee.
// UNVERIFIED IN A BROWSER at conversion time.
import { sharedTest as test, expect } from "../helpers/fixtures.js";
import { ensureLive } from "../helpers/shared-page.js";

async function load(page) {
  await ensureLive(page);
}

// WCAG contrast, computed in the page against the SAME helpers the atlas uses.
const CONTRAST_FN = `
  const lin = (u) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
`;

test.describe("Livery atlas — ink contrast", () => {
  test("luminance is linearised, so mid-grey picks the ink that actually contrasts", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(`(() => {
      ${CONTRAST_FN}
      // Mid grey: naive luminance says 0.50 (-> light ink), true relative
      // luminance is 0.21, and black genuinely contrasts better than white.
      const grey = [0.5, 0.5, 0.5];
      return { lum: lum(grey), black: ratio([0.06,0.06,0.08], grey), white: ratio([0.97,0.97,0.98], grey) };
    })()`);
    expect(r.lum).toBeLessThan(0.3);
    expect(r.black).toBeGreaterThan(r.white);
  });

  test("every shipped livery is legible on every panel, by ink or by halo", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(`(() => {
      ${CONTRAST_FN}
      const D = [0.06,0.06,0.08], L = [0.97,0.97,0.98];
      const inkOn = (bgs) => {
        const w = (i) => Math.min.apply(null, bgs.map((b) => ratio(i, b)));
        const d = w(D), l = w(L);
        return { ink: d >= l ? D : L, worst: Math.max(d, l) };
      };
      const bad = [];
      let scored = 0;
      for (const team of Teams.LIST) {
        for (const liv of Liveries.forTeam(team)) {
          const c1 = liv.c1, pod = liv.pod || null, wing = liv.wing || liv.c2;
          const panels = [
            ["crest", [c1]],
            ["pod",   pod ? [c1, pod] : [c1]],
            ["strip", pod ? [pod] : [c1]],
            ["wing",  [wing]],
            // The SHARK FIN is painted c2, not c1 — inking its motif for the
            // body put a white crest on a white fin on every pale-accent livery.
            ["fin",   [liv.c2]],
          ];
          for (const [name, bgs] of panels) {
            scored++;
            // A mark can straddle TWO paints (body + pod panel), and when those
            // sit either side of mid-grey no single ink serves both — that is
            // what the halo is for. The guarantee is therefore about the PAIR:
            // for every background, the ink or its halo must be legible. The
            // inks are near-black and near-white rather than pure, so the proven
            // floor is 4.23:1 (at background luminance 0.183), not the 4.58:1
            // pure black/white would give. 4.2 is the real bound; anything below
            // it means an ink constant moved.
            const { ink } = inkOn(bgs);
            const halo = ink === D ? L : D;
            for (const bg of bgs) {
              const covered = Math.max(ratio(ink, bg), ratio(halo, bg));
              if (covered < 4.2) {
                bad.push(team.id + "/" + liv.id + ":" + name + ":" + covered.toFixed(2));
              }
            }
          }
        }
      }
      return { bad, scored };
    })()`);
    expect(result.scored).toBeGreaterThan(500);
    expect(result.bad, "neither the ink nor its halo is legible on these panels").toEqual([]);
  });

  test("the shark-fin motif is inked for the fin colour, not the body colour", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(`(() => {
      ${CONTRAST_FN}
      const D = [0.06,0.06,0.08], L = [0.97,0.97,0.98];
      const best = (bg) => (ratio(D, bg) >= ratio(L, bg) ? D : L);
      const team = Teams.LIST.find((t) => t.id === "ferrari");
      const liv = Liveries.forTeam(team)[0];          // red body, WHITE accent
      return { body: ratio(best(liv.c1), liv.c2), fin: ratio(best(liv.c2), liv.c2) };
    })()`);
    expect(r.body, "inking the fin for the body paint is white-on-white").toBeLessThan(2);
    expect(r.fin, "inking it for the fin paint is legible").toBeGreaterThan(4.5);
  });

  test("the rear-wing band is inked for the wing colour, not the body colour", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(`(() => {
      ${CONTRAST_FN}
      const D = [0.06,0.06,0.08], L = [0.97,0.97,0.98];
      const best = (bg) => (ratio(D, bg) >= ratio(L, bg) ? D : L);
      // Ferrari's default: red body, WHITE wing flaps. Inking the wing band for
      // the body picks white — white on white.
      const team = Teams.LIST.find((t) => t.id === "ferrari");
      const liv = Liveries.forTeam(team)[0];
      const wing = liv.wing || liv.c2;
      return { body: ratio(best(liv.c1), wing), wing: ratio(best(wing), wing) };
    })()`);
    expect(r.body, "inking the wing band for the body paint is unreadable").toBeLessThan(2);
    expect(r.wing, "inking it for the wing paint is legible").toBeGreaterThan(4.5);
  });

  // The map of "which paint is behind which atlas region" lived only in
  // buildAtlas's head, and was wrong three times running (wing, sidepod board,
  // shark fin) — each found by a human noticing white-on-white on ONE livery.
  // This derives the answer from the geometry instead: paint each livery slot a
  // unique sentinel colour, then for every decal quad step back along its own
  // normal and read the body triangle behind it. The sentinel names the slot.
  test("every decal region sits on the paint buildAtlas inks it for", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      // Unmistakable, well-separated sentinels — one per livery colour slot.
      const SENTINEL = {
        c1:   [0.90, 0.10, 0.20], c2:   [0.10, 0.80, 0.30],
        pod:  [0.20, 0.30, 0.95], wing: [0.95, 0.85, 0.10],
        accent: [0.80, 0.20, 0.90], nose: [0.10, 0.85, 0.90],
      };
      // spineSide ON: its band is only ever painted with a flank mark picked,
      // and that pick is what clears the accent pinstripe and the service
      // panels out from under the band — probe the geometry the mark sits on.
      const liv = { c1: SENTINEL.c1, c2: SENTINEL.c2, pod: SENTINEL.pod,
                    wing: SENTINEL.wing, accent: SENTINEL.accent, nose: SENTINEL.nose,
                    spineSide: "number" };
      const mesh = Car3D.build(liv.c1, liv.c2, { livery: liv, teamId: "ferrari" });
      const board = Car3D.PANEL_COL;
      const near = (a, b) => Math.abs(a[0]-b[0]) < 0.02 && Math.abs(a[1]-b[1]) < 0.02
                          && Math.abs(a[2]-b[2]) < 0.02;
      const nameOf = (c) => {
        for (const k of Object.keys(SENTINEL)) if (near(c, SENTINEL[k])) return k;
        if (near(c, board)) return "board";
        return null;   // carbon / dark / metal furniture — not a paint slot
      };
      // Body triangles, whole — not their centroids. A centroid is a fine stand-in
      // for a small box and useless for a long loft span: the nose top is two
      // spans half a metre each, so every centroid sat further from the titleB
      // quad than the lateral cutoff below and the probe simply never found the
      // region. It reported nothing rather than reporting the wrong thing, and
      // the coverage list at the end of this test did not ask for it — which is
      // how titleB shipped inked for a sponsor board it never touches.
      const tris = [];
      for (let t = 0; t < mesh.idx.length / 3; t++) {
        const i0 = mesh.idx[t * 3] * 3;
        const P = [];
        for (let k = 0; k < 3; k++) {
          const i = mesh.idx[t * 3 + k] * 3;
          P.push([mesh.pos[i], mesh.pos[i + 1], mesh.pos[i + 2]]);
        }
        tris.push([P, [mesh.col[i0], mesh.col[i0 + 1], mesh.col[i0 + 2]]]);
      }
      // Closest point on a triangle to p (Ericson, Real-Time Collision Detection
      // §5.1.5) — what "directly behind this decal" actually means on a surface
      // whose triangles are metres long.
      const sub3 = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
      const dot3 = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
      const closestPt = (p, a, b, c) => {
        const ab = sub3(b, a), ac = sub3(c, a), ap = sub3(p, a);
        const d1 = dot3(ab, ap), d2 = dot3(ac, ap);
        if (d1 <= 0 && d2 <= 0) return a;
        const bp = sub3(p, b), d3 = dot3(ab, bp), d4 = dot3(ac, bp);
        if (d3 >= 0 && d4 <= d3) return b;
        const vc = d1 * d4 - d3 * d2;
        if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0]+ab[0]*v, a[1]+ab[1]*v, a[2]+ab[2]*v]; }
        const cp = sub3(p, c), d5 = dot3(ab, cp), d6 = dot3(ac, cp);
        if (d6 >= 0 && d5 <= d6) return c;
        const vb = d5 * d2 - d1 * d6;
        if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0]+ac[0]*w, a[1]+ac[1]*w, a[2]+ac[2]*w]; }
        const va = d3 * d6 - d5 * d4;
        if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
          const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
          return [b[0]+(c[0]-b[0])*w, b[1]+(c[1]-b[1])*w, b[2]+(c[2]-b[2])*w];
        }
        const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
        return [a[0]+ab[0]*v+ac[0]*w, a[1]+ab[1]*v+ac[1]*w, a[2]+ab[2]*v+ac[2]*w];
      };
      const data = CarMesh.carDecalData(2, null, false, "ferrari");
      const R = LiveryTex.REGIONS, S = LiveryTex.SIZE, SH = LiveryTex.SIZE_H || S;
      const regionOfUv = (u, v) => {
        for (const [name, r] of Object.entries(R)) {
          const uL = r.x / S, uR = (r.x + r.w) / S;
          const vB = 1 - (r.y + r.h) / SH, vT = 1 - r.y / SH;
          if (u >= uL - 1e-6 && u <= uR + 1e-6 && v >= vB - 1e-6 && v <= vT + 1e-6) return name;
        }
        return null;
      };
      // For each decal quad: centroid, normal, region.
      const found = {};
      for (let q = 0; q < data.pos.length / 3; q += 4) {
        let cx = 0, cy = 0, cz = 0;
        for (let k = 0; k < 4; k++) {
          cx += data.pos[(q + k) * 3]; cy += data.pos[(q + k) * 3 + 1]; cz += data.pos[(q + k) * 3 + 2];
        }
        cx /= 4; cy /= 4; cz /= 4;
        const n = [data.nrm[q * 3], data.nrm[q * 3 + 1], data.nrm[q * 3 + 2]];
        const region = regionOfUv(data.uv[q * 2], data.uv[q * 2 + 1]);
        if (!region) continue;
        // Sample ACROSS the quad, not just at its centre. The shark fin stands up
        // through the middle of the engine-cover crest, so a single centre sample
        // reports the fin (c2) for a mark that is overwhelmingly on the cover (c1).
        const corners = [];
        for (let k = 0; k < 4; k++) {
          corners.push([data.pos[(q + k) * 3], data.pos[(q + k) * 3 + 1], data.pos[(q + k) * 3 + 2]]);
        }
        const samples = [[cx, cy, cz]];
        for (const c of corners) {
          samples.push([cx + (c[0] - cx) * 0.6, cy + (c[1] - cy) * 0.6, cz + (c[2] - cz) * 0.6]);
        }
        // Find the FIRST painted surface behind the decal. A fixed step-back
        // overshoots: the sponsor board sits ~2 mm behind its wordmark and is
        // only 16 mm thick, so stepping 30 mm lands inside the pod skin and
        // reports the body paint instead of the board. Instead, measure each
        // candidate's depth ALONG the decal normal and keep the shallowest one
        // that is actually behind the quad and close to it laterally.
        const votes = {};
        let best = null, bestDepth = Infinity;
        for (const [sx, sy, sz] of samples) {
        let sBest = null, sDepth = Infinity;
        for (const [P, col] of tris) {
          const name = nameOf(col);
          if (!name) continue;
          const q = closestPt([sx, sy, sz], P[0], P[1], P[2]);
          const dx = q[0] - sx, dy = q[1] - sy, dz = q[2] - sz;
          const depth = -(dx * n[0] + dy * n[1] + dz * n[2]);   // + = behind
          if (depth < -0.002 || depth > 0.06) continue;
          const lat = Math.sqrt(Math.max(0,
            dx*dx + dy*dy + dz*dz - depth * depth));
          // Tight: only surfaces genuinely UNDER this sample. At 0.16 the probe
          // accepted the accent flash 10 cm up the flank simply because it sits
          // prouder than the board directly behind the mark; at 0.06, now that
          // the search is over whole triangles rather than their centroids, the
          // sponsor board's lower EDGE reaches the strip two bands below it.
          // A backing is what the mark lands on, not what it is next to.
          if (lat > 0.02) continue;
          if (depth < sDepth) { sDepth = depth; sBest = name; }
        }
        if (sBest) {
          votes[sBest] = (votes[sBest] || 0) + 1;
          if (sDepth < bestDepth) bestDepth = sDepth;
        }
        }
        // Majority across the samples — the surface the mark mostly sits on.
        for (const [k, v] of Object.entries(votes)) {
          if (!best || v > votes[best]) best = k;
        }
        if (!best) continue;
        // Keep the DOMINANT backing per region — the surface sitting closest
        // behind the mark. A band's edge quads can clip a neighbouring surface,
        // and demanding a single answer for every sliver makes the probe brittle
        // without making it more truthful.
        const cur = found[region];
        if (!cur || bestDepth < cur.depth) found[region] = { slot: best, depth: bestDepth };
      }
      return Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.slot]));
    });
    // What buildAtlas inks each region for. If the geometry moves, this fails
    // and names the region rather than shipping an invisible mark.
    const INKED_FOR = {
      // the shark fin rises through the cover crest, so that mark spans both
      // The fin plate is painted `fin`, which defaults to c2.
      // `fin` carries only the abstract tail WASH, and its panel spans the
      // whole swept fin — whose base runs a few cm above the engine-cover
      // spine, where the accent pinstripe lives. So like the cover crest it
      // genuinely sits on two paints. That is fine here and only here: the wash
      // has no legibility requirement (its edges are faded to transparent
      // exactly where the trim is), and the MOTIF — the mark that has to read —
      // lives on `finBadge`, an upright square wholly on the fin's own paint.
      crest: ["c1", "c2"], fin: ["c2", "accent"], finBadge: ["c2"], wing: ["wing"],
      // the front-wing endplate is painted c2 (car3d's front-plate span), and
      // buildAtlas inks the partner mark with inkOn([c2]) for exactly that.
      fwEnd: ["c2"],
      titleA: ["board"], strip: ["c2"],
      // titleB is NOT on the sidepod board — car-mesh drapes it over the
      // monocoque TOP (z 1.16..1.66), body paint, with the c2 nose accent
      // reaching under its front edge. Inking it for the board resolved DARK
      // against a pale panel it never touches: 1.02:1 on Mercedes and on every
      // near-black c1, with no halo, because haloIf scored the board too.
      titleB: ["c1", "c2"],
      // the c2 crown stripe runs under the nose number
      num: ["c1", "c2"],
      // the SPINE SIDE band hangs on the engine-cover flank, body paint only;
      // buildAtlas inks it with inkCrest (the cover's ink) for exactly that.
      // the WHOLE flank now, crease to sidepod line — the accent pinstripe
      // runs across it aft of the mark, like the fin's base pinstripe
      spineSide: ["c1", "accent"],
      spineSideL: ["c1", "accent"],
      // the tail strip drapes the cover behind the crest, shoulder to shoulder,
      // and the accent pinstripe runs just under its shoulder edge — so, like
      // the fin, it genuinely sits on two paints. Its only mark (the second
      // sponsor, "wordmark") is centred on the crown, wholly on c1.
      tail: ["c1", "accent"],
    };
    for (const [region, slot] of Object.entries(result)) {
      expect(INKED_FOR[region], `region ${region} has no declared ink background`).toBeDefined();
      expect(INKED_FOR[region],
        `${region} sits on "${slot}" but buildAtlas inks it for ${INKED_FOR[region].join("+")}`)
        .toContain(slot);
    }
    // The regions that historically broke must all be covered by the probe.
    // `wing` is deliberately NOT in this list: its backing surface is the top
    // rear plane, which ACTIVE AERO hoisted out of the baked body mesh so it can
    // rotate (Car3D.aeroFlaps / drawAeroFlaps). There is nothing behind the band
    // for a body-mesh probe to find, and demanding one here would only be
    // satisfiable by painting the band onto a surface that does not move with
    // it. The next test covers that region against the geometry it actually
    // sits on.
    // titleB joins the coverage list: it was mis-declared for four months and the
    // probe never had to find it, so nothing failed.
    for (const r of ["fin", "titleA", "titleB"]) {
      expect(Object.keys(result), `probe never located region ${r}`).toContain(r);
    }
  });

  // The counterpart to the probe above, for the one region the probe cannot see.
  // The old guarantee — "this mark sits on a real painted surface" — still has to
  // hold for the wing band; the surface just lives in the ACTIVE AERO element
  // list now instead of the body mesh.
  //
  // This used to measure the band against each element's axis-aligned BOUNDING
  // BOX and reported 0. It was wrong by ~90 mm the whole time: the flaps are
  // hung at 0.34 rad, which makes that box tall enough to swallow a band
  // floating clean off the skin. Measure the SURFACE — the same thing
  // tests/unit/livery-decal-surfaces.test.mjs does against the shipped modules,
  // repeated here against a real browser's copy of them.
  test("the wing sponsor band sits on the rear flap it is painted for", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const data = CarMesh.carDecalData(2, null, false, "ferrari");
      const R = LiveryTex.REGIONS, S = LiveryTex.SIZE, SH = LiveryTex.SIZE_H || S;
      const uL = R.wing.x / S, uR = (R.wing.x + R.wing.w) / S;
      const vB = 1 - (R.wing.y + R.wing.h) / SH, vT = 1 - R.wing.y / SH;
      const band = [];
      for (let q = 0; q < data.pos.length / 3; q++) {
        const u = data.uv[q * 2], v = data.uv[q * 2 + 1];
        if (u < uL - 1e-6 || u > uR + 1e-6 || v < vB - 1e-6 || v > vT + 1e-6) continue;
        band.push([data.pos[q * 3], data.pos[q * 3 + 1], data.pos[q * 3 + 2]]);
      }
      // The rear elements at their REST pose — exactly what drawAeroFlaps hangs
      // them at with blend 0.
      const tris = [];
      let top = null;
      for (const fg of Car3D.aeroFlaps(2, null)) {
        if (fg.wing !== "rear") continue;
        top = fg;
        const g = Car3D.buildFlapGeom(fg, [1, 1, 1]);
        const ca = Math.cos(fg.zAngle), sa = Math.sin(fg.zAngle);
        const P = [];
        for (let p = 0; p < g.pos.length; p += 3) {
          P.push([g.pos[p],
                  g.pos[p + 1] * ca - g.pos[p + 2] * sa + fg.y,
                  g.pos[p + 1] * sa + g.pos[p + 2] * ca + fg.z]);
        }
        for (let i = 0; i + 2 < g.idx.length; i += 3) tris.push([P[g.idx[i]], P[g.idx[i + 1]], P[g.idx[i + 2]]]);
      }
      // Point → triangle distance (Ericson §5.1.5).
      const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const len = (a) => Math.sqrt(dot(a, a));
      const ptTri = (p, a, b, c) => {
        const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
        const d1 = dot(ab, ap), d2 = dot(ac, ap);
        if (d1 <= 0 && d2 <= 0) return len(ap);
        const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
        if (d3 >= 0 && d4 <= d3) return len(bp);
        const vc = d1 * d4 - d3 * d2;
        if (vc <= 0 && d1 >= 0 && d3 <= 0) { const t = d1 / (d1 - d3); return len(sub(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t])); }
        const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
        if (d6 >= 0 && d5 <= d6) return len(cp);
        const vb = d5 * d2 - d1 * d6;
        if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return len(sub(p, [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w])); }
        const va = d3 * d6 - d5 * d4;
        if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
          const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
          return len(sub(p, [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]));
        }
        const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        const nl = len(n);
        return nl < 1e-12 ? len(ap) : Math.abs(dot(n, ap)) / nl;
      };
      let worst = 0;
      for (const p of band) {
        let best = Infinity;
        for (const T of tris) { const d = ptTri(p, T[0], T[1], T[2]); if (d < best) best = d; }
        if (best > worst) worst = best;
      }
      const B = Car3D.wingBand(2, null);
      return { corners: band.length, tris: tris.length, worst, elem: B && B.elem, topId: top && top.id };
    });
    expect(r.corners, "no decal quad carries the wing region").toBeGreaterThanOrEqual(4);
    expect(r.tris, "no ACTIVE AERO rear elements to sit on").toBeGreaterThan(0);
    expect(r.elem, "the band is not on the topmost rear element").toBe(r.topId);
    // Measured ~5.6 mm: the design PROUD plus sub-millimetre sweep error. The
    // slack is for a taper/sweep retune, not for the band drifting onto air.
    expect(r.worst, "the wing sponsor band hangs off the flap it is painted on")
      .toBeLessThan(0.012);
  });

  // Free marks (brand table / authored logo) paint as selected — no 4.2 floor.
  // Derived marks still clear mark+halo at 4.2, matching crest-marks.
  test("derived team marks clear 4.2; free marks keep markBase", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(`(() => {
      ${CONTRAST_FN}
      const bad = [];
      let scored = 0, freeN = 0, derivedN = 0;
      for (const team of Teams.LIST) {
        for (const liv of Liveries.forTeam(team)) {
          const cases = [
            ["cover", [liv.c1, liv.c2], false],
            ["badge", [liv.fin || liv.c2], true],
          ];
          for (const [name, fields, bare] of cases) {
            const P = LiveryTex.markPalette(team.id, liv, fields, bare);
            const base = LiveryTex.markBase(team.id, liv);
            const under = P.under || (P.plate ? [P.plate] : fields.filter(Boolean));
            scored++;
            if (P.freeMark || P.brandPair) {
              freeN++;
              if (!P.mark.every((v, i) => Math.abs(v - base[i]) < 1e-6))
                bad.push(team.id + "/" + liv.id + ":" + name + ":free");
            } else {
              derivedN++;
              for (const bg of under) {
                const covered = Math.max(ratio(P.mark, bg), P.halo ? ratio(P.halo, bg) : 0);
                if (covered < 4.2) bad.push(team.id + "/" + liv.id + ":" + name + ":" + covered.toFixed(2));
              }
            }
          }
        }
      }
      return { bad, scored, freeN, derivedN };
    })()`);
    expect(result.scored).toBeGreaterThan(300);
    expect(result.freeN).toBeGreaterThan(0);
    expect(result.bad, "a team mark was overruled or an unreadible derived mark shipped").toEqual([]);
  });

  test("the wing sponsor band is mapped onto geometry, not drawn into nothing", async ({ page }) => {
    await load(page);
    const hit = await page.evaluate(() => {
      const R = LiveryTex.REGIONS, S = LiveryTex.SIZE, SH = LiveryTex.SIZE_H || S;
      const data = CarMesh.carDecalData(2, null, false, "ferrari");
      const uL = R.wing.x / S, uR = (R.wing.x + R.wing.w) / S;
      const vB = 1 - (R.wing.y + R.wing.h) / SH, vT = 1 - R.wing.y / SH;
      let inRegion = 0;
      for (let i = 0; i < data.uv.length; i += 2) {
        const u = data.uv[i], v = data.uv[i + 1];
        if (u >= uL - 1e-6 && u <= uR + 1e-6 && v >= vB - 1e-6 && v <= vT + 1e-6) inRegion++;
      }
      return inRegion;
    });
    expect(hit, "no decal vertex samples the wing region").toBeGreaterThanOrEqual(4);
  });
});
