// Local Chromium CPU profiles (CDP Profiler) with CPU throttle for: settings open, title->race-select->back, race entry.
import { chromium } from "/workspace/f1-game/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const RATE = +(process.env.CPU || 4);
const br = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await br.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage(); const c = await ctx.newCDPSession(page);
await page.goto("https://brycejmurrin.github.io/f1-game/?apex&t=" + Date.now(), { timeout: 120000 });
for (let i = 0; i < 240; i++) { if (await page.evaluate("!!(window.__apex && window.__apex.race)").catch(() => false)) break; await page.waitForTimeout(500); } await page.waitForTimeout(6000);
await c.send("Profiler.enable"); await c.send("Profiler.setSamplingInterval", { interval: 200 });
await c.send("Emulation.setCPUThrottlingRate", { rate: RATE });
function top(p, n = 25) { const self = new Map(), byId = new Map(p.nodes.map(x => [x.id, x])); const dt = p.timeDeltas; const cnt = new Map();
  p.samples.forEach((id, i) => cnt.set(id, (cnt.get(id) || 0) + (dt[i] || 0)));
  for (const [id, us] of cnt) { const f = byId.get(id).callFrame; const k = `${f.functionName || "(anon)"} ${f.url.replace(/^.*f1-game\//, "")}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + us); }
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => [Math.round(us / 1000), k]); }
const res = {};
async function prof(name, fn, waitMs) { await c.send("Profiler.start"); const t = Date.now(); await fn(); await page.waitForTimeout(waitMs); const { profile } = await c.send("Profiler.stop"); writeFileSync(`results/local-${name}-cpu${RATE}.cpuprofile`, JSON.stringify(profile)); res[name] = { wallMs: Date.now() - t, top: top(profile) }; console.error(name, JSON.stringify(res[name].top.slice(0, 8))); }
await prof("settings-open", () => page.evaluate(() => document.getElementById("mb-settings").click()), 5000);
await prof("settings-close", () => page.evaluate(() => document.getElementById("pm-settings-close").click()), 2000);
await prof("race-select", () => page.evaluate(() => document.getElementById("mb-race").click()), 3000);
await prof("back-title", () => page.evaluate(() => document.getElementById("sel-back").click()), 4000);
await prof("race-entry", () => page.evaluate(() => { const t = __apex.tracks().find(t => /monza/i.test(t.id)); window.__rd = null; Promise.resolve(__apex.race(t.id, undefined, "dry", { laps: 20 })).then(() => __rd = "ok"); }), 25000);
writeFileSync(`results/local-prof-cpu${RATE}.json`, JSON.stringify(res, null, 1)); await br.close();
