// @ts-check
import { test, expect, BOOT_MS } from "../../helpers/fixtures.js";

export default function register() {
  test("Zolder loads at the surveyed stripe with its track-owned landmarks", async ({ page, pageErrors }) => {
    test.setTimeout(180_000);
    await page.goto("/");
    await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.race("zolder", "day", "dry"));
    await page.waitForFunction(() => window.__apex.info().track === "zolder", null, { polling: 100, timeout: BOOT_MS });

    const audit = await page.evaluate(() => {
      const apex = window.__apex;
      const built = Tracks.LIST.find((track) => track.id === "zolder");
      const { emitted, invalid, suppressed, unsafe } = apex.modelDiagnostics();
      return {
        stripe: apex.nodeAt(0),
        first: apex.nodeAt(built.turns[0]),
        models: emitted.map(({ id }) => id),
        rejected: [...invalid, ...suppressed, ...unsafe].filter(({ required }) => required),
        geometry: apex.geometryDiagnostics(),
        pitSide: built.pit.side,
      };
    });

    expect(Math.hypot(audit.stripe.x - 128.36, audit.stripe.z + 151.64)).toBeLessThan(2);
    expect(audit.stripe.tx).toBeGreaterThan(0.8);
    expect(audit.stripe.tz).toBeLessThan(-0.5);
    // Named OSM way 399996027, Eerste Linkse, is the bend southwest of the stripe.
    expect(Math.hypot(audit.first.x - 367.6, audit.first.z + 327.3)).toBeLessThan(8);
    expect(audit.pitSide).toBe(1);
    expect(audit.geometry.length).toBeGreaterThan(0);
    expect(audit.geometry.every(({ ok }) => ok)).toBe(true);
    expect(audit.models).toEqual(expect.arrayContaining([
      "zolder-main-grandstand", "zolder-sf-museum", "zolder-villeneuve-poles", "zolder-sterrenwacht",
    ]));
    expect(audit.rejected).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
