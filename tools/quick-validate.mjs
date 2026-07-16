// Quick refactor gate — loads the game headless ONCE and probes the critical
// paths end-to-end in ~30-60s, with zero test-runner overhead:
//   page loads with no console errors / page errors,
//   __apex + the named page globals exist,
//   a race starts, physics steps, telemetry + lighting probes respond.
// Usage: node tools/quick-validate.mjs [port]     (default 3477)
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PORT = Number(process.argv[2] || 3477);
const srv = spawn("python3", ["-m", "http.server", String(PORT)], { stdio: "ignore" });
const errors = [];
let browser;
try {
  await new Promise((r) => setTimeout(r, 800));
  const EXEC = process.env.PW_CHROMIUM;  // unset → Playwright's bundled chromium
  browser = await chromium.launch({
    ...(EXEC ? { executablePath: EXEC } : {}),
    args: ["--use-angle=swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__apex != null, { timeout: 30000 });

  const probe = await page.evaluate(() => {
    const out = { globals: {}, race: null, obs: null, light: null, cams: null };
    // the named page-scope globals tests + tools rely on
    for (const g of ["GLX", "Tracks", "Parts", "Teams", "CircuitPaths", "GLXShaders",
                     "TrackGeom", "TrackSceneryData", "GameTables"])
      out.globals[g] = typeof window[g] !== "undefined" || (() => { try { return eval(`typeof ${g}`) !== "undefined"; } catch { return false; } })();
    out.race = __apex.race("monza");
    __apex.jump(0.3, 50, 0);
    __apex.step(1 / 60, 30);
    const p = __apex.probe();
    out.obs = p && Number.isFinite(p.speed) && Number.isFinite(p.s);
    const ls = __apex.lightState();
    out.light = ls && Number.isFinite(ls.exposure ?? ls.numLights);
    out.cams = __apex.camera("cockpit") !== undefined;
    return out;
  });

  const missing = Object.entries(probe.globals).filter(([, ok]) => !ok).map(([k]) => k);
  const fails = [];
  if (missing.length) fails.push("missing globals: " + missing.join(", "));
  if (!probe.obs) fails.push("probe() invalid after race+step");
  if (!probe.light) fails.push("lightState() invalid");
  if (errors.length) fails.push(...errors.slice(0, 5));

  if (fails.length) {
    console.error("QUICK-VALIDATE FAIL:\n  " + fails.join("\n  "));
    process.exitCode = 1;
  } else {
    console.log("QUICK-VALIDATE OK: page clean, globals present, race+physics+lighting probes good");
  }
} catch (e) {
  console.error("QUICK-VALIDATE ERROR:", e.message);
  if (errors.length) console.error("  " + errors.slice(0, 5).join("\n  "));
  process.exitCode = 1;
} finally {
  await browser?.close();
  srv.kill();
}
