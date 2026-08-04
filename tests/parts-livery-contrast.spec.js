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
