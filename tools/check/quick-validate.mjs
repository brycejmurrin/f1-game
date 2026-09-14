// Quick refactor gate — loads the game headless ONCE and probes the critical
// @doc Fast refactor gate: boots the game once and probes the critical paths (globals, race, physics, lighting) in ~30-60 s.
// @skill check-changes
// Agent default is `node tools/ci/verify-change.mjs --fast` (check-changes).
// Keep this as an optional Playwright smoke — do not fork the pre-push path.
// paths end-to-end in ~30-60s, with zero test-runner overhead:
//   page loads with no console errors / page errors,
//   __apex + the named page globals exist,
//   a race starts, physics steps, telemetry + lighting probes respond.
// Usage: node tools/check/quick-validate.mjs [port]     (default 3477)
// NOTE: playwright stays inside harness.mjs's launchChromium so that
// tests/unit/quick-validate.test.mjs can import the pure helpers below without
// pulling in (or depending on the availability of) the whole playwright
// package — a heavy, environment-sensitive import the helpers never use.
import { fileURLToPath } from "node:url";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");

export function probeFailures(probe, errors) {
  const missing = Object.entries(probe.globals).filter(([, ok]) => !ok).map(([key]) => key);
  const fails = [];
  if (missing.length) fails.push("missing globals: " + missing.join(", "));
  if (!probe.race) fails.push("race() failed");
  // "The race never armed" and "the race armed and the physics is wrong" are
  // different bugs. Reporting both as `probe() invalid after race+step` is what
  // made this tool's one red line useless — so when the race never armed, say
  // ONLY that: everything downstream of it is unmeasured, not failing.
  if (probe.armed === false) {
    fails.push("race never armed (state stayed " + (probe.state || "?") + ")");
    if (errors.length) fails.push(...errors.slice(0, 5));
    return fails;
  }
  if (!probe.obs) fails.push("probe() invalid after race+step");
  if (!probe.light) fails.push("lightState() invalid");
  if (!probe.cams) fails.push("camera() failed");
  if (errors.length) fails.push(...errors.slice(0, 5));
  return fails;
}

/**
 * ASYNC, and it has to be. `__apex.race()` kicks off `startRace()` and does NOT
 * await it — startRace's very first statement is `await ensureScenery(...)`, so
 * it yields and the race arms in a later task. This helper used to do
 * race()/jump()/step()/probe() in one synchronous run inside a single
 * page.evaluate, and a synchronous run never lets a microtask land: the session
 * was still in the menu, `probe()` returned null, and the tool reported
 * `probe() invalid after race+step` on a clean tree, every time, with no
 * console error behind it. It had therefore never been a working gate.
 * (docs/notes/DEFECT-LEDGER.md, 2026-09-14.)
 */
export async function evaluateLiveProbe(
  apex = globalThis.__apex,
  hasGlobal = (name) => typeof globalThis[name] !== "undefined" ||
    (() => { try { return (0, eval)(`typeof ${name}`) !== "undefined"; } catch { return false; } })(),
  { timeoutMs = 180000, pollMs = 100, sleep } = {},
) {
  const nap = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const out = { globals: {}, race: null, armed: null, state: null, obs: null, light: null, cams: null };
  for (const name of ["GLX", "Tracks", "Parts", "Teams", "TrackDefs", "GLXShaders",
                      "TrackGeom", "TrackSceneryData", "PhysicsConsts"]) {
    out.globals[name] = hasGlobal(name);
  }
  out.race = apex.race("monza");
  // Wait for the race to actually arm. Generous, because a SwiftShader track
  // build measures 11-33 s here and the scenery build can add more.
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const info = apex.info ? apex.info() : null;
    out.state = info ? info.state : null;
    if (out.state === "race" || out.state === "count") { out.armed = true; break; }
    if (Date.now() >= deadline) { out.armed = false; break; }
    await nap(pollMs);
  }
  if (!out.armed) return out;          // nothing below can mean anything yet
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
 const PORT = Number(process.argv[2] || 3477);
 const srv = await startStaticServer(ROOT, { port: PORT });
 const errors = [];
 try {
  const browser = await launchChromium({ args: ["--use-angle=swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(srv.url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__apex != null, null, { timeout: 30000 });

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
  await shutdown();
 }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
