// Top-down + high-oblique aerial survey of ONE circuit, for spotting floor gaps,
// floating models, terrain holes, and props sitting off the ground.
// Usage: TRACK=monaco PORT=3510 node tools/aerial-survey.mjs [label]
// Writes to scratch/captures/aerial-survey/<track>/:
//   <label>-topdown.png        straight-down plan view of the whole circuit
//   <label>-obliqueN/E/S/W.png four high oblique aerials (45° elevation) — these
//                              reveal vertical gaps (a prop hovering, a void under
//                              the city) that a pure top-down flattens away.
// Self-boots its own http.server + preinstalled Chromium. Prints the trackBounds
// so an agent can reason about scale.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  assertSafePathToken,
  resolveContainedChild,
  resolveRepoDefault,
} from "./output-paths.mjs";

const TRACK = process.env.TRACK;
const PORT = +(process.env.PORT || 3510);
const LABEL = assertSafePathToken(process.argv[2] || "survey", "label");
if (!TRACK) { console.error("set TRACK=<id>"); process.exit(2); }
const safeTrack = assertSafePathToken(TRACK, "track id");

const CHROME = process.env.CHROME ||
  "/Users/bmurrin/Library/Caches/ms-playwright/chromium-1179/chrome-mac/Chromium.app/Contents/MacOS/Chromium";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = resolveRepoDefault(ROOT, "scratch", "captures", "aerial-survey", safeTrack);
mkdirSync(OUT, { recursive: true });

const srv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: ROOT, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));

try {
  const b = await chromium.launch({ executablePath: CHROME, args: ["--use-angle=swiftshader"] });
  const p = await b.newPage({ viewport: { width: 1100, height: 780 } });
  await p.goto(`http://localhost:${PORT}/`);
  await p.waitForFunction(() => window.__apex?.race, null, { timeout: 30000 });
  await p.evaluate((t) => __apex.race(t, "day", "dry"), safeTrack);
  await p.waitForFunction(() => __apex.info().track != null, null, { timeout: 30000 });
  await p.evaluate(() => __apex.hud(false));
  await p.waitForTimeout(1200);

  const bounds = await p.evaluate(() => __apex.trackBounds());
  console.log(`bounds ${safeTrack}: ${JSON.stringify(bounds)}`);
  const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
  const cy = bounds.minY != null ? bounds.minY : 0;
  const span = Math.max(bounds.spanX, bounds.spanZ);

  // 1) straight-down plan view — fits the whole circuit; catches gaps in the floor
  //    (a hole reads as sky/void), the ribbon vs slab seam, and stray infield props.
  await p.evaluate(({ cx, cy, cz, span }) => {
    const vf = 60 * Math.PI / 180, aspect = window.innerWidth / window.innerHeight;
    const altZ = (span / 2) / Math.tan(vf / 2);
    const altX = (span / 2) / Math.tan(Math.atan(Math.tan(vf / 2) * aspect));
    const alt = Math.ceil(Math.max(altZ, altX) * 1.18);
    __apex.view({ eye: [cx, cy + alt, cz + 0.1], target: [cx, cy, cz] });
  }, { cx, cy, cz, span });
  await p.waitForTimeout(500);
  await p.screenshot({
    path: resolveContainedChild(OUT, `${LABEL}-topdown.png`, "aerial topdown path"),
    timeout: 60000,
  });

  // 2) four high oblique aerials (45° elevation) from N/E/S/W — the vertical angle
  //    exposes FLOATING models (a shadow gap under them) and voids the top-down hides.
  const dist = Math.ceil(span * 0.85);
  const el = 42 * Math.PI / 180;
  const dirs = { N: 0, E: Math.PI / 2, S: Math.PI, W: 3 * Math.PI / 2 };
  for (const [name, az] of Object.entries(dirs)) {
    await p.evaluate(({ cx, cy, cz, dist, el, az }) => {
      const h = Math.sin(el) * dist, r = Math.cos(el) * dist;
      const ex = cx + Math.sin(az) * r, ez = cz + Math.cos(az) * r;
      __apex.view({ eye: [ex, cy + h + 20, ez], target: [cx, cy + 5, cz] });
    }, { cx, cy, cz, dist, el, az });
    await p.waitForTimeout(400);
    await p.screenshot({
      path: resolveContainedChild(
        OUT,
        `${LABEL}-oblique${name}.png`,
        "aerial oblique path"
      ),
      timeout: 60000,
    });
  }

  await b.close();
  console.log(`wrote ${OUT}/${LABEL}-{topdown,obliqueN,obliqueE,obliqueS,obliqueW}.png`);
} catch (e) {
  console.error("aerial-survey error:", e && e.message || e);
} finally { try { srv.kill("SIGKILL"); } catch (_) {} }
