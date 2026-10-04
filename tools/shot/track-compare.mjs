#!/usr/bin/env node
// track-compare.mjs — the same shots on a git ref and on the working tree, diffed: "did my change break how it looks?"
// @doc Before/after visual diff: one shot list on `--ref` (a worktree) and the working tree; Δ per pair + side-by-side sheet.
// @skill playwright-probe
//
// Runs tools/shot/track-session.mjs twice — once serving a detached worktree of
// --ref (scratch/compare/<sha>), once serving this checkout — with an identical
// shot list, then scores each pair (fraction of pixels that moved) and writes a
// before | after | diff sheet. The shot list is a preset built from the circuit
// (`quick`: overview + 4 corners; `standard`: every named corner) or a JSON file
// of shot specs. Prints one JSON summary on stdout.
//   node tools/shot/track-compare.mjs --ref HEAD~1 --track spa [--preset quick|standard] [--shots f.json] [--out dir]
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const ref = flag("--ref", "");
const track = flag("--track", "monza");
const preset = flag("--preset", "quick");
const shotsFile = flag("--shots", "");
if (!ref || ref.startsWith("-") || !/^[a-z0-9_]{2,40}$/.test(track)) {
  console.error("usage: track-compare.mjs --ref <git ref> --track <id> [--preset quick|standard] [--shots f.json] [--out dir]");
  process.exit(2);
}
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
const sha = git("rev-parse", "--verify", `${ref}^{commit}`);
const outDir = resolve(ROOT, flag("--out", `artifacts/track-compare/${track}-${sha.slice(0, 9)}`));
mkdirSync(outDir, { recursive: true });
const log = (...m) => console.error("[track-compare]", ...m);

// A detached worktree of the ref: the served js/css/assets come from there.
const wt = join(ROOT, "scratch", "compare", sha.slice(0, 12));
if (!existsSync(join(wt, "index.html"))) {
  mkdirSync(join(ROOT, "scratch", "compare"), { recursive: true });
  try { git("worktree", "prune"); } catch { /* nothing to prune */ }
  git("worktree", "add", "--detach", "--force", wt, sha);
}

/** One track-session child: send ops in order, collect replies by id. */
function session(root, out) {
  const child = spawn(process.execPath, [join(ROOT, "tools/shot/track-session.mjs"), "--serve", "--track", track, "--out", out, "--root", root],
    { cwd: ROOT, stdio: ["pipe", "pipe", "inherit"] });
  let buf = "", seq = 0, ready;
  const waiters = new Map();
  const readyP = new Promise((r) => { ready = r; });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, i); buf = buf.slice(i + 1);
      let m; try { m = JSON.parse(l); } catch { continue; }
      if ("ready" in m) ready(m);
      else if (m.progress != null) log(`${root === ROOT ? "after " : "before"} ${m.note || ""}`);
      else waiters.get(m.id)?.(m);
    }
  });
  const op = (o) => new Promise((r) => { const id = ++seq; waiters.set(id, r); child.stdin.write(JSON.stringify({ id, ...o }) + "\n"); });
  const close = () => new Promise((r) => { child.on("exit", r); child.stdin.end(); });
  return { readyP, op, close };
}

/** One side: plan the preset's shot list in-page if none was given (the AFTER
 *  side does this once; the BEFORE side reuses its exact specs), then batch. */
async function run(root, out, specs) {
  const s = session(root, out);
  const r = await s.readyP;
  if (!r.ready) throw new Error(`session on ${root} never became ready: ${r.error || "?"}`);
  if (!specs) {
    const plan = await s.op({ eval: `(${planSrc()})(a, ${JSON.stringify(preset)})` });
    if (!plan.ok || !Array.isArray(plan.value) || !plan.value.length) throw new Error(`could not plan shots: ${plan.error || "empty"}`);
    specs = plan.value;
  }
  const b = await s.op({ batch: specs });
  await s.close();
  if (!b.ok) throw new Error(b.error);
  return { specs, names: b.shots.map((x) => x.name), failed: b.failed };
}

const afterDir = join(outDir, "after"), beforeDir = join(outDir, "before");
log(`ref ${ref} = ${sha.slice(0, 9)} worktree ${wt}`);
const after = await run(ROOT, afterDir, shotsFile ? JSON.parse(readFileSync(resolve(ROOT, shotsFile), "utf8")) : null);
const before = await run(wt, beforeDir, after.specs);

