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
import { test, expect } from "@playwright/test";

async function load(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });
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
      const liv = { c1: SENTINEL.c1, c2: SENTINEL.c2, pod: SENTINEL.pod,
                    wing: SENTINEL.wing, accent: SENTINEL.accent, nose: SENTINEL.nose };
      const mesh = Car3D.build(liv.c1, liv.c2, { livery: liv, teamId: "ferrari" });
      const board = Car3D.PANEL_COL;
      const near = (a, b) => Math.abs(a[0]-b[0]) < 0.02 && Math.abs(a[1]-b[1]) < 0.02
                          && Math.abs(a[2]-b[2]) < 0.02;
      const nameOf = (c) => {
        for (const k of Object.keys(SENTINEL)) if (near(c, SENTINEL[k])) return k;
        if (near(c, board)) return "board";
        return null;   // carbon / dark / metal furniture — not a paint slot
      };
      // Body triangles as centroid + colour, so a decal can look for what is
      // directly behind it.
      const tris = [];
      for (let t = 0; t < mesh.idx.length / 3; t++) {
        let cx = 0, cy = 0, cz = 0;
        const i0 = mesh.idx[t * 3] * 3;
        for (let k = 0; k < 3; k++) {
          const i = mesh.idx[t * 3 + k] * 3;
          cx += mesh.pos[i]; cy += mesh.pos[i + 1]; cz += mesh.pos[i + 2];
        }
        tris.push([cx / 3, cy / 3, cz / 3,
                   [mesh.col[i0], mesh.col[i0 + 1], mesh.col[i0 + 2]]]);
      }
      const data = CarMesh.carDecalData(2, null, false, "ferrari");
      const R = LiveryTex.REGIONS, S = LiveryTex.SIZE;
      const regionOfUv = (u, v) => {
        for (const [name, r] of Object.entries(R)) {
          const uL = r.x / S, uR = (r.x + r.w) / S;
          const vB = 1 - (r.y + r.h) / S, vT = 1 - r.y / S;
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
        for (const [tx, ty, tz, col] of tris) {
          const name = nameOf(col);
          if (!name) continue;
          const dx = tx - sx, dy = ty - sy, dz = tz - sz;
          const depth = -(dx * n[0] + dy * n[1] + dz * n[2]);   // + = behind
          if (depth < -0.002 || depth > 0.06) continue;
          const lat = Math.sqrt(Math.max(0,
            dx*dx + dy*dy + dz*dz - depth * depth));
          // Tight: only surfaces genuinely UNDER this quad. At 0.16 the probe
          // accepted the accent flash 10 cm up the flank simply because it sits
          // prouder than the board directly behind the mark.
          if (lat > 0.06) continue;
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
      // fin/finBadge: the fin plate is painted `fin`, which defaults to c2
      crest: ["c1", "c2"], fin: ["c2"], finBadge: ["c2"], wing: ["wing"],
      titleA: ["board"], titleB: ["board"], strip: ["c2"],
      // the c2 crown stripe runs under the nose number
      num: ["c1", "c2"],
    };
    for (const [region, slot] of Object.entries(result)) {
      expect(INKED_FOR[region], `region ${region} has no declared ink background`).toBeDefined();
      expect(INKED_FOR[region],
        `${region} sits on "${slot}" but buildAtlas inks it for ${INKED_FOR[region].join("+")}`)
        .toContain(slot);
    }
    // The regions that historically broke must all be covered by the probe.
    for (const r of ["fin", "wing", "titleA"]) {
      expect(Object.keys(result), `probe never located region ${r}`).toContain(r);
    }
  });

  test("the wing sponsor band is mapped onto geometry, not drawn into nothing", async ({ page }) => {
    await load(page);
    const hit = await page.evaluate(() => {
      const R = LiveryTex.REGIONS, S = LiveryTex.SIZE;
      const data = CarMesh.carDecalData(2, null, false, "ferrari");
      const uL = R.wing.x / S, uR = (R.wing.x + R.wing.w) / S;
      const vB = 1 - (R.wing.y + R.wing.h) / S, vT = 1 - R.wing.y / S;
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
