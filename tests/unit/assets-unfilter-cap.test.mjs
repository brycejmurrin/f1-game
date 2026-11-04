// assets-unfilter-cap.test.mjs — the main-thread PNG unfilter budget (#4777).
// js/render/shared/assets.js _decodeStripBytes unfilters ONE layer's rows per task
// (worker lane off unless apex26.packDecodeWorker=1). Node bench: normal-256 worst
// layer 14.9 ms (phone est. 4-6x). This pins the two inputs of that cost: the bytes
// a layer task touches (rows x stride) and the PNG filter types the bake emits.
// Run: node --test tests/unit/assets-unfilter-cap.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACK = path.join(ROOT, "assets", "pack");
const SRC = fs.readFileSync(path.join(ROOT, "js", "render", "shared", "assets.js"), "utf8");
// One layer task = size rows x (size*4) bytes: 256 KB today at size 256.
const LAYER_TASK_BYTES_CAP = 256 * 1024;
const ALLOWED_FILTERS = new Set([0, 1, 2, 3, 4]);   // _unfilterRows throws on anything else

function strip(file) {
  const png = fs.readFileSync(path.join(PACK, file));
  const idat = [];
  let w = 0, h = 0;
  for (let p = 8; p + 8 <= png.length;) {
    const len = png.readUInt32BE(p), type = png.toString("latin1", p + 4, p + 8), d = p + 8;
    if (type === "IHDR") { w = png.readUInt32BE(d); h = png.readUInt32BE(d + 4); }
    else if (type === "IDAT") idat.push(png.subarray(d, d + len));
    p = d + len + 4;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const filters = new Set();
  for (let r = 0; r < h; r++) filters.add(raw[r * (stride + 1)]);
  return { w, h, stride, filters };
}

test("runtime unfilters one layer per task and yields between layers", () => {
  assert.match(SRC, /for \(let i = 0; i <= last; i\+\+\) \{\s*if \(i\) \{ await _yieldDecode\(\);/);
  assert.match(SRC, /_unfilterRows\(raw, pix, stride, i \* size, \(i \+ 1\) \* size\)/);
});

for (const file of fs.existsSync(PACK) ? fs.readdirSync(PACK).filter((f) => /^mat-(albedo|normal)-\d+\.png$/.test(f)) : []) {
  test(`${file}: layer task rows x stride <= ${LAYER_TASK_BYTES_CAP} B, filters pinned`, () => {
    const { w, stride, filters } = strip(file);
    const size = w;   // square layers stacked vertically
    assert.ok(size * stride <= LAYER_TASK_BYTES_CAP, `${file}: layer task ${size * stride} B exceeds cap`);
    for (const f of filters) assert.ok(ALLOWED_FILTERS.has(f), `${file}: unknown PNG filter type ${f}`);
  });
}
