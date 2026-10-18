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
  if (kind === "liveries" || kind === "finishes" || kind === "bodies") { if (!a) throw new Error(`--sheet=${kind}:<team>`); return { kind, team: a }; }
  if (kind === "parts") { if (!a || !b) throw new Error("--sheet=parts:<category>:<team>"); return { kind, cat: a, team: b }; }
  throw new Error(`unknown --sheet kind "${kind}" (liveries | finishes | bodies | parts)`);
}

/**
 * @param {string} htmlPath  a page written by build-viewer.mjs
 * @param {{cars?:string[], circuits?:string[], sheet?:string|null, match?:string|null, outDir:string, cacheDir:string}} opts
 *   cars/circuits: one still each (the factory car, the circuit). sheet: every variant of one axis instead;
 *   match: a regex a variant id must match to be shot (e.g. the ids a change adds).
 * @returns {Promise<{shots:{label:string,png:string}[], sheet:string|null}>}
 */
// The close-up a sheet frames each axis on (viewer.html FRAMES): the part that
// changes, so a variant's difference fills the shot. Liveries and finishes
// change the whole car and keep the hero framing (null).
export const CAT_FRAME = Object.freeze({
  engine: "sidepod", aero: "rear", suspension: "front_susp", brakes: "front_wheel", tyres: "front_wheel",
  wheels: "front_wheel", ers: "airbox", gearbox: "diffuser", fuel: "diffuser", exhaust: "diffuser",
  floor: "floor", cockpit: "cockpit", bodies: "nose",
});
// A pair whose two stills differ in fewer than this share of pixels reads as
// "the same picture" on a phone (2026-10-18: whole-car stills at 1-7% did).
export const SUBTLE_PCT = 8;

/** Share of pixels (0-100) whose grey level moves by more than 16/255 between two same-size PNGs. */
export async function pixelDiffPct(a, b) {
  const sharp = (await import("sharp")).default;
  const [A, B] = await Promise.all([a, b].map((f) => sharp(f).greyscale().raw().toBuffer({ resolveWithObject: true })));
  if (A.info.width !== B.info.width || A.info.height !== B.info.height) throw new Error(`size mismatch ${a} vs ${b}`);
  let n = 0;
  for (let i = 0; i < A.data.length; i++) if (Math.abs(A.data[i] - B.data[i]) > 16) n++;
  return (100 * n) / A.data.length;
}

/**
 * @param {string} htmlPath  a page written by build-viewer.mjs
 * @param {{cars?:string[], circuits?:string[], sheet?:string|null, match?:string|null, frame?:string|null, outDir:string, cacheDir:string}} opts
 *   cars/circuits: one still each (the factory car, the circuit). sheet: every variant of one axis instead;
 *   match: a regex a variant id must match to be shot (e.g. the ids a change adds); frame: override the
 *   close-up (CAT_FRAME) with any viewer.html FRAMES name. A part with an `equivalent`, and every body,
 *   is shot as a BEFORE/AFTER pair and the pair's pixel difference is measured.
 * @returns {Promise<{shots:{label:string,png:string}[], pairs:{label:string,diffPct:number}[], sheet:string|null}>}
 */
