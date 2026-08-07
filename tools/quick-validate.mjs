// Quick refactor gate — loads the game headless ONCE and probes the critical
// paths end-to-end in ~30-60s, with zero test-runner overhead:
//   page loads with no console errors / page errors,
//   __apex + the named page globals exist,
//   a race starts, physics steps, telemetry + lighting probes respond.
// Usage: node tools/quick-validate.mjs [port]     (default 3477)
// NOTE: playwright/child_process are imported lazily inside main() so that
// tests/unit/quick-validate.test.mjs can import the pure helpers below without
// pulling in (or depending on the availability of) the whole playwright
// package — a heavy, environment-sensitive import the helpers never use.
import { fileURLToPath } from "node:url";

export function probeFailures(probe, errors) {
  const missing = Object.entries(probe.globals).filter(([, ok]) => !ok).map(([key]) => key);
  const fails = [];
  if (missing.length) fails.push("missing globals: " + missing.join(", "));
  if (!probe.race) fails.push("race() failed");
  if (!probe.obs) fails.push("probe() invalid after race+step");
  if (!probe.light) fails.push("lightState() invalid");
  if (!probe.cams) fails.push("camera() failed");
  if (errors.length) fails.push(...errors.slice(0, 5));
  return fails;
}

export function evaluateLiveProbe(
  apex = globalThis.__apex,
  hasGlobal = (name) => typeof globalThis[name] !== "undefined" ||
    (() => { try { return (0, eval)(`typeof ${name}`) !== "undefined"; } catch { return false; } })(),
) {
  const out = { globals: {}, race: null, obs: null, light: null, cams: null };
  for (const name of ["GLX", "Tracks", "Parts", "Teams", "CircuitPaths", "GLXShaders",
                      "TrackGeom", "TrackSceneryData", "GameTables"]) {
    out.globals[name] = hasGlobal(name);
  }
  out.race = apex.race("monza");
  apex.jump(0.3, 50, 0);
  apex.step(1 / 60, 30);
  const observation = apex.probe();
  out.obs = !!observation && Number.isFinite(observation.speed) && Number.isFinite(observation.s);
  const light = apex.lightState();
  out.light = !!light && Number.isFinite(light.exposure ?? light.numLights);
  out.cams = !!apex.camera("cockpit");
  return out;
}

async function main() {
 const [{ chromium }, { spawn }] = await Promise.all([
   import("playwright"),
   import("node:child_process"),
 ]);
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

  const probe = await page.evaluate(evaluateLiveProbe);

  const fails = probeFailures(probe, errors);

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
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
