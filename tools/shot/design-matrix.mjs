#!/usr/bin/env node
// @doc Design-review matrix: part x angle x colour x light x variant, close-up framing, per-cell diff vs baseline, HTML sheet.
//   node tools/shot/design-matrix.mjs --part=sidepod,frontWing --angles=headOn,grazing,specular --colours=dark,mid,light
//     --variants=podFinish=matte,podFinish=pearl --baseline=podFinish=gloss [--lights=lamp,off,keyHi] [--team=mercedes]
//     [--fill=0.7] [--fov=45] [--viewport=1280x720|--phone] [--batch=k/n] [--run=name] [--resume] [--plan] [--bounds=@file.json]
//   Parts: PART_BOXES keys; angles: headOn,grazing,specular,low34,haloBehind,topFront; lights: lamp,off,keyHi,keyLo.
//   Drives `garage-angles.mjs --serve` (ONE browser, dpr 1, <=1600x900, refuses at loadavg >= 3). Output:
//   artifacts/design-matrix/<run>/{manifest.json,sheet.html,*.png}. A cell < 0.5 % from its baseline is flagged "looks the same".
// @skill garage-parts-livery
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline";
import {
  PART_BOXES, expandMatrix, batchSlice, pendingGroups, cameraFor, checkLimits, parseArgs, sheetHtml, labelDiff,
} from "./lib/design-matrix.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const o = parseArgs(process.argv.slice(2));
if (o.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).slice(1, 9).join("\n"));
  process.exit(0);
}
const boxes = o.bounds ? { ...PART_BOXES, ...JSON.parse(readFileSync(o.bounds.replace(/^@/, ""), "utf8")) } : PART_BOXES;
const LAMP = { 0: "front", 90: "side", 180: "wingRear" };
const lampFor = (box) => LAMP[Math.round(box.face / 90) * 90 % 360] || "side";

let groups = expandMatrix({ parts: o.parts, angles: o.angles, colours: o.colours, lights: o.lights,
  variants: o.variants, baseline: o.baseline }, boxes);
if (o.batch) groups = batchSlice(groups, ...o.batch);
const run = o.run || `run-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
const outDir = join(ROOT, "artifacts", "design-matrix", run);
const total = groups.reduce((n, g) => n + g.cells.length, 0);
if (o.plan) { console.log(JSON.stringify({ run, outDir, groups: groups.length, cells: total }, null, 2)); process.exit(0); }
checkLimits({ viewport: o.viewport, dpr: o.dpr, load: loadavg()[0] });
mkdirSync(outDir, { recursive: true });

const mfPath = join(outDir, "manifest.json");
const manifest = o.resume && existsSync(mfPath) ? JSON.parse(readFileSync(mfPath, "utf8")) : { run, cells: {} };
const save = () => writeFileSync(mfPath, JSON.stringify(manifest, null, 1));
const todo = o.resume ? pendingGroups(groups, manifest, (p) => existsSync(join(outDir, p))) : groups;
console.log(`design-matrix ${run}: ${todo.length}/${groups.length} groups, ${total} cells -> ${outDir}`);

const child = spawn(process.execPath, [join(ROOT, "tools/shot/garage-angles.mjs"), "--serve", `--team=${o.team}`,
  `--viewport=${o.viewport.join("x")}`, `--out=${outDir}`], { cwd: ROOT, stdio: ["pipe", "pipe", "inherit"] });
const rl = readline.createInterface({ input: child.stdout });
const waiters = [];
let ready;
const readyP = new Promise((r) => { ready = r; });
rl.on("line", (l) => {
  let j; try { j = JSON.parse(l); } catch { return; }
  if (j.ready) ready(j); else waiters.shift()?.(j);
});
child.on("exit", (c) => { for (const w of waiters) w({ ok: false, error: `garage-angles exited ${c}` }); });
const send = (cmd) => new Promise((res) => { waiters.push(res); child.stdin.write(JSON.stringify(cmd) + "\n"); });

try {
  await readyP;
  for (const g of todo) {
    const box = boxes[g.part];
    const c = cameraFor(g.part, g.angle, { fov: o.fov, fill: o.fill, aspect: o.viewport[0] / o.viewport[1] }, boxes);
    const lamp = g.light === "off" ? "off" : (c.lamp || lampFor(box));
    for (const cell of g.cells) {
      const r = await send({ design: cell.design, base: cell.base, frame: { view: c.view, az: c.az, el: c.el, dist: c.dist, target: c.target, lamp, clamp: false }, shot: cell.key });
      if (!r.ok) { manifest.cells[cell.key] = { status: "failed", error: r.error }; save(); console.error(`FAIL ${cell.key}: ${r.error}`); continue; }
      const m = { status: "done", png: basename(r.shot.png), az: r.shot.az, el: r.shot.el, dist: r.shot.dist, diff: null };
      if (!cell.isBaseline) {
        const d = await send({ diff: [cell.baselineKey, cell.key] });
        m.diff = d.ok ? d.diff : null;
      }
      manifest.cells[cell.key] = m; save();
      console.log(`${cell.key}  ${labelDiff(m.diff, cell.isBaseline).text}`);
    }
  }
} finally {
  child.stdin.write(JSON.stringify({ quit: true }) + "\n");
  child.stdin.end();
}
writeFileSync(join(outDir, "sheet.html"), sheetHtml(groups, manifest, { title: `design matrix ${run}`, phone: o.phone || o.viewport[0] === 844 }));
const cells = Object.values(manifest.cells), same = Object.entries(manifest.cells).filter(([, c]) => c.diff != null && c.diff * 100 < 0.5);
console.log(`= matrix ${cells.filter((c) => c.status === "done").length}/${total} done, ${cells.filter((c) => c.status === "failed").length} failed, ${same.length} look the same -> ${join(outDir, "sheet.html")}`);
process.exit(cells.some((c) => c.status === "failed") ? 1 : 0);
