// @doc Shared core for hud-mock / menu-mock: held rAF, labelled boxes, CDP capture, contact sheet, cell cache.
//
// WHY. hud-mock proved the fast shape for a DOM-only question: boot ONE page per pointer
// type, turn the 3D off, change the viewport in place, and capture composited DOM
// (~1 s a shot against 20-30 s for a lit software frame). menu-mock wants the same, so the
// pieces that are not about the HUD live here once.
//
// Pure (unit-tested without a browser): inputsHash, cellKey, cellCache, sheetArgs.
// Page-side (self-contained, passed to page.evaluate / addInitScript): holdLoopInit, drawBoxes.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

/** Bump when a tool's row shape or its probe changes, so old cache entries are not served. */
export const CACHE_VERSION = 1;

/** Init script: a held rAF queue, so a frozen game's loop cannot tick the DOM while a cell is shot. */
export function holdLoopInit() {
  const raf = window.requestAnimationFrame.bind(window);
  const q = [];
  window.__uiMock = { hold: false, release() { this.hold = false; for (const f of q.splice(0)) raf(f); } };
  window.__hudMock = window.__uiMock;   // hud-mock's original name
  window.requestAnimationFrame = (f) => (window.__uiMock.hold ? (q.push(f), 0) : raf(f));
}

/** In-page: labelled outlines. recs = [{key, role: "ctrl"|"read", x, y, r, b}], bad = keys to flag red. */
export function drawBoxes({ recs, bad }) {
  let layer = document.getElementById("hm-boxes");
  if (layer) layer.remove();
  layer = document.createElement("div");
  layer.id = "hm-boxes";
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;font:10px/1 monospace";
  for (const r of recs) {
    const d = document.createElement("div");
    const hot = bad.includes(r.key);
    const col = hot ? "#ff3b3b" : r.role === "ctrl" ? "#ffd400" : "#22d3ee";
    d.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.r - r.x}px;height:${r.b - r.y}px;` +
      `outline:1px ${r.role === "ctrl" ? "dashed" : "solid"} ${col};${hot ? "background:rgba(255,59,59,.22);" : ""}`;
    const t = document.createElement("span");
    t.textContent = r.key;
    t.style.cssText = `position:absolute;left:0;top:${r.y < 12 ? 1 : -11}px;color:${col};background:rgba(0,0,0,.7);padding:0 2px;white-space:nowrap`;
    d.appendChild(t);
    layer.appendChild(d);
  }
  document.body.appendChild(layer);
}

/** CDP capture with a hard timeout. format "png" | "jpeg" (quality 1-100); clip {x,y,width,height} optional.
 *  JPEG is ~4-8x smaller than PNG for UI on black and encodes faster; PNG stays the default (lossless evidence). */
export async function captureShot(page, file, { format = "png", quality = 80, clip = null, timeoutMs = 30000 } = {}) {
  if (format !== "png" && format !== "jpeg") throw new Error(`captureShot: format must be png|jpeg (got ${format})`);
  const s = await page.context().newCDPSession(page);
  let timer;
  try {
    const params = { format, ...(format === "jpeg" ? { quality } : {}), ...(clip ? { clip: { ...clip, scale: 1 } } : {}) };
    const { data } = await Promise.race([
      s.send("Page.captureScreenshot", params),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`capture timed out after ${timeoutMs / 1000} s`)), timeoutMs); }),
    ]).finally(() => clearTimeout(timer));
    fs.writeFileSync(file, Buffer.from(data, "base64"));
  } finally { await s.detach().catch(() => {}); }
}

/** montage (ImageMagick) argv for a contact sheet, or null when there is nothing to tile. */
export function sheetArgs(rows, out, { tile = "3x", width = 560 } = {}) {
  if (!rows.length) return null;
  return [...rows.flatMap((r) => ["-label", r.id, r.file]), "-tile", tile, "-geometry", `${width}x+4+4`, "-pointsize", "12",
    "-background", "#111", "-fill", "#eee", out];
}

/** Build sheet.jpg when `montage` exists; true when written. rows = [{id, file(abs)}]. */
export function contactSheet(rows, out, opts) {
  const args = sheetArgs(rows, out, opts);
  if (!args || spawnSync("sh", ["-c", "command -v montage"]).status !== 0) return false;
  return spawnSync("montage", args, { timeout: 120000 }).status === 0;
}

/** Content hash of everything a UI shot depends on: index.html, css/, js/ (sorted paths + bytes). Null when the tree is unreadable. */
export function inputsHash(root, dirs = ["css", "js"], files = ["index.html"]) {
  const h = crypto.createHash("sha1");
  const walk = (rel) => {
    let ents;
    try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; }
    for (const e of ents.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) walk(r);
      else if (/\.(js|css|html|json|mjs)$/.test(e.name)) { h.update(r + "\0"); h.update(fs.readFileSync(path.join(root, r))); }
    }
  };
  for (const f of files) { try { h.update(f + "\0"); h.update(fs.readFileSync(path.join(root, f))); } catch { return null; } }
  for (const d of dirs) walk(d);
  return h.digest("hex");
}

/** Stable key for one cell: tool + cache version + tree inputs + the cell definition (key order irrelevant). */
export function cellKey(tool, treeHash, cell) {
  const canon = (v) => (v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : Array.isArray(v) ? v.map(canon) : v);
  return crypto.createHash("sha1").update(JSON.stringify([tool, CACHE_VERSION, treeHash, canon(cell)])).digest("hex").slice(0, 20);
}

/** A cell cache under dir: get(key) → {row, file} | null; put(key, row, srcFile). Disabled (always-miss) when treeHash is null. */
export function cellCache(dir, tool, treeHash, { enabled = true } = {}) {
  const on = enabled && !!treeHash;
  if (on) fs.mkdirSync(dir, { recursive: true });
  const meta = (key) => path.join(dir, `${tool}-${key}.json`);
  return {
    on,
    key: (cell) => cellKey(tool, treeHash, cell),
    get(key) {
      if (!on) return null;
      try {
        const row = JSON.parse(fs.readFileSync(meta(key), "utf8"));
        const file = path.join(dir, row._img);
        return fs.existsSync(file) ? { row, file } : null;
      } catch { return null; }
    },
    put(key, row, srcFile) {
      if (!on) return;
      const img = `${tool}-${key}${path.extname(srcFile)}`;
      fs.copyFileSync(srcFile, path.join(dir, img));
      fs.writeFileSync(meta(key), JSON.stringify({ ...row, _img: img }));
    },
  };
}
