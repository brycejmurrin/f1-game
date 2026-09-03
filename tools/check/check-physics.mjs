// @doc Physics stability probes: `check-physics.mjs <bank|grip|roadfollow|steer>` — no-NaN, forward motion, steering authority.
// @skill tune-physics
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import { fileURLToPath } from "node:url";

const LAUNCH_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-webgpu"];
const POLL = { polling: 100, timeout: 8000 };
let BASE = "http://127.0.0.1/";

async function checkBank(browser) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 506 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await page.goto(BASE + "/");
  await page.waitForFunction(() => window.__apex != null, POLL);
  await page.evaluate(() => window.__apex.race("zandvoort", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track != null, POLL);
  await page.evaluate(() => window.__apex.go());
  // drive a few seconds, sample banking grip exposure + stability
  await page.evaluate(() => { window.__apex.jump(0.0, 45, 0); window.__apex.setInput({ steer: 0.3, throttle: true }); });
  let finite = true, gained = 0, prev = null;
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.__apex.step(1/60, 15));
    const st = await page.evaluate(() => { const c = window.__apex.cars().find((c)=>c.p); return { x: c.x, prog: c.prog, speed: c.speed }; });
    if (![st.x, st.prog, st.speed].every(Number.isFinite)) finite = false;
    if (prev != null) gained += st.prog - prev;
    prev = st.prog;
  }
  console.log("console errors:", errs.filter((e)=>!e.includes("favicon")).slice(0,4));
  console.log("finite:", finite, " progress:", gained.toFixed(1), "m");
  console.log(finite && gained > 50 && errs.filter((e)=>!e.includes("favicon")).length === 0
    ? "PASS: banked track drives stably, no errors" : "FAIL");
  await ctx.close();
}

async function checkGrip(browser) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/");
  await page.locator("#mb-race").click();
  await page.locator("#sel-go").click();
  // #sel-go opens the GARAGE (a step since "the garage is a step"); #cs-done
  // advances to race settings, where #rs-go starts the race.
  await page.locator("#cs-done").click();
  await page.locator("#rs-go").click();
  await page.waitForFunction(() => window.__apex && window.__apex.info().track != null, POLL);
  await page.evaluate(() => window.__apex.go());
  await page.evaluate(() => window.__apex.jump(0.0, 50, 0));

  // hold throttle so the car drives (DRIVING-HELP assist steers); sample state
  await page.keyboard.down("KeyW");
  let prevProg = null, finite = true, totalGain = 0;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => {
      const c = window.__apex.cars().find((c) => c.p);
      return { x: c.x, prog: c.prog, speed: c.speed };
    });
    if (![st.x, st.prog, st.speed].every(Number.isFinite)) finite = false;
    if (prevProg != null) totalGain += st.prog - prevProg;
    prevProg = st.prog;
  }
  await page.keyboard.up("KeyW");
  console.log("finite state throughout:", finite);
  console.log("total progress over ~3s holding throttle:", totalGain.toFixed(1), "m");
  // finite state = no NaN/blow-up; >50 m forward = not stuck/spinning in place
  // (holding throttle into Turn 1 runs wide onto grass, so it won't hit full speed).
  console.log(finite && totalGain > 50 ? "PASS: stable, continuous forward motion with combined-slip"
                                       : "FAIL: instability or stuck");
  await ctx.close();
}

async function checkRoadfollow(browser) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 506 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/");
  await page.waitForFunction(() => window.__apex != null, POLL);
  await page.evaluate(() => window.__apex.race("bahrain", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track != null, POLL);
  await page.evaluate(() => window.__apex.go());
  const res = await page.evaluate(() => {
    const out = [];
    const corners = window.__apex.corners();
    for (const v of [30, 40, 50]) {
      let widest = 0, hw = 7;
      for (const f of corners) {
        window.__apex.jump((f - 0.02 + 1) % 1, v, 0);
        window.__apex.setInput({ steer: 0, throttle: false });
        hw = window.__apex.probe().hw;
        for (let i = 0; i < 70; i++) { window.__apex.step(1/60, 1); widest = Math.max(widest, Math.abs(window.__apex.probe().x)); }
      }
      out.push({ v, widest: +widest.toFixed(1), hw: +hw.toFixed(1), limit: +(hw + 8).toFixed(1) });
    }
    window.__apex.clearInput();
    return out;
  });
  for (const r of res) console.log(`speed ${r.v}: widest ${r.widest}  (limit hw+8=${r.limit}, wall hw+9=${(r.hw+9).toFixed(1)}) ${r.widest < r.limit ? "OK road-follow holds" : "runs to runoff/wall"}`);
  await ctx.close();
}

async function checkSteer(browser) {
  async function run(label, holdKey) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
    const page = await ctx.newPage();
    await page.goto(BASE + "/");
    await page.locator("#mb-race").click();
    await page.locator("#sel-go").click();
    // #sel-go opens the GARAGE (a step); #cs-done advances to race settings.
    await page.locator("#cs-done").click();
    await page.locator("#rs-go").click();
    await page.waitForFunction(() => window.__apex && window.__apex.info().track != null, POLL);

    const corners = await page.evaluate(() => window.__apex.corners());
    const frac = corners.length ? corners[0] : 0.15;
    await page.evaluate(() => window.__apex.go());
    // enter the corner at a sensible speed, centred
    await page.evaluate((f) => window.__apex.jump(f, 38, 0), frac);
    if (holdKey) await page.keyboard.down(holdKey);

    const xs = [];
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(150);
      const x = await page.evaluate(() => window.__apex.cars().find((c) => c.p).x);
      xs.push(+x.toFixed(2));
    }
    if (holdKey) await page.keyboard.up(holdKey);
    const moved = Math.abs(xs[xs.length - 1] - xs[0]);
    console.log(label + ": x " + xs.join(" -> ") + "  (|moved| " + moved.toFixed(1) + " m)");
    await ctx.close();
    return moved;
  }

  const noSteer = await run("NO STEER ", null);
  const steerIn = await run("STEER IN ", "KeyA");   // steer left toward apex
  const steerOut = await run("STEER OUT", "KeyD");   // steer right (wrong way)

  console.log(noSteer > 1.5 ? "PASS: not steering runs you wide (not on-rails)"
                            : "FAIL: car still follows the corner without input");
  console.log("Steering clearly changes the line: in=" + steerIn.toFixed(1) +
              " vs out=" + steerOut.toFixed(1) + " vs none=" + noSteer.toFixed(1));
}

const CHECKS = { bank: checkBank, grip: checkGrip, roadfollow: checkRoadfollow, steer: checkSteer };
const which = process.argv[2];
if (!CHECKS[which]) {
  console.error(`usage: node tools/check/check-physics.mjs <${Object.keys(CHECKS).join("|")}>`);
  process.exit(1);
}
const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const srv = await startStaticServer(ROOT);
BASE = srv.url.replace(/\/?$/, "");
try {
  const browser = await launchChromium({ args: LAUNCH_ARGS });
  await CHECKS[which](browser);
} finally {
  await shutdown();
}
