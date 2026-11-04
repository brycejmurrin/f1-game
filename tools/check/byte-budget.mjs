// byte-budget.mjs — DOWNLOAD-byte measurements behind the `tree` ratchets eagerGzip, eagerCssGzip, lazyCircuitGzipMax,
// lazyAudioGzip and raceEntryBytes (tests/data/ratchets.json), plus the race-entry golden list.
// @doc Download-byte (gzip) measures for the eager shell, CSS, lazy circuits, lazy audio and the race-entry file set.
//
// Raw bytes (tests/unit/boot-load-budget.test.mjs) reward deleting comments; players download gzip. Each file is
// gzipped alone at level 9 (what a static host serves per file), deterministic for a given zlib. Brotli stays a report
// until deploy-research confirms Pages serves it (`node tools/check/byte-budget.mjs` prints it).
//   node tools/check/byte-budget.mjs           # the numbers + brotli report
//   node tools/check/byte-budget.mjs --golden  # rewrite tests/data/race-entry-files.json (a reviewed diff)
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
export const GOLDEN = path.join(ROOT, "tests/data/race-entry-files.json");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel));
export const gz = (rel) => zlib.gzipSync(read(rel), { level: 9 }).length;
export const br = (rel) => zlib.brotliCompressSync(read(rel)).length;
const sum = (files, f) => files.reduce((n, rel) => n + f(rel), 0);
const manifest = () => require("../manifest.cjs");

/** Local `src=` / `href=` targets of index.html, comments stripped, query dropped. */
function tags(re) {
  const html = read("index.html").toString("utf8").replace(/<!--[\s\S]*?-->/g, "");
  return [...html.matchAll(re)].map((m) => m[1]).filter((s) => !/^(https?:)?\/\//.test(s));
}
export const eagerScripts = () => tags(/<script\b[^>]*\bsrc="([^"?#]+)/g);
export const eagerCss = () => tags(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"?#]+)/g);

export const eagerGzip = () => sum(eagerScripts(), gz);
export const eagerCssGzip = () => sum(eagerCss(), gz);
/** Worst single circuit: gzip(path def + scenery). The ratchet caps the worst, so one outlier is a reviewed raise. */
export function lazyCircuitGzipMax() {
  const m = manifest();
  let worst = { id: "", n: 0 };
  for (const id of m.CIRCUITS) {
    const n = gz(`${m.CIRCUITS_DIR}/${id}.js`) + gz(`${m.SCENERY_DIR}/${id}.js`);
    if (n > worst.n) worst = { id, n };
  }
  return worst;
}
export const lazyAudioGzip = () => sum(manifest().LAZY_AUDIO, gz);

/** Files a monza race entry evaluates that have no <script> tag, minus the groups ratcheted on their own
 *  (LAZY_CIRCUIT / LAZY_SCENERY per circuit, LAZY_AGENT, LAZY_NET). Sorted. */
export async function raceEntryFiles() {
  const m = manifest();
  const { createGame } = require("../lib/game-vm.cjs");
  const g = await createGame({ track: "monza" });
  try {
    const skip = new Set([...eagerScripts(), ...m.LAZY_CIRCUIT, ...m.LAZY_SCENERY, ...m.LAZY_AGENT, ...m.LAZY_NET]);
    return [...new Set(g.record.scripts.map((s) => s.file))].filter((f) => !skip.has(f)).sort();
  } finally { g.close(); }
}
export const raceEntryBytes = (files) => sum(files, (f) => read(f).length);
export const goldenFiles = () => JSON.parse(fs.readFileSync(GOLDEN, "utf8")).files;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = await raceEntryFiles();
  if (process.argv.includes("--golden")) {
    fs.writeFileSync(GOLDEN, JSON.stringify({
      _doc: "The lazy files a monza race entry evaluates beyond the index.html tags, minus LAZY_CIRCUIT/LAZY_SCENERY/LAZY_AGENT/LAZY_NET (ratcheted apart). tests/unit/byte-budget.test.mjs pins this list: a new file on the race path is a reviewed diff. Regenerate: node tools/check/byte-budget.mjs --golden",
      files,
    }, null, 2) + "\n");
    console.log(`wrote ${path.relative(ROOT, GOLDEN)} (${files.length} files, ${raceEntryBytes(files)} B)`);
  } else {
    const w = lazyCircuitGzipMax();
    console.log(JSON.stringify({
      eagerGzip: eagerGzip(), eagerBrotli: sum(eagerScripts(), br), eagerCssGzip: eagerCssGzip(),
      lazyCircuitGzipMax: w.n, worstCircuit: w.id, lazyAudioGzip: lazyAudioGzip(),
      raceEntryFiles: files.length, raceEntryBytes: raceEntryBytes(files),
    }, null, 1));
  }
}
