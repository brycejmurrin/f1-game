// @doc Renders a built viewer page headlessly: a PNG per car/circuit or per livery/finish/part variant, plus a contact sheet.
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

/** Expand one --sheet spec ("liveries:ferrari", "finishes:ferrari", "parts:aero:ferrari") into car specs, in-page. */
export function parseSheet(spec) {
  const [kind, a, b] = String(spec).split(":");
  if (kind === "liveries" || kind === "finishes") { if (!a) throw new Error(`--sheet=${kind}:<team>`); return { kind, team: a }; }
  if (kind === "parts") { if (!a || !b) throw new Error("--sheet=parts:<category>:<team>"); return { kind, cat: a, team: b }; }
  throw new Error(`unknown --sheet kind "${kind}" (liveries | finishes | parts)`);
}

/**
 * @param {string} htmlPath  a page written by build-viewer.mjs
 * @param {{cars?:string[], circuits?:string[], sheet?:string|null, match?:string|null, outDir:string, cacheDir:string}} opts
 *   cars/circuits: one still each (the factory car, the circuit). sheet: every variant of one axis instead;
 *   match: a regex a variant id must match to be shot (e.g. the ids a change adds).
 * @returns {Promise<{shots:{label:string,png:string}[], sheet:string|null}>}
 */
export async function shootViewer(htmlPath, { cars = [], circuits = [], sheet = null, match = null, outDir, cacheDir }) {
  const keep = match ? new RegExp(match) : null;
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage({ viewport: sheet ? { width: 640, height: 900 } : { width: 960, height: 1100 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(CDN, (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: cdnBody(route.request().url(), cacheDir) }));
    await page.goto(pathToFileURL(path.resolve(htmlPath)).href);
    await page.waitForFunction(() => window.APEX_VIEWER && window.APEX_VIEWER.ready, null, { polling: 100, timeout: 30000 });
    // Each job: [file stem, label override or null, page action].
    const jobs = [];
    if (sheet) {
      const S = parseSheet(sheet);
      const O = await page.evaluate((t) => window.APEX_VIEWER.options(t), S.team);
      const ok = (id) => !keep || keep.test(id);
      if (S.kind === "liveries") for (const l of O.liveries.filter((x) => ok(x.id))) jobs.push([`livery-${S.team}-${l.id}`, l.name, { team: S.team, livery: l.id }]);
      if (S.kind === "finishes") for (const f of O.finishes.filter(ok)) jobs.push([`finish-${S.team}-${f}`, f, { team: S.team, finish: f }]);
      if (S.kind === "parts") {
        const cat = O.parts.find((c) => c.id === S.cat);
        if (!cat) throw new Error(`no part category "${S.cat}" (one of: ${O.parts.map((c) => c.id).join(", ")})`);
        for (const o of cat.options.filter((x) => ok(x.id))) jobs.push([`part-${S.team}-${S.cat}-${o.id}`, o.label, { team: S.team, parts: { [S.cat]: o.id } }]);
      }
    } else {
      for (const id of cars) jobs.push([`car-${id}`, null, { team: id }]);
      for (const id of circuits) jobs.push([`circuit-${id}`, null, { circuit: id }]);
    }
    const shots = [];
    for (const [stem, label, act] of jobs) {
      const title = await page.evaluate((a) => {
        if (a.circuit) { window.APEX_VIEWER.select("circuits", a.circuit); return document.getElementById("title").textContent; }
        return window.APEX_VIEWER.car(a);
      }, act);
      await page.evaluate(() => window.APEX_VIEWER.still());
      const png = path.join(outDir, stem.replace(/[^A-Za-z0-9_-]/g, "_") + ".png");
      await page.locator("#view").screenshot({ path: png });
      shots.push({ label: label || title, png });
    }
    if (errors.length) throw new Error("viewer page errors: " + errors.join(" | "));
    if (!shots.length) throw new Error(`nothing to shoot${match ? ` (--match=${match} kept no variant)` : ""}`);
    const sheetPng = shots.length > 1 ? await contactSheet(browser, shots, path.join(outDir, sheet ? `sheet-${sheet.replace(/[^A-Za-z0-9_-]/g, "_")}.png` : "sheet.png")) : null;
    return { shots, sheet: sheetPng };
  } finally {
    await browser.close();
  }
}

async function contactSheet(browser, shots, out) {
  const cols = shots.length <= 4 ? 2 : shots.length <= 15 ? 3 : 4;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cells = shots.map((s) => `<figure><img src="data:image/png;base64,${fs.readFileSync(s.png).toString("base64")}"><figcaption>${esc(s.label)}</figcaption></figure>`).join("");
  const page = await browser.newPage({ viewport: { width: cols * (cols > 3 ? 320 : 420), height: 400 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>body{margin:0;padding:12px;background:#12161b;font:600 18px/1.2 "Arial Narrow",sans-serif;color:#e8ecf0;text-transform:uppercase;letter-spacing:.04em}
    main{display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px}figure{margin:0}img{width:100%;display:block;border-radius:4px}figcaption{padding:6px 2px 0}</style><main>${cells}</main>`);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
  return out;
}
