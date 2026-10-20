// Compose size-sheet.mjs output: <id>-<view>-before.jpg, -after.jpg (after render with the
// before outline in red and the team car's in blue), for the gallery's before/after pairs.
// node design-preview/bodies/size-sheet-compose.mjs <r4Dir> <outImgDir> <ids,...>
import fs from "node:fs"; import sharp from "sharp";
const [dir, out, idsS] = process.argv.slice(2);
const V = JSON.parse(fs.readFileSync(`${dir}/after/views.json`, "utf8"));
fs.mkdirSync(out, { recursive: true });
const edge = (m, W, H) => { const e = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const o = y * W + x;
    if (m[o] && (!m[o - 1] || !m[o + 1] || !m[o - W] || !m[o + W])) e[o] = 1; } return e; };
const thick = (e, W, H) => { const t = new Uint8Array(W * H); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (e[y * W + x]) for (const d of [0, 1, -1, W, -W]) t[y * W + x + d] = 1; return t; };
const jpg = (buf, W, H, p) => sharp(buf, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 88 }).toFile(p);
for (const id of idsS.split(",")) for (const [v, [W, H]] of Object.entries(V)) {
  const rd = (s, k) => fs.readFileSync(`${dir}/${s}/${id === "team" ? "team" : id}-${v}.${k}`);
  const aImg = Buffer.from(rd("after", "rgb")), teamM = fs.readFileSync(`${dir}/after/team-${v}.mask`);
  const tE = edge(teamM, W, H);
  if (fs.existsSync(`${dir}/before/${id}-${v}.rgb`)) {
    const bImg = Buffer.from(rd("before", "rgb")), bM = rd("before", "mask");
    for (let o = 0; o < W * H; o++) if (tE[o]) { bImg[o * 3] = 40; bImg[o * 3 + 1] = 110; bImg[o * 3 + 2] = 230; }
    await jpg(bImg, W, H, `${out}/r4-${id}-${v}-before.jpg`);
    const bE = thick(edge(bM, W, H), W, H);
    for (let o = 0; o < W * H; o++) { if (tE[o]) { aImg[o * 3] = 40; aImg[o * 3 + 1] = 110; aImg[o * 3 + 2] = 230; }
      if (bE[o]) { aImg[o * 3] = 220; aImg[o * 3 + 1] = 30; aImg[o * 3 + 2] = 30; } }
    await jpg(aImg, W, H, `${out}/r4-${id}-${v}-after.jpg`);
  } else {
    for (let o = 0; o < W * H; o++) if (tE[o] && id !== "team") { aImg[o * 3] = 40; aImg[o * 3 + 1] = 110; aImg[o * 3 + 2] = 230; }
    await jpg(aImg, W, H, `${out}/r4-${id}-${v}.jpg`);
  }
}
// 2x close-ups of the feature each round-4 cut touched, from the side frames.
const CROP = { highnose: [0, 330], stepnose: [0, 330], lowline: [0, 330], sharkfin: [400, 444] };
for (const id of idsS.split(",")) if (CROP[id]) for (const s of ["before", "after"]) {
  const [x0, w] = CROP[id], p = `${out}/r4-${id}-side-${s}.jpg`;
  if (fs.existsSync(p)) await sharp(p).extract({ left: x0, top: 10, width: w, height: 185 }).resize(w * 2, 370, { kernel: "nearest" }).jpeg({ quality: 88 }).toFile(`${out}/r4-${id}-close-${s}.jpg`);
}
