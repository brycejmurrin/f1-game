// Real-V8 allocation + CPU sampling over (a) 600 headless sim steps and (b) N rendered race frames.
import { startStaticServer, launchChromium } from "../../tools/lib/harness.mjs";
import fs from "node:fs";
const track = process.argv[2] || "monza", frames = +(process.argv[3] || 90);
const srv = await startStaticServer("/home/user/f1-game");
const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--disable-background-timer-throttling"] });
const ctx = await browser.newContext({ viewport: { width: 320, height: 180 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  const RO = window.ResizeObserver; if (!RO) return;
  window.__roStat = { on: false, calls: 0, ids: {} };
  window.ResizeObserver = class extends RO { constructor(cb) { super((entries, o) => {
    const st = window.__roStat; if (st.on) { st.calls++; for (const e of entries) { const k = e.target.id || e.target.className || e.target.tagName; st.ids[k] = (st.ids[k] || 0) + 1; } }
    return cb(entries, o); }); } };
});
await page.goto(srv.url);
await page.waitForFunction(() => window.__apex != null, null, { timeout: 180000, polling: 100 });
await page.evaluate((t) => window.__apex.race(t), track);
await page.waitForFunction((t) => window.__apex.info().track === t, track, { timeout: 180000, polling: 200 });
await page.evaluate(() => { const A = window.__apex; A.go(); A.headless(true); A.reset(0.02, 55, 0, 42); A.setInput({ throttle: true, steer: 0.02 }); A.step(1/60, 1500); });
const cdp = await ctx.newCDPSession(page);
const top = (prof, n = 18) => {
  const self = new Map();
  const viaN = new Map();
  const walk2 = (node, par) => { const f = node.callFrame; if (["next", "max", "push", "min"].includes(f.functionName) && !f.url && par) {
      const pf = par.callFrame, k = `${f.functionName} <- ${pf.functionName || "(anon)"} ${(pf.url || "").split("/").slice(-2).join("/").split("?")[0]}:${pf.lineNumber + 1}`; viaN.set(k, (viaN.get(k) || 0) + node.selfSize); }
    for (const c of node.children || []) walk2(c, node); };
  walk2(prof.head, null); top.via = [...viaN.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const walk = (node) => { const f = node.callFrame; const k = `${f.functionName || "(anon)"} ${(f.url || "").split("/").slice(-2).join("/")}:${f.lineNumber + 1}`;
    self.set(k, (self.get(k) || 0) + node.selfSize); for (const c of node.children || []) walk(c); };
  walk(prof.head); const tot = [...self.values()].reduce((a, b) => a + b, 0);
  return { totKB: tot / 1024, rows: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, n) };
};
async function sample(label, fn, units) {
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.startSampling", { samplingInterval: 512, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start");
  const t0 = Date.now(); await fn(); const ms = Date.now() - t0;
  const { profile: cpu } = await cdp.send("Profiler.stop");
  const { profile } = await cdp.send("HeapProfiler.stopSampling");
  fs.writeFileSync(`artifacts/profiles/h13-${track}-${label}.cpuprofile`, JSON.stringify(cpu));
  const t = top(profile);
  console.log(`\n== ${label}: ${units} units, ${(t.totKB / units).toFixed(1)} KB/unit allocated (sampled), wall ${ms} ms`);
  for (const [k, v] of t.rows) console.log(`  ${(v / 1024 / units).toFixed(2).padStart(7)} KB/unit  ${k}`);
  for (const [k, v] of top.via || []) console.log(`    via ${(v / 1024 / units).toFixed(2).padStart(7)} KB/unit  ${k}`);
}
if (!process.env.NOSTEP) await sample("step", () => page.evaluate(() => window.__apex.step(1/60, 600)), 600);
await page.evaluate(() => window.__apex.headless(false));
const rafN = (n) => page.evaluate((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
await rafN(+(process.argv[4] || 120));   // warm: lazy car builds, flap sets, atlases land here, not in the sample
await page.evaluate(() => { if (window.__roStat) window.__roStat.on = true; window.__t0 = performance.now(); });
await sample("frame", () => rafN(frames), frames);
console.log("ResizeObserver during frame:", JSON.stringify(await page.evaluate(() => ({ ...window.__roStat, gameS: window.__apex.info ? undefined : undefined, wallMs: Math.round(performance.now() - window.__t0) }))));
await sample("frame2", () => rafN(frames), frames);
await browser.close(); await srv.close?.();
