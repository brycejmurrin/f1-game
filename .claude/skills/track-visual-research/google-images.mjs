/* Visual research helper: search Google, open the Images results, and capture a
 * scrolling series of screenshots so the caller can READ them as reference.
 *
 *   node google-images.mjs "<query>" <outdir> [scrolls]
 *
 * Routes through the environment's HTTPS proxy. Saves <outdir>/<slug>-NN.png and
 * prints a JSON summary (files + any errors). Designed for headless reference
 * gathering — not for interacting with accounts.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const query = process.argv[2];
const outdir = process.argv[3];
const scrolls = parseInt(process.argv[4] || "5", 10);
if (!query || !outdir) {
  console.log('usage: node google-images.mjs "<query>" <outdir> [scrolls]');
  process.exit(1);
}
fs.mkdirSync(outdir, { recursive: true });
const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || null;
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const launchOpts = {
  executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
};
if (PROXY) launchOpts.proxy = { server: PROXY };

const out = { query, slug, files: [], errors: [], note: "" };
let browser;
try {
  browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true, // trust the sanctioned MITM proxy cert for this research browser
    viewport: { width: 1366, height: 1024 },
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "en-US",
  });
  // Pre-seed consent cookies so the EU consent interstitial is skipped.
  await ctx.addCookies([
    { name: "CONSENT", value: "YES+cb", domain: ".google.com", path: "/" },
    { name: "SOCS", value: "CAESHAgBEhIaAB", domain: ".google.com", path: "/" },
  ]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);

  // Try search engines in order; use whichever the egress policy permits.
  // ENGINE env (google|bing|duckduckgo) forces one; default tries all.
  const ENGINES = {
    google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=isch&hl=en&gl=us&safe=off`,
    bing: (q) => `https://www.bing.com/images/search?q=${encodeURIComponent(q)}&safesearch=off`,
    duckduckgo: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`,
  };
  const order = process.env.ENGINE ? [process.env.ENGINE] : ["google", "bing", "duckduckgo"];
  let landed = false;
  for (const eng of order) {
    try {
      await page.goto(ENGINES[eng](query), { waitUntil: "domcontentloaded", timeout: 30000 });
      out.note = `engine=${eng}`;
      landed = true;
      break;
    } catch (e) {
      out.errors.push(`${eng}: ${String(e && e.message ? e.message : e).split("\n")[0]}`);
    }
  }
  if (!landed) throw new Error("no reachable search engine (egress policy likely blocks them)");

  // Dismiss a consent dialog if one still appears.
  for (const label of ["Accept all", "Reject all", "I agree", "Tout accepter", "Alle akzeptieren", "Got it"]) {
    try {
      const btn = page.getByRole("button", { name: label });
      if (await btn.count()) { await btn.first().click({ timeout: 4000 }); break; }
    } catch {}
  }
  await page.waitForTimeout(2500);

  // Confirm we actually landed on an image grid (some thumbnails present).
  const imgCount = await page.evaluate(() => document.querySelectorAll("img").length);
  out.note = `images on page: ${imgCount}`;
  if (imgCount < 5) {
    out.errors.push("few/no images — possible consent wall, captcha, or block");
    // capture whatever we got for diagnosis
    const f = path.join(outdir, `${slug}-debug.png`);
    await page.screenshot({ path: f, fullPage: false });
    out.files.push(f);
  } else {
    let i = 0;
    const shoot = async () => {
      const f = path.join(outdir, `${slug}-${String(i).padStart(2, "0")}.png`);
      await page.screenshot({ path: f, fullPage: false });
      out.files.push(f);
      i++;
    };
    await shoot();
    for (let s = 0; s < scrolls; s++) {
      await page.mouse.wheel(0, 950);
      await page.waitForTimeout(1400);
      await shoot();
    }
  }
  await ctx.close();
} catch (e) {
  out.errors.push(String(e && e.message ? e.message : e));
} finally {
  if (browser) await browser.close();
}
console.log(JSON.stringify(out, null, 2));
