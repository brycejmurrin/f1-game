// node design-preview/concept-bodies/cmp.mjs <shot.png> front|rear [crop l,t,w,h] [output.jpg]
// Default: scratch/d1d/cmp.jpg (sheet crop over the shot).
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertOutputDir } from "../../tools/lib/output-paths.mjs";
const [shot, kind, crop, out = "scratch/d1d/cmp.jpg"] = process.argv.slice(2);
if (!shot || !["front", "rear"].includes(kind)) throw new Error("Supply shot.png and front|rear");
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const output = path.resolve(ROOT, out);
assertOutputDir(path.dirname(output), ROOT);
fs.mkdirSync(path.dirname(output), { recursive: true });
const parent = fs.realpathSync(path.dirname(output));
assertOutputDir(parent, ROOT);
if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error("Refusing symlink output");
const canonicalOutput = path.join(parent, path.basename(output));
for (const input of [shot, "scratch/d1d-ref.png"]) {
  const sameFile = fs.existsSync(canonicalOutput) && fs.statSync(input).dev === fs.statSync(canonicalOutput).dev && fs.statSync(input).ino === fs.statSync(canonicalOutput).ino;
  if (fs.realpathSync(input) === canonicalOutput || sameFile) throw new Error("Output must differ from source images");
}
const ref = kind === "front" ? { left: 10, top: 80, width: 750, height: 400 } : { left: 462, top: 342, width: 290, height: 145 };
const W = 640, rh = Math.round(W * ref.height / ref.width);
const a = await sharp("scratch/d1d-ref.png").extract(ref).resize(W, rh).toBuffer();
let s = sharp(shot); if (crop) { const [l, t, w, h] = crop.split(",").map(Number); s = s.extract({ left: l, top: t, width: w, height: h }); }
const b = await s.resize(W, rh, { fit: "fill" }).toBuffer();
await sharp({ create: { width: W, height: rh * 2, channels: 3, background: "#000" } }).composite([{ input: a, left: 0, top: 0 }, { input: b, left: 0, top: rh }]).jpeg().toFile(canonicalOutput);
