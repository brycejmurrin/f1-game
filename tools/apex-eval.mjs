#!/usr/bin/env node
// apex-eval — boot the game headless and evaluate an __apex expression, print JSON.
//
//   node tools/apex-eval.mjs <trackId> "<expr>"
//   node tools/apex-eval.mjs monaco "a.camera()"
//   node tools/apex-eval.mjs spa    "a.corners().length"
//   node tools/apex-eval.mjs monza  "(a.go(), a.jump(0.2,55), a.physState())"
//   node tools/apex-eval.mjs monza  "a.trackProfile(6)" --raw     # full JSON, no shape-compaction
//
// `a` is window.__apex inside the expr. Async expr is awaited. Default output
// is shape-compacted (keys + sampled types + rounded numbers); --raw dumps the
// real value. Starts its own static server + Chromium; no setup needed.
//
// Robust against this repo's environment: picks the preinstalled Chromium when
// the npm playwright build doesn't match (executablePath fallback), and resolves
// playwright from the project even when run from elsewhere.

import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";

const ROOT = new URL("..", import.meta.url).pathname;
const require = createRequire(ROOT + "/");
const { chromium } = require("playwright");

const argv = process.argv.slice(2);
const raw = argv.includes("--raw");
const rest = argv.filter((a) => a !== "--raw");
const track = rest[0] || "monza";
const expr = rest[1] || "a.info()";

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
    s.on("error", rej);
  });
}
function pickChromium() {
  for (const p of ["/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"])
    if (existsSync(p)) return p;
  return undefined; // fall back to playwright's bundled build
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SHAPE = function () {
  window.__shape = function (v, d = 0) {
    if (v === null || v === undefined) return v === null ? "null" : "undefined";
    if (Array.isArray(v)) return `Array(${v.length})` + (v.length ? `<${window.__shape(v[0], d + 1)}>` : "");
    const t = typeof v;
    if (t === "object") {
      if (d > 1) return "object";
      const o = {};
      for (const k of Object.keys(v).slice(0, 32)) {
        const x = v[k];
        o[k] = Array.isArray(x) ? `Array(${x.length})`
          : x && typeof x === "object" ? "object"
          : typeof x === "number" ? +x.toFixed(3) : x;
      }
      return o;
    }
    return t === "number" ? +v.toFixed(3) : v;
  };
};

(async () => {
  const port = await freePort();
  const server = spawn("python3", ["-m", "http.server", String(port)], { cwd: ROOT, stdio: "ignore" });
  const cleanup = () => { try { server.kill(); } catch {} };
  process.on("exit", cleanup);

  let browser;
  try {
    await sleep(600);
    browser = await chromium.launch({
      executablePath: pickChromium(),
      args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu", "--disable-background-timer-throttling"],
    });
    const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => window.__apex != null, { timeout: 15000 });
    await page.evaluate(SHAPE);
    await page.evaluate((t) => window.__apex.race(t), track);
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 15000 });
    await sleep(1600); // mesh build

    const result = await page.evaluate(async ({ expr, raw }) => {
      try {
        const a = window.__apex;
        // eslint-disable-next-line no-new-func
        const v = await new Function("a", "return (async()=>(" + expr + "))()")(a);
        return { ok: true, val: raw ? v : window.__shape(v) };
      } catch (e) { return { err: String((e && e.message) || e) }; }
    }, { expr, raw });

    console.log(JSON.stringify(result.ok ? result.val : result, null, 2));
    await browser.close();
  } catch (e) {
    console.error("apex-eval failed:", e.message);
    process.exitCode = 1;
  } finally {
    cleanup();
  }
})();
