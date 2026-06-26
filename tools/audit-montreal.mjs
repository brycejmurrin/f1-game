/* Comprehensive Montreal audit — 6 camera types × many positions.
   node tools/audit-montreal.mjs [outdir] */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const outdir = process.argv[2] || "/tmp/claude-0/-home-user-f1-game/948d3bdd-9d85-501e-94e5-40b57d4094b5/scratchpad/audit-montreal";
fs.mkdirSync(outdir, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", e => console.error("PAGE ERR:", e));

await page.goto("http://localhost:3456/index.html", { waitUntil: "load" });
await page.evaluate(() => new Promise(r => {
  const t = setInterval(() => { if (window.__apex) { clearInterval(t); r(); } }, 50);
}));
await page.evaluate(() => window.__apex.race("montreal"));
await page.waitForTimeout(2800);
await page.evaluate(() => window.__apex.hud(false));

const shot = async (name) => {
  await page.waitForTimeout(320);
  await page.screenshot({ path: path.join(outdir, name) });
  console.log(name);
};

// ── 1. TOPDOWN overview ──────────────────────────────────────────────────────
await page.evaluate(() => window.__apex.topdown());
await shot("00-topdown.png");

// ── 2. ORBIT tour — 24 evenly spaced, high (el=28) to see island + water ───
const shots = await page.evaluate(() => window.__apex.tourShots(24, { dist: 110, el: 28 }));
for (let i = 0; i < shots.length; i++) {
  const s = shots[i];
  await page.evaluate((s) => { window.__apex.orbit(s.frac, s.az, s.el, s.dist); window.__apex.hud(false); }, s);
  const deg = String(Math.round(s.frac * 360)).padStart(3, "0");
  await shot(`01-orb-${String(i).padStart(2,"0")}-${deg}d.png`);
}

// ── 3. CHASE tour — forward view all the way round ──────────────────────────
for (let i = 0; i < 18; i++) {
  const frac = i / 18;
  await page.evaluate((f) => { window.__apex.chase(f, { back: 18, up: 4, ahead: 40 }); window.__apex.hud(false); }, frac);
  await shot(`02-chase-${String(i).padStart(2,"0")}.png`);
}

// ── 4. ROADSIDE — eye level views, 12 pts each side ─────────────────────────
const rsShots = await page.evaluate(() => window.__apex.roadsideTour(18, { dist: 10, h: 2, look: "in" }));
for (let i = 0; i < rsShots.length; i++) {
  const s = rsShots[i];
  await page.evaluate((s) => { window.__apex.roadside(s.frac, s.side, s.dist, s.h, { look: s.look }); window.__apex.hud(false); }, s);
  await shot(`03-roadside-${s.label}.png`);
}

// ── 5. KEY SPOTS — specific problem areas ───────────────────────────────────
const keySpots = [
  // pit straight both sides
  { name: "pit-R-outside",  f: () => window.__apex.orbit(0.99, 90, 12, 80) },
  { name: "pit-L-outside",  f: () => window.__apex.orbit(0.99, -90, 12, 80) },
  // island shoreline mid-point
  { name: "shore-mid-R",    f: () => window.__apex.orbit(0.5, 90, 10, 100) },
  { name: "shore-mid-L",    f: () => window.__apex.orbit(0.5, -90, 10, 100) },
  // La Ronde + Biosphère side
  { name: "biosphere-view", f: () => window.__apex.orbit(0.30, -35, 18, 240) },
  { name: "laronde-view",   f: () => window.__apex.orbit(0.42, 35, 18, 240) },
  // Hairpin (L'Épingle) — tight corner, check for floating/grounding
  { name: "hairpin-above",  f: () => window.__apex.orbit(0.55, 0, 55, 70) },
  { name: "hairpin-chase",  f: () => window.__apex.chase(0.52, { back: 14, up: 3, ahead: 30 }) },
  // Casino corner
  { name: "casino-above",   f: () => window.__apex.orbit(0.26, 0, 50, 90) },
  { name: "casino-chase",   f: () => window.__apex.chase(0.24, { back: 14, up: 3, ahead: 30 }) },
  // Wall of Champions
  { name: "woc-chase",      f: () => window.__apex.chase(0.96, { back: 12, up: 2.5, ahead: 35 }) },
  { name: "woc-outside",    f: () => window.__apex.orbit(0.97, 90, 10, 60) },
  // Trees check — right forest edge of island
  { name: "trees-R",        f: () => window.__apex.roadside(0.30, 1, 14, 2.5, { look: "out" }) },
  { name: "trees-L",        f: () => window.__apex.roadside(0.30, -1, 14, 2.5, { look: "out" }) },
  // Basin / Olympic rowing
  { name: "basin-view",     f: () => window.__apex.orbit(0.12, -35, 18, 120) },
  // Inner lagoon
  { name: "lagoon-above",   f: () => window.__apex.orbit(0.65, 0, 60, 90) },
];
for (const sp of keySpots) {
  await page.evaluate(sp.f);
  await shot(`04-key-${sp.name}.png`);
}

// ── 6. EYE-LEVEL driver's eye around the full lap ───────────────────────────
for (let i = 0; i < 12; i++) {
  const frac = i / 12;
  await page.evaluate((f) => { window.__apex.eyeAt(f, 0, 1.8, f + 0.02, 0, 1.2); window.__apex.hud(false); }, frac);
  await shot(`05-eye-${String(i).padStart(2,"0")}.png`);
}

await browser.close();
console.log("DONE — shots in", outdir);
