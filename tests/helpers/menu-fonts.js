// @ts-check
/**
 * Title/select/garage identity shots need Titillium, not system-ui.
 * css/fonts-hud.css is print→all deferred (#1101); 400/700-normal live there.
 * A screenshot before onload wraps DATA HUB / TRACK DESIGNER (desktop 0.09)
 * and the phone title grid (0.08).
 */

/**
 * @param {import("@playwright/test").Page} page
 * @param {number} [timeout]
 */
export async function waitMenuFonts(page, timeout = 15000) {
  await page.evaluate(async () => {
    const link = document.querySelector('link[href*="fonts-hud.css"]');
    if (link && link.media === "print") {
      await new Promise((res) => {
        const done = () => res();
        link.addEventListener("load", done, { once: true });
        link.addEventListener("error", done, { once: true });
        setTimeout(done, 5000);
      });
      link.media = "all";
    }
    if (document.fonts) {
      await document.fonts.ready;
      await document.fonts.load('400 16px "Titillium Web"');
      await document.fonts.load('600 16px "Titillium Web"');
      await document.fonts.load('700 16px "Titillium Web"');
    }
  });
  await page.waitForFunction(() => {
    if (!document.fonts) return true;
    return document.fonts.check('400 16px "Titillium Web"')
      && document.fonts.check('600 16px "Titillium Web"')
      && document.fonts.check('700 16px "Titillium Web"');
  }, null, { polling: 100, timeout });
}
