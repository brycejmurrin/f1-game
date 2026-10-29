#!/usr/bin/env node
// @doc Verify capture indexes and package all images, recipes and source receipts into a portable static gallery.
// node tools/shot/capture-gallery.mjs --input=/absolute/path/captures.json --assets=/absolute/path --out=artifacts/gallery-review [--plan]
// Accepts design-matrix gallery.json or the Design Lab captures.json. No browser, upload or source re-attribution.
import { existsSync, readFileSync, writeFileSync, mkdirSync, realpathSync, lstatSync, readdirSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { assertContainedPath } from "../lib/output-paths.mjs";
import { digest, matrixOutputDir } from "./lib/design-matrix-run.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export async function prepareGallery(input, assets) {
  const bytes = readFileSync(input), data = JSON.parse(bytes), root = realpathSync(assets);
  if (!Array.isArray(data.items) || !data.items.length) throw new Error("input must contain a nonempty items array");
  const ids = new Set(), items = [], files = new Map();
  for (const item of data.items) {
    if (typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.title !== "string") throw new Error("unique item ids and titles required");
    ids.add(item.id);
    if (typeof item.src !== "string" || !/^[A-Za-z0-9_./-]+\.(png|webp|jpe?g)$/.test(item.src)) throw new Error(`unsafe image path: ${item.id}`);
    const file = assertContainedPath(root, resolve(root, item.src), "gallery image");
    if (!lstatSync(file).isFile()) throw new Error(`image must be a regular file: ${item.id}`);
    assertContainedPath(root, realpathSync(file), "gallery image");
    const image = readFileSync(file), sha256 = digest(image);
    if (!/^[a-f0-9]{64}$/.test(item.sha256 || "") || item.sha256 !== sha256) throw new Error(`image hash mismatch or missing: ${item.id}`);
    const meta = await sharp(image).metadata();
    if (!["png", "webp", "jpeg"].includes(meta.format)) throw new Error(`unsupported image format: ${item.id}`);
    const geometry = item.geometryOnly === true || item.kind === "geometry-preview";
    const native = !geometry && ["three", "webgl2", "webgpu"].includes(item.backend) && !!item.readiness && typeof item.via === "string" && !!item.via;
    const kind = geometry ? "geometry-preview" : native ? "native-screenshot" : "unverified-visual";
    if (item.kind === "native-screenshot" && !native) throw new Error(`native receipt incomplete: ${item.id}`);
    const src = `assets/${sha256}${extname(file).toLowerCase()}`;
    files.set(src, image);
    items.push({ ...item, src, original: src, kind, width: meta.width, height: meta.height, sha256 });
  }
  const counts = Object.fromEntries(["native-screenshot", "geometry-preview", "unverified-visual"].map(kind => [kind, items.filter(i => i.kind === kind).length]));
  return { data: { ...data, items, export: { schemaVersion: 1, inputSha256: digest(bytes), counts, images: files.size, note: "Existing capture sources and statuses preserved. File hashes checked at export; no new captures made." } }, files };
}
export function galleryHtml(data) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Apex 26 · Capture collection</title><style>body{margin:0;background:#151918;color:#e9eeea;font:15px system-ui}header,main{padding:24px;max-width:1600px;margin:auto}h1{font-size:clamp(32px,6vw,72px);margin:0}a{color:#c9ed62}input,select{font:inherit;padding:12px;margin:8px 8px 8px 0;max-width:100%;background:#252b28;color:inherit;border:1px solid #657066}#grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:20px}article{background:#222825;padding:12px}img{width:100%;height:auto;display:block}h2{font-size:19px}p{overflow-wrap:anywhere}small{color:#c4cfc6}details{margin:12px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><header><p>APEX 26 / DESIGN REVIEW</p><h1>Every angle. Every finish.</h1><p>${data.items.length} visuals · ${data.export.counts["native-screenshot"]} recorded native screenshots · ${data.export.counts["geometry-preview"]} geometry previews.</p><p>Source revisions, capture conditions and historical status stay with every image.</p><a href="gallery.json">Download complete gallery index</a><div><label>Find <input id="search" type="search" placeholder="Body, part, color or finish"></label><label>Show <select id="kind"><option value="all">All visuals</option><option value="native-screenshot">Native screenshots</option><option value="geometry-preview">Geometry previews</option><option value="unverified-visual">Unverified visuals</option></select></label></div><p id="count" aria-live="polite">${data.items.length} visuals</p></header><main id="grid">${data.items.map(item => `<article data-kind="${esc(item.kind)}"><a href="${esc(item.src)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(item.src)}" alt="${esc(item.title)}" width="${item.width}" height="${item.height}"></a><h2>${esc(item.title)}</h2><small>${esc(item.kind)} · ${esc(item.status || "source status not recorded")} · ${esc(item.lane)}</small><p>${esc(item.finish || item.variant)} · ${esc(item.lighting || item.light || "lighting not recorded")}</p><p>${esc(item.description)}</p><small>Source ${esc(item.sourceRevision || item.source?.revision || "not recorded")} · ${esc(item.backend || "backend not recorded")}${item.completeTriangles ? ` · ${esc(item.completeTriangles)} complete-car triangles` : ""}</small><details><summary>Camera, design and file receipt</summary><pre>${esc(JSON.stringify({ frame: item.frame, design: item.design, readiness: item.readiness, via: item.via, sha256: item.sha256 }, null, 2))}</pre></details></article>`).join("")}</main><script src="gallery.js"></script></html>`;
}
const galleryScript = `const search=document.getElementById('search'),kind=document.getElementById('kind'),cards=[...document.querySelectorAll('article')];function filter(){let n=0;for(const card of cards){card.hidden=!(kind.value==='all'||card.dataset.kind===kind.value)||!card.textContent.toLowerCase().includes(search.value.toLowerCase());if(!card.hidden)n++;}document.getElementById('count').textContent=n+' visuals';}search.addEventListener('input',filter);kind.addEventListener('change',filter);`;
async function main() {
  const o = {};
  for (const arg of process.argv.slice(2)) {
    if (arg === "--plan") { o.plan = true; continue; }
    const m = /^--(input|assets|out)=(.+)$/.exec(arg);
    if (!m || Object.hasOwn(o, m[1])) throw new Error(`unknown/duplicate argument ${arg}`);
    o[m[1]] = m[2];
  }
  if (!o.input || !o.assets || !o.out) throw new Error("requires --input=... --assets=... --out=artifacts/...");
  const out = matrixOutputDir(ROOT, "export", o.out);
  if (existsSync(out) && readdirSync(out).length) throw new Error("export output must be new or empty");
  const { data, files } = await prepareGallery(resolve(o.input), resolve(o.assets));
  if (!o.plan) {
    mkdirSync(join(out, "assets"), { recursive: true });
    for (const [src, bytes] of files) writeFileSync(join(out, src), bytes, { flag: "wx" });
    for (const [name, contents] of [["gallery.json", JSON.stringify(data, null, 2)], ["index.html", galleryHtml(data)], ["gallery.js", galleryScript]]) writeFileSync(join(out, name), contents, { flag: "wx" });
  }
  console.log(JSON.stringify({ plan: !!o.plan, out, total: data.items.length, ...data.export }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`capture-gallery: ${error.message}`); process.exitCode = 1; });