const pairs = [];
for (const name of after.names) {
  const a = join(afterDir, `${name}.png`), b = join(beforeDir, `${name}.png`);
  if (!existsSync(a) || !existsSync(b)) { pairs.push({ name, missing: !existsSync(a) ? "after" : "before" }); continue; }
  const { width, height } = await sharp(a).metadata();
  const raw = (p) => sharp(p).resize(width, height, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const [ra, rb] = await Promise.all([raw(a), raw(b)]);
  const over = Buffer.alloc(ra.length);
  let changed = 0;
  for (let i = 0; i < ra.length; i += 3) {
    const d = Math.abs(ra[i] - rb[i]) + Math.abs(ra[i + 1] - rb[i + 1]) + Math.abs(ra[i + 2] - rb[i + 2]);
    if (d > 30) { changed++; over[i] = 255; over[i + 1] = 40; over[i + 2] = 40; } else { const g = (ra[i] + ra[i + 1] + ra[i + 2]) / 9; over[i] = over[i + 1] = over[i + 2] = g; }
  }
  const diff = join(outDir, `${name}-diff.png`);
  await sharp(over, { raw: { width, height, channels: 3 } }).png().toFile(diff);
  // The SCORE ignores anti-aliasing shimmer: at full resolution two renders of
  // the same scene differed 2–4 % along every tree and fence edge (HEAD~1 vs a
  // tree with no scenery change, 2026-10-04). A quarter-size, lightly blurred
  // copy keeps a moved or missing prop and drops sub-pixel edge jitter.
  const small = (p) => sharp(p).resize(Math.round(width / 4), Math.round(height / 4), { fit: "fill" }).blur(0.8).removeAlpha().raw().toBuffer();
  const [sa, sb] = await Promise.all([small(a), small(b)]);
  let moved = 0;
  for (let i = 0; i < sa.length; i += 3) {
    if (Math.abs(sa[i] - sb[i]) + Math.abs(sa[i + 1] - sb[i + 1]) + Math.abs(sa[i + 2] - sb[i + 2]) > 45) moved++;
  }
  pairs.push({ name, delta: +(moved / (sa.length / 3)).toFixed(4), rawDelta: +(changed / (width * height)).toFixed(4), before: b, after: a, diff });
}

// before | after | diff, one row per pair, worst first.
pairs.sort((x, y) => (y.delta ?? 1) - (x.delta ?? 1));
const rows = pairs.filter((p) => p.diff);
let sheetPath = null;
if (rows.length) {
  const cw = 320, ch = 180, PAD = 8, LAB = 16;
  const W = 3 * (cw + PAD) + PAD, H = rows.length * (ch + LAB + PAD) + PAD + 18;
  const comp = [], svg = [`<text x="${PAD}" y="14" fill="#fff" font-family="monospace" font-size="12">${track}: before ${sha.slice(0, 9)} | after (working tree) | diff</text>`];
  for (const [r, p] of rows.entries()) {
    const y = 18 + PAD + r * (ch + LAB + PAD);
    for (const [c, f] of [p.before, p.after, p.diff].entries()) comp.push({ input: await sharp(f).resize(cw, ch, { fit: "fill" }).toBuffer(), left: PAD + c * (cw + PAD), top: y });
    svg.push(`<text x="${PAD}" y="${y + ch + 12}" fill="#e6e9ef" font-family="monospace" font-size="11">${p.name}  Δ ${(p.delta * 100).toFixed(1)}%</text>`);
  }
  comp.push({ input: Buffer.from(`<svg width="${W}" height="${H}">${svg.join("")}</svg>`), left: 0, top: 0 });
  sheetPath = join(outDir, "compare-sheet.png");
  await sharp({ create: { width: W, height: H, channels: 3, background: "#14161c" } }).composite(comp).png().toFile(sheetPath);
}
const changedN = pairs.filter((p) => p.delta > 0.005).length;   // > 0.5 % of the denoised frame moved
console.log(JSON.stringify({ ref, sha, track, preset: shotsFile ? null : preset, outDir, sheet: sheetPath,
  pairs: pairs.length, changed: changedN, worst: pairs.slice(0, 5).map((p) => ({ name: p.name, delta: p.delta, missing: p.missing })), all: pairs }, null, 2));

/** The preset's shot specs, computed in the page the same way track-session's
 *  surveyList does — so the before side shoots identical fractions. */
function planSrc() {
  return String((a, preset) => {
    const t = a.trackInfo ? a.trackInfo({ what: "corners" }) : null;
    const list = (t && (t.corners || t.turns)) || [];
    let cs = list.map((c) => ({ name: String(c.name || c.label || c.turn || c.id || "").replace(/[^A-Za-z0-9_-]+/g, "-"), frac: c.frac ?? c.apexFrac ?? c.f })).filter((c) => typeof c.frac === "number");
    if (!cs.length && a.corners) cs = a.corners().map((f, i) => ({ name: `c${i + 1}`, frac: f }));
    cs = cs.slice(0, preset === "quick" ? 4 : 40);
    const shots = [0, 0.25, 0.5, 0.75].map((f) => ({ shot: `sv-ov-${f}`, frac: f, cam: "orbit", el: 60, dist: 400 }));
    cs.forEach((c, i) => {
      const n = `sv-${String(i + 1).padStart(2, "0")}-${c.name || "corner"}`.slice(0, 60);
      shots.push({ shot: `${n}-eye`, frac: +Math.max(0, c.frac - 0.004).toFixed(4), cam: "eye" });
      shots.push({ shot: `${n}-orbit`, frac: +c.frac.toFixed(4), cam: "orbit", az: 45, el: 25, dist: 60 });
      if (preset !== "quick") shots.push({ shot: `${n}-ts`, frac: +c.frac.toFixed(4), cam: "trackside", side: 1, dist: 40 });
    });
    return shots;
  });
}
