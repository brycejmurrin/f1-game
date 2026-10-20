// node scratch/d1d/cmp.mjs <shot.png> front|rear [crop l,t,w,h] -> scratchpad/cmp.jpg (sheet Rift crop over the shot)
import sharp from "sharp";
const [shot, kind, crop] = process.argv.slice(2);
const ref = kind === "front" ? { left: 10, top: 80, width: 750, height: 400 } : { left: 462, top: 342, width: 290, height: 145 };
const W = 640, rh = Math.round(W * ref.height / ref.width);
const a = await sharp("scratch/d1d-ref.png").extract(ref).resize(W, rh).toBuffer();
let s = sharp(shot); if (crop) { const [l, t, w, h] = crop.split(",").map(Number); s = s.extract({ left: l, top: t, width: w, height: h }); }
const b = await s.resize(W, rh, { fit: "fill" }).toBuffer();
await sharp({ create: { width: W, height: rh * 2, channels: 3, background: "#000" } }).composite([{ input: a, left: 0, top: 0 }, { input: b, left: 0, top: rh }]).jpeg().toFile("/tmp/claude-0/-home-user-f1-game/2e838749-3076-5658-847c-99c196b8d933/scratchpad/cmp.jpg");
