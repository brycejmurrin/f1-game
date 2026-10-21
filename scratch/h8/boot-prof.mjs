import { chromium } from "playwright";
import { chromiumPath } from "../../tools/lib/chromium-path.mjs";
const URL = process.argv[2] || "http://apex.test:3457/"; const CPU = +(process.argv[3] || 4);
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--host-resolver-rules=MAP apex.test 127.0.0.1", "--unsafely-treat-insecure-origin-as-secure=http://apex.test:3457"] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start");
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => { const b = document.getElementById("mb-race"); return b && b.onclick; }, null, { timeout: 120000, polling: 50 });
const { profile } = await cdp.send("Profiler.stop");
const byId = new Map(profile.nodes.map(n => [n.id, n]));
const self = new Map(); const dt = profile.timeDeltas; let tot = 0;
for (let i = 0; i < profile.samples.length; i++) { const n = byId.get(profile.samples[i]); const d = dt[i] || 0; tot += d; const cf = n.callFrame; const k = (cf.url.split("/").slice(-2).join("/").split("?")[0] || "(native)") + " " + (cf.functionName || "(anon)"); self.set(k, (self.get(k) || 0) + d); }
const byFile = new Map(); for (const [k, v] of self) { const f = k.split(" ")[0]; byFile.set(f, (byFile.get(f) || 0) + v); }
console.log("total ms", Math.round(tot / 1000));
console.log("BY FILE"); [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => console.log(String(Math.round(v / 1000)).padStart(6), k));
console.log("BY FN"); [...self].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, v]) => console.log(String(Math.round(v / 1000)).padStart(6), k));
await browser.close();