export async function shootViewer(htmlPath, { cars = [], circuits = [], sheet = null, match = null, frame = null, outDir, cacheDir }) {
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
    // Each job: { stem, label, act, frame, base } — `base` is the BEFORE job a variant pairs with.
    const jobs = [];
    if (sheet) {
      const S = parseSheet(sheet);
      const O = await page.evaluate((t) => window.APEX_VIEWER.options(t), S.team);
      const frames = await page.evaluate(() => window.APEX_VIEWER.frames());
      if (frame && !frames.includes(frame)) throw new Error(`no frame "${frame}" (one of: ${frames.join(", ")})`);
      const ok = (id) => !keep || keep.test(id);
      const at = (k) => frame || CAT_FRAME[k] || null;
      if (S.kind === "liveries") for (const l of O.liveries.filter((x) => ok(x.id))) jobs.push({ stem: `livery-${S.team}-${l.id}`, label: l.name, act: { team: S.team, livery: l.id }, frame: frame });
      if (S.kind === "finishes") for (const f of O.finishes.filter(ok)) jobs.push({ stem: `finish-${S.team}-${f}`, label: f, act: { team: S.team, finish: f }, frame: frame });
      if (S.kind === "bodies") {
        const base = { stem: `body-${S.team}-own-${at("bodies")}`, label: "before: team's own", act: { team: S.team }, frame: at("bodies") };
        for (const b of O.bodies.filter((x) => ok(x.id) && x.id !== S.team))
          jobs.push({ stem: `body-${S.team}-${b.id}`, label: b.name, act: { team: S.team, body: b.id }, frame: at("bodies"), base });
      }
      if (S.kind === "parts") {
        // "all" walks every category in catalog order — with --match, one sheet of a change's new parts.
        const cats = S.cat === "all" ? O.parts : O.parts.filter((c) => c.id === S.cat);
        if (!cats.length) throw new Error(`no part category "${S.cat}" (one of: all, ${O.parts.map((c) => c.id).join(", ")})`);
        for (const cat of cats) for (const o of cat.options.filter((x) => ok(x.id))) {
          const eq = o.equivalent && cat.options.find((x) => x.id === o.equivalent);
          const base = eq ? { stem: `part-${S.team}-${cat.id}-${eq.id}-${at(cat.id)}`, label: `before: ${eq.label}`,
            act: { team: S.team, parts: { [cat.id]: eq.id } }, frame: at(cat.id) } : null;
          jobs.push({ stem: `part-${S.team}-${cat.id}-${o.id}`, label: `${cat.label}: ${o.label}`, act: { team: S.team, parts: { [cat.id]: o.id } }, frame: at(cat.id), base });
        }
      }
    } else {
      for (const id of cars) jobs.push({ stem: `car-${id}`, act: { team: id } });
      for (const id of circuits) jobs.push({ stem: `circuit-${id}`, act: { circuit: id } });
    }
    const shotOf = new Map();   // stem -> png, so a shared BEFORE is rendered once
    const shoot = async (j) => {
      if (shotOf.has(j.stem)) return shotOf.get(j.stem);
      const title = await page.evaluate(([a, f]) => {
        let t;
        if (a.circuit) { window.APEX_VIEWER.select("circuits", a.circuit); t = document.getElementById("title").textContent; }
        else t = window.APEX_VIEWER.car(a);
        if (f) window.APEX_VIEWER.frame(f);
        return t;
      }, [j.act, j.frame || null]);
      await page.evaluate(() => window.APEX_VIEWER.still());
      const png = path.join(outDir, j.stem.replace(/[^A-Za-z0-9_-]/g, "_") + ".png");
      await page.locator("#view").screenshot({ path: png });
      const r = { label: j.label || title, png };
      shotOf.set(j.stem, r);
      return r;
    };
    const shots = [], pairs = [];
    for (const j of jobs) {
      if (j.base) {
        const before = await shoot(j.base), after = await shoot(j);
        const diffPct = await pixelDiffPct(before.png, after.png);
        pairs.push({ label: j.label, diffPct });
        shots.push(before, { ...after, label: `after: ${j.label} · Δ ${diffPct.toFixed(1)}%${diffPct < SUBTLE_PCT ? " SUBTLE" : ""}` });
      } else shots.push(await shoot(j));
    }
    if (errors.length) throw new Error("viewer page errors: " + errors.join(" | "));
    if (!shots.length) throw new Error(`nothing to shoot${match ? ` (--match=${match} kept no variant)` : ""}`);
    const sheetPng = shots.length > 1 ? await contactSheet(browser, shots, path.join(outDir, sheet ? `sheet-${sheet.replace(/[^A-Za-z0-9_-]/g, "_")}.png` : "sheet.png"), pairs.length ? 4 : 0) : null;
    return { shots, pairs, sheet: sheetPng };
  } finally {
    await browser.close();
  }
}

async function contactSheet(browser, shots, out, fixedCols = 0) {
  // Pairs lay out BEFORE|AFTER side by side, two pairs a row.
  const cols = fixedCols || (shots.length <= 4 ? 2 : shots.length <= 15 ? 3 : 4);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cells = shots.map((s) => `<figure><img src="data:image/png;base64,${fs.readFileSync(s.png).toString("base64")}"><figcaption>${esc(s.label)}</figcaption></figure>`).join("");
  const page = await browser.newPage({ viewport: { width: cols * (cols > 3 ? 320 : 420), height: 400 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>body{margin:0;padding:12px;background:#12161b;font:600 18px/1.2 "Arial Narrow",sans-serif;color:#e8ecf0;text-transform:uppercase;letter-spacing:.04em}
    main{display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px}figure{margin:0}img{width:100%;display:block;border-radius:4px}figcaption{padding:6px 2px 0}</style><main>${cells}</main>`);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
  return out;
}
