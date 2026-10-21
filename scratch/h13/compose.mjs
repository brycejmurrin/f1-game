// before|after pairs + pixel-diff %, from artifacts/h13-stills/{base,now}/<set>/<shot>.png
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
const ROOT = "/home/user/f1-game/artifacts/h13-stills", OUT = path.join(ROOT, "pairs");
fs.mkdirSync(OUT, { recursive: true });
const rows = [];
for (const set of fs.readdirSync(path.join(ROOT, "base")).sort()) {
  for (const f of fs.readdirSync(path.join(ROOT, "base", set)).filter((x) => x.endsWith(".png"))) {
    const a = path.join(ROOT, "base", set, f), b = path.join(ROOT, "now", set, f);
    if (!fs.existsSync(b)) continue;
    const A = await sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const B = await sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let diff = 0; const n = A.info.width * A.info.height;
    for (let i = 0; i < n; i++) { const k = i * 3; if (Math.abs(A.data[k] - B.data[k]) + Math.abs(A.data[k+1] - B.data[k+1]) + Math.abs(A.data[k+2] - B.data[k+2]) > 24) diff++; }
    const w = A.info.width, h = A.info.height;
    const name = `${set}--${f.replace(".png", "")}.jpg`;
    await sharp({ create: { width: w * 2 + 8, height: h, channels: 3, background: "#ffffff" } })
      .composite([{ input: a, left: 0, top: 0 }, { input: b, left: w + 8, top: 0 }]).jpeg({ quality: 78 }).toFile(path.join(OUT, name));
    rows.push({ set, shot: f.replace(".png", ""), file: name, diffPct: +(100 * diff / n).toFixed(2) });
  }
}
fs.writeFileSync(path.join(OUT, "pairs.json"), JSON.stringify(rows, null, 1));
for (const r of rows) console.log(r.set.padEnd(16), r.shot.padEnd(10), String(r.diffPct).padStart(6) + " %");
