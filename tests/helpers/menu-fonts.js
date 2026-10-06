// @ts-check
/**
 * Title/select/garage identity shots need the used Titillium face, not system-ui.
 * css/fonts-hud.css is print→all (#1101). document.fonts.load('700 … Titillium')
 * can resolve from the title-critical 600 face while 700-normal is still swap —
 * CI 37459018234 desktop title 0.09 / select 0.04 / garage 0.03 (phone 3/3 passed).
 */

/**
 * @param {import("@playwright/test").Page} page
 * @param {number} [timeout]
 */
export async function waitMenuFonts(page, timeout = 15000) {
  await page.evaluate(() => {
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
      if (link.media === "print") link.media = "all";
    }
  });
  await page.waitForFunction(() => {
    const need = ["fonts-hud.css", "select.css", "carsetup.css"];
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
    return need.every((frag) => {
      const l = links.find((x) => (x.getAttribute("href") || "").includes(frag));
      return !!(l && l.media === "all" && l.sheet);
    });
  }, null, { polling: 100, timeout });
  await page.evaluate(async () => {
    const specs = [
      ["normal", "600", "titillium-web-latin-600-normal.woff2"],
      ["italic", "700", "titillium-web-latin-700-italic.woff2"],
      ["normal", "700", "titillium-web-latin-700-normal.woff2"],
    ];
    for (const [style, weight, file] of specs) {
      const face = new FontFace(
        "Titillium Web",
        `url("assets/fonts/${file}")`,
        { style, weight, display: "swap" },
      );
      document.fonts.add(await face.load());
    }
  });
  await page.waitForFunction(() => {
    if (!document.fonts) return true;
    const faces = [...document.fonts];
    const loaded = (style, weight) => faces.some((f) => {
      const fam = String(f.family).replace(/["']/g, "");
      return fam === "Titillium Web"
        && String(f.weight) === String(weight)
        && f.style === style
        && f.status === "loaded";
    });
    if (!loaded("italic", 700) || !loaded("normal", 600) || !loaded("normal", 700)) {
      return false;
    }
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return true;
    const sample = "HOW TO PLAY RACE";
    ctx.font = '700 48px "Titillium Web"';
    const tit = ctx.measureText(sample).width;
    ctx.font = "700 48px Arial, sans-serif";
    const fb = ctx.measureText(sample).width;
    return Math.abs(tit - fb) > 2;
  }, null, { polling: 100, timeout });
}
