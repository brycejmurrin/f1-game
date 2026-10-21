// B·H12 bit-identity A/B: the same seeded sequence (monza -> spa -> suzuka, each a fresh race(), reset seed 42,
// throttle + light steer, N steps) on a root, digested after each track.
//   VM:      every own numeric field of every G.cars entry, raw (no rounding) — FNV-1a over Number.prototype.toString.
//   browser: JSON of __apex.fieldState() every 100 steps (rounded fields; divergence still grows over steps).
// usage: node scratch/h12/digest.mjs --root <dir> [--steps 3000] [--mode vm|browser]
import { createRequire } from "node:module";
import { resolve } from "node:path";
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = resolve(arg("root", ".")), STEPS = +arg("steps", 3000), MODE = arg("mode", "vm");
const TRACKS = ["monza", "spa", "suzuka"];

function fnv(h, str) { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }

if (MODE === "vm") {
  const require = createRequire(import.meta.url);
  const { createGame } = require(resolve(ROOT, "tools/lib/game-vm.cjs"));
  const g = await createGame({ track: TRACKS[0] });
  const out = [];
  try {
    for (const t of TRACKS) {
      await g.race(t);
      const A = g.apex; A.go(); A.headless(true); A.reset(0.02, 55, 0, 42); A.setInput({ throttle: true, steer: 0.02 });
      let h = 0x811c9dc5;
      for (let i = 0; i < STEPS; i += 10) {
        A.step(1 / 60, 10);
        if ((i / 10) % 10 === 0) for (const c of g.G.cars) for (const k of Object.keys(c).sort()) { const v = c[k]; if (typeof v === "number") h = fnv(h, k + "=" + v.toString() + ";"); }
      }
      A.headless(false);
      out.push(`${t}:${h.toString(16)}:${g.G.cars.length}cars`);
    }
  } finally { g.close(); }
  console.log("= digest vm " + out.join(" "));
} else {
  const { startStaticServer, launchChromium, shutdown } = await import("../../tools/lib/harness.mjs");
  const srv = await startStaticServer(ROOT);
  const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--disable-background-timer-throttling"] });
  const out = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
    await ctx.addInitScript(() => { window.__TEST_MODE = true; });
    await ctx.route("https://api.jolpi.ca/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await ctx.route("https://api.openf1.org/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    const page = await ctx.newPage();
    await page.goto(srv.url);
    await page.waitForFunction(() => window.__apex && window.__apex.info, null, { timeout: 180000, polling: 200 });
    for (const t of TRACKS) {
      await page.evaluate((tid) => { window.__apex.race(tid); }, t);
      await page.waitForFunction((tid) => { const i = window.__apex.info(); return i.track === tid && (i.state === "race" || i.state === "count"); }, t, { timeout: 300000, polling: 200 });
      const h = await page.evaluate((n) => {
        const A = window.__apex; A.go(); A.headless(true); A.reset(0.02, 55, 0, 42); A.setInput({ throttle: true, steer: 0.02 });
        let h = 0x811c9dc5;
        const fnv = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } };
        for (let i = 0; i < n; i += 10) { A.step(1 / 60, 10); if ((i / 10) % 10 === 0) fnv(JSON.stringify(A.fieldState())); }
        fnv(JSON.stringify(A.fieldState())); A.headless(false);
        return h.toString(16) + ":" + A.fieldState().length + "cars";
      }, STEPS);
      out.push(`${t}:${h}`);
    }
  } finally { await shutdown(); }
  console.log("= digest browser " + out.join(" "));
}
