// @doc Renders a built viewer page headlessly: one PNG per car and circuit, plus a labelled contact sheet.
// @skill playwright-probe
//
// Stills for hosts that show an image but not a live page (posting into a chat
// on a phone). Drives the page's own window.APEX_VIEWER hook, so a still is the
// exact first frame a viewer would see. The page's three.js comes from
// jsDelivr; requests to it are answered from artifacts/viewer/cdn/, filled once
// by curl (which honours HTTPS_PROXY and the system CA bundle), so the browser
// itself needs no network or certificate exceptions.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { chromiumPath } from "../lib/chromium-path.mjs";

const CDN = /^https:\/\/cdn\.jsdelivr\.net\/npm\/(.+)$/;

function cdnBody(url, cacheDir) {
  const m = CDN.exec(url);
  const file = path.join(cacheDir, m[1].replace(/[^A-Za-z0-9._@-]/g, "_"));
  if (!fs.existsSync(file)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    const r = spawnSync("curl", ["-sSfL", "--max-time", "60", "-o", file, url], { encoding: "utf8" });
    if (r.status !== 0) { fs.rmSync(file, { force: true }); throw new Error(`could not fetch ${url}: ${(r.stderr || "").trim()}`); }
  }
  return fs.readFileSync(file);
}

/**
 * @param {string} htmlPath  a page written by build-viewer.mjs
 * @param {{cars:string[], circuits:string[], outDir:string, cacheDir:string}} opts
 * @returns {Promise<{shots:{mode:string,id:string,png:string}[], sheet:string|null}>}
 */
export async function shootViewer(htmlPath, { cars = [], circuits = [], outDir, cacheDir }) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 1100 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(CDN, (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: cdnBody(route.request().url(), cacheDir) }));
    await page.goto(pathToFileURL(path.resolve(htmlPath)).href);
    await page.waitForFunction(() => window.APEX_VIEWER && window.APEX_VIEWER.ready, null, { polling: 100, timeout: 30000 });
    const shots = [];
    for (const [mode, ids] of [["cars", cars], ["circuits", circuits]]) {
      for (const id of ids) {
        await page.evaluate(([m, i]) => { window.APEX_VIEWER.select(m, i); return window.APEX_VIEWER.still(); }, [mode, id]);
        const png = path.join(outDir, `${mode === "cars" ? "car" : "circuit"}-${id}.png`);
        await page.locator("#view").screenshot({ path: png });
        const label = await page.evaluate(() => document.getElementById("title").textContent);
        shots.push({ mode, id, label, png });
      }
    }
    if (errors.length) throw new Error("viewer page errors: " + errors.join(" | "));
    const sheet = shots.length > 1 ? await contactSheet(browser, shots, path.join(outDir, "sheet.png")) : null;
    return { shots: shots.map(({ mode, id, png }) => ({ mode, id, png })), sheet };
  } finally {
    await browser.close();
  }
}

async function contactSheet(browser, shots, out) {
  const cols = shots.length <= 4 ? 2 : 3;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cells = shots.map((s) => `<figure><img src="data:image/png;base64,${fs.readFileSync(s.png).toString("base64")}"><figcaption>${esc(s.label)}</figcaption></figure>`).join("");
  const page = await browser.newPage({ viewport: { width: cols * 420, height: 400 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>body{margin:0;padding:12px;background:#12161b;font:600 18px/1.2 "Arial Narrow",sans-serif;color:#e8ecf0;text-transform:uppercase;letter-spacing:.04em}
    main{display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px}figure{margin:0}img{width:100%;display:block;border-radius:4px}figcaption{padding:6px 2px 0}</style><main>${cells}</main>`);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
  return out;
}
