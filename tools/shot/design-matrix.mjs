#!/usr/bin/env node
// @doc Source-bound captures: browser preflight, bounded commands, safe resume, HTML and hashed gallery.json.
// node tools/shot/design-matrix.mjs --part=sidepod --angles=headOn,grazing --colours=dark,light
//   '--variants=pod=#225bb4;podFinish=satin;coverFinish=pearl' --backend=three --run=study
//   [--lights=lamp,off,keyHi] [--team=mercedes] [--resume|--index-only] [--plan]
//   [--fill=0.7] [--fov=45] [--viewport=1280x720|--phone] [--batch=k/n] [--bounds=@file.json] [--out=artifacts/...]
// Plan is read-only; index-only verifies existing captures without a browser. No browser installation or CPU substitution.
// @skill garage-parts-livery
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, realpathSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { loadavg } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { resolveChromium, executableFile } from "../lib/chromium-path.mjs";
import { PART_BOXES, expandMatrix, batchSlice, pendingGroups, cameraFor, checkLimits, parseArgs, sheetHtml, labelDiff } from "./lib/design-matrix.mjs";
import { digest, matrixOutputDir, captureSource, matrixManifest, resumeManifest, evidenceFile, metadataFile, validateRunDirectory, verifiedCell, galleryIndex, garageChannel } from "./lib/design-matrix-run.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter(l => l.startsWith("//")).slice(1, 7).join("\n")); return; }
  const boxes = o.bounds ? { ...PART_BOXES, ...JSON.parse(readFileSync(o.bounds.replace(/^@/, ""), "utf8")) } : PART_BOXES;
  for (const id of o.parts) {
    const b = boxes[id];
    if (!b || !Array.isArray(b.c) || b.c.length !== 3 || !b.c.every(Number.isFinite) || !Array.isArray(b.size) || b.size.length !== 3 || !b.size.every(v => Number.isFinite(v) && v > 0) || !Number.isFinite(b.face)) throw new Error(`invalid part bounds: ${id}`);
  }
  const allGroups = expandMatrix(o, boxes), groups = o.batch ? batchSlice(allGroups, ...o.batch) : allGroups;
  if (!groups.length) throw new Error("selected matrix/batch is empty");
  const run = o.run || `run-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
  const outDir = matrixOutputDir(ROOT, run, o.out), source = captureSource(ROOT);
  const request = { team: o.team, backend: o.backend, viewport: o.viewport, dpr: o.dpr, fill: o.fill, fov: o.fov, boxes, groups: allGroups };
  const expected = matrixManifest(run, source, request), mfPath = metadataFile(outDir, "manifest.json");
  const discovery = resolveChromium(), browserAvailable = !!discovery?.path && executableFile(discovery.path);
  if (o.plan) { console.log(JSON.stringify({ run, outDir, groups: groups.length, cells: groups.reduce((n, g) => n + g.cells.length, 0), source, signature: expected.signature, browser: { available: browserAvailable, discovery: discovery || null, launchVerified: false } }, null, 2)); return; }
  validateRunDirectory(outDir);
  const prior = existsSync(mfPath) ? JSON.parse(readFileSync(mfPath, "utf8")) : null;
  if (prior && !o.resume && !o.indexOnly) throw new Error("run already exists; use --resume or a new --run");
  if (!prior && (o.resume || o.indexOnly)) throw new Error("no manifest to resume/index");
  if (!prior && existsSync(outDir) && readdirSync(outDir).length) throw new Error("output directory is not empty; use a new --run/--out");
  const manifest = prior ? resumeManifest(prior, expected) : expected;
  for (const cell of Object.values(manifest.cells)) if (cell.status === "done" && !verifiedCell(outDir, cell, o.backend)) cell.status = "stale";
  const todo = pendingGroups(groups, manifest, (_png, cell) => verifiedCell(outDir, cell, o.backend));
  if (!o.indexOnly && todo.length) {
    if (!browserAvailable) throw new Error("native screenshots unavailable: no executable Chromium discovered. Run bash tools/env/ensure-mcp-ready.sh and configure PW_CHROMIUM with an installed executable. No browser installed or CPU images substituted.");
    checkLimits({ ...o, load: loadavg()[0] });
  }
  mkdirSync(outDir, { recursive: true });
  const save = () => { const tmp = join(outDir, `.manifest-${randomUUID()}.tmp`); writeFileSync(tmp, JSON.stringify(manifest, null, 2), { flag: "wx" }); renameSync(tmp, mfPath); };
  const indexes = () => {
    writeFileSync(metadataFile(outDir, "gallery.json"), JSON.stringify(galleryIndex(allGroups, manifest), null, 2));
    writeFileSync(metadataFile(outDir, "sheet.html"), sheetHtml(allGroups, manifest, { title: `design matrix ${run}`, phone: o.phone || o.viewport[0] === 844 }));
  };
  save();
  if (!o.indexOnly && todo.length) {
    const child = spawn(process.execPath, [join(ROOT, "tools/shot/garage-angles.mjs"), "--serve", `--team=${o.team}`, `--backend=${o.backend}`, `--viewport=${o.viewport.join("x")}`, `--out=${outDir}`], { cwd: ROOT, stdio: ["pipe", "pipe", "inherit"] });
    const channel = garageChannel(child);
    try {
      await channel.ready; delete manifest.failure;
      for (const g of todo) {
        const camera = cameraFor(g.part, g.angle, { fov: o.fov, fill: o.fill, aspect: o.viewport[0] / o.viewport[1] }, boxes);
        const lamp = g.light === "off" ? "off" : camera.lamp || ({ 0: "front", 90: "side", 180: "wingRear" }[Math.round(boxes[g.part].face / 90) * 90 % 360] || "side");
        for (const cell of g.cells) {
          if (JSON.stringify(captureSource(ROOT)) !== JSON.stringify(source)) throw new Error("source changed during capture; start a new --run");
          const r = await channel.send({ design: cell.design, base: cell.base, frame: { ...camera, lamp, clamp: false }, shot: cell.key });
          if (!r.ok) { manifest.cells[cell.key] = { status: "failed", error: r.error }; save(); continue; }
          if (JSON.stringify(captureSource(ROOT)) !== JSON.stringify(source)) throw new Error("source changed during capture; receipt cannot be attributed");
          const receipt = r.shot;
          if (!receipt || receipt.backend !== o.backend || !receipt.readiness || !receipt.via) throw new Error("capture receipt lacks requested backend/present evidence");
          const png = basename(receipt.png), file = evidenceFile(outDir, png);
          if (realpathSync(receipt.png) !== realpathSync(file)) throw new Error("capture receipt points outside this run");
          const meta = await sharp(file).metadata();
          if (meta.format !== "png") throw new Error("capture is not PNG");
          const m = { status: "done", png, sha256: digest(readFileSync(file)), width: meta.width, height: meta.height, az: receipt.az, el: receipt.el, dist: receipt.dist, receipt, diff: null };
          if (!cell.isBaseline && verifiedCell(outDir, manifest.cells[cell.baselineKey], o.backend)) { const d = await channel.send({ diff: [cell.baselineKey, cell.key] }); m.diff = d.ok ? d.diff : null; }
          manifest.cells[cell.key] = m; save(); indexes(); console.log(`${cell.key}  ${labelDiff(m.diff, cell.isBaseline).text}`);
        }
      }
    } catch (error) { manifest.failure = { error: error.message }; throw error; }
    finally { try { await channel.close(); } finally { save(); indexes(); } }
  }
  indexes();
  const selected = galleryIndex(groups, manifest), full = galleryIndex(allGroups, manifest);
  console.log(`= matrix ${selected.completed}/${selected.requested} selected; gallery ${full.completed}/${full.requested} -> ${join(outDir, "sheet.html")}`);
  if (!selected.complete) process.exitCode = 1;
}
main().catch(error => { console.error(`design-matrix: ${error.message}`); process.exitCode = 1; });
