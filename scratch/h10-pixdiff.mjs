import sharp from "sharp"; import fs from "node:fs";
const [B = "artifacts/h10-split/before", A = "artifacts/h10-split/after"] = process.argv.slice(2);
for (const f of fs.readdirSync(B).filter((f) => f.endsWith(".png")).sort()) {
  if (!fs.existsSync(`${A}/${f}`)) { console.log(f, "no after"); continue; }
  const [b, a] = await Promise.all([B, A].map((d) => sharp(`${d}/${f}`).raw().toBuffer({ resolveWithObject: true })));
  let diff = 0, max = 0; const n = b.info.width * b.info.height, ch = b.info.channels;
  for (let i = 0; i < n; i++) { let m = 0; for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(b.data[i * ch + c] - a.data[i * ch + c])); if (m) diff++; if (m > max) max = m; }
  console.log(f, "diffPx", diff, "of", n, "maxDelta", max);
}
