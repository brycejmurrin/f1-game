#!/usr/bin/env node
// @doc Does the frame loop survive a transient fault and stop on a deterministic one? Injects throws into `Input.poll` live.
// @skill webgl-debug
/* loop-fault-repro.mjs — does the frame loop actually survive a transient fault
 * and actually stop on a deterministic one?
 *
 * The loop policy (js/perf/loop-health.js) is the kind of thing a source
 * assertion cannot check: tests/unit/source-integrity.test.mjs pins the SHAPE
 * of tick(), but only a running page can answer whether a fault costs one frame
 * or the session. Round 13 shipped a transient fault (a null player in the
 * async startRace window) that killed the loop for good, and every surface kept
 * reporting 60 fps over the frozen canvas, so the answer matters.
 *
 * Injection point is Input.poll — a global tickBody calls unconditionally near
 * the top of every frame, so a throw there is a genuine mid-frame fault, not a
 * simulated one.
 *
 * Liveness is a frame COUNT, never a millisecond deadline. rAF in this
 * container runs at a fraction of a Hz (measured 2026-08-31: a 500 ms
 * setTimeout took 9.8 s; a perfectly healthy page reported staleMs 6993), so a
 * "stalled if > 1 s" rule measures the machine. A counter that does not advance
 * between two observations is a stall at any frame rate, on any hardware.
 *
 * Needs the site served (npx serve -l 3456 .).
 * Run: node tools/gfx/loop-fault-repro.mjs
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";

const EXE = ["/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-headless-shell"]
  .find((p) => existsSync(p));
const URL = process.env.APEX_URL || "http://127.0.0.1:3456/index.html";
const results = [];
const check = (name, ok, detail) => {
  results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

async function boot(browser, sink) {
  const page = await browser.newPage();
  page.on("console", (m) => sink.push(m.text()));
  page.on("pageerror", (e) => sink.push("PAGEERROR " + e.message));
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__apex && window.__apex.info, null,
    { timeout: 120000, polling: 100 });
  return page;
}
// Liveness as a COUNT, not a deadline. rAF in this container runs at a
// fraction of a Hz (measured: a 500 ms setTimeout took 9.8 s and a healthy
// page reported staleMs 6993), so any millisecond threshold here would be
// measuring the machine. A frame counter that advances is alive at any rate.
const advanced = (page, ms) => page.evaluate(async (ms) => {
  const at = () => { try { return LoopHealth.state(); } catch (_) { return null; } };
  const a = at();
  await new Promise((r) => setTimeout(r, ms));
  const b = at();
  return { before: a.frames, after: b.frames, moved: b.frames > a.frames,
    staleA: a.staleMs, staleB: b.staleMs, stopped: b.stopped };
}, ms);

const browser = await chromium.launch({
  ...(EXE ? { executablePath: EXE } : {}), args: ["--no-sandbox"],
});
try {
  // ---- 1. MENU: the false-stall case, and the one that matters most. -------
  {
    const log = []; const page = await boot(browser, log);
    await page.waitForTimeout(1500);
    const live = await advanced(page, 1500);
    const m = await page.evaluate(() => ({
      loop: LoopHealth.state(),
      // PerfGov.tick is gated on !paused && (race || count), so fpsEMA is
      // LEGITIMATELY frozen here. That is why it cannot be the heartbeat, and
      // why this is the case that matters: a decay would report a false stall.
      fps: (() => { try { return PerfGov.fpsEMA(); } catch (_) { return "n/a"; } })(),
    }));
    check("menu: the loop reads ALIVE where the fps surface is legitimately frozen",
      live.moved && m.loop.faults === 0 && !m.loop.stopped,
      JSON.stringify({ ...live, fps: m.fps }));
    await page.close();
  }
  // ---- 2. TRANSIENT: 7 consecutive throws, one under the cap of 8. --------
  {
    const log = []; const page = await boot(browser, log);
    await page.evaluate(() => {
      window.__r14 = { thrown: 0 };
      const orig = Input.poll;
      Input.poll = function () {
        if (window.__r14.thrown < 7) { window.__r14.thrown++; throw new Error("apex-r14-transient"); }
        return orig.apply(this, arguments);
      };
    });
    await page.waitForTimeout(1500);
    const t = await page.evaluate(() => ({
      thrown: window.__r14.thrown, loop: LoopHealth.state(),
      logs: (window.__apex.logs() || []).filter((l) => /frame fault/.test(JSON.stringify(l))).length,
    }));
    const live = await advanced(page, 1500);
    check("transient: the loop SURVIVED 7 consecutive faults and kept drawing",
      t.thrown === 7 && t.loop.stopped === false && live.moved,
      JSON.stringify({ ...t, after: live }));
    check("transient: a clean frame paid the run back to zero",
      t.loop.run === 0 && t.loop.faults === 7, `run=${t.loop.run} faults=${t.loop.faults}`);
    check("transient: the faults are in the __apex.logs() ring, not swallowed",
      t.logs > 0, `${t.logs} entries`);
    await page.close();
  }
  // ---- 3. DETERMINISTIC: throws forever, must still stop at the cap. ------
  {
    const log = []; const page = await boot(browser, log);
    await page.evaluate(() => {
      window.__r14 = { thrown: 0 };
      Input.poll = function () { window.__r14.thrown++; throw new Error("apex-r14-permanent"); };
    });
    await page.waitForTimeout(2000);
    const a = await page.evaluate(() => ({ thrown: window.__r14.thrown, loop: LoopHealth.state() }));
    await page.waitForTimeout(1500);
    const b = await page.evaluate(() => ({ thrown: window.__r14.thrown, loop: LoopHealth.state() }));
    check("deterministic: the loop STOPPED at the cap, it did not spin",
      a.loop.stopped === true && b.thrown === a.thrown && a.thrown <= 9,
      JSON.stringify({ a: a.thrown, b: b.thrown, run: a.loop.run }));
    const dead = await advanced(page, 1500);
    check("deterministic: the heartbeat reports the stall the frozen surfaces hide",
      !dead.moved && dead.stopped === true && dead.staleB > dead.staleA,
      JSON.stringify(dead));
    check("deterministic: the real error was reported once, not 60x/s",
      log.filter((l) => /apex-r14-permanent/.test(l)).length <= 12,
      `${log.filter((l) => /apex-r14-permanent/.test(l)).length} console lines`);
    await page.close();
  }
} finally { await browser.close(); }
// A repro that checked nothing must not exit 0 — that is the exact failure
// class this round exists to sweep (docs/PERF-FINDINGS.md 2j/2k).
if (results.length < 7) {
  console.error(`REPRO MEASURED NOTHING — only ${results.length} of 7 checks ran; ` +
    "do not read this as a pass.");
  process.exit(1);
}
console.log(results.every(Boolean) ? "\nALL REPROS AS EXPECTED" : "\nSOME REPROS FAILED");
process.exit(results.every(Boolean) ? 0 : 1);
