// @doc Source-bound capture manifests, file verification and bounded garage JSON-line transport.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, lstatSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { assertContainedPath, assertOutputDir } from "../../lib/output-paths.mjs";
export const digest = bytes => createHash("sha256").update(bytes).digest("hex");
export function matrixOutputDir(root, run, out) {
  const dir = assertOutputDir(resolve(root, out || join("artifacts/design-matrix", run)), root);
  let ancestor = dir;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  assertOutputDir(resolve(realpathSync(ancestor), relative(ancestor, dir)), realpathSync(root));
  return dir;
}
export function captureSource(root) {
  const git = (...args) => execFileSync("git", args, { cwd: root, maxBuffer: 64 * 1024 ** 2 });
  const revision = git("rev-parse", "HEAD").toString().trim(), tree = git("rev-parse", "HEAD^{tree}").toString().trim();
  const diff = git("diff", "--no-ext-diff", "--no-textconv", "--binary", "HEAD", "--");
  const files = git("ls-files", "--others", "--exclude-standard", "-z", "--", "js", "css", "assets", "tools", "index.html", "sw.js").toString().split("\0").filter(f => f && !f.split("/").some(p => p.startsWith("."))).sort();
  const untracked = files.map(f => { const file = join(root, f); if (!lstatSync(file).isFile()) throw new Error(`untracked source must be a regular file: ${f}`); return [f, digest(readFileSync(file))]; });
  return { revision, tree, dirty: !!diff.length || !!files.length, worktreeHash: digest(Buffer.concat([diff, Buffer.from(JSON.stringify(untracked))])), fingerprintScope: "all tracked changes plus non-hidden untracked runtime/tool files" };
}
export function matrixManifest(run, source, request) {
  return { schemaVersion: 2, kind: "native-screenshot", run, source, request, signature: digest(JSON.stringify({ source, request })), cells: {} };
}
export function resumeManifest(prior, expected) {
  if (prior?.schemaVersion !== 2 || prior.kind !== "native-screenshot" || !prior.cells || typeof prior.cells !== "object" || Array.isArray(prior.cells) || prior.signature !== expected.signature || prior.signature !== digest(JSON.stringify({ source: prior.source, request: prior.request }))) throw new Error("resume source/plan differs or provenance is missing; use a new --run");
  return prior;
}
function regularOrAbsent(file) {
  try { if (!lstatSync(file).isFile()) throw new Error("matrix output must be a regular file, not a symlink/directory"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
export function validateRunDirectory(dir) {
  if (existsSync(dir) && readdirSync(dir, { withFileTypes: true }).some(e => e.isSymbolicLink())) throw new Error("matrix run may not contain symlinks");
}
export function evidenceFile(dir, png) {
  if (typeof png !== "string" || png !== basename(png) || !/^[A-Za-z0-9][A-Za-z0-9_.-]*\.png$/.test(png)) throw new Error("unsafe capture filename");
  const file = join(dir, png); regularOrAbsent(file);
  if (existsSync(file)) assertContainedPath(realpathSync(dir), realpathSync(file), "capture file");
  return file;
}
export function metadataFile(dir, name) {
  if (!["manifest.json", "gallery.json", "sheet.html"].includes(name)) throw new Error("unknown matrix metadata file");
  const file = join(dir, name); regularOrAbsent(file); return file;
}
export function verifiedCell(dir, cell, backend) {
  try { return cell?.status === "done" && cell.receipt?.readiness && typeof cell.receipt.via === "string" && !!cell.receipt.via && ["three", "webgl2", "webgpu"].includes(cell.receipt.backend) && (!backend || backend === cell.receipt.backend) && /^[a-f0-9]{64}$/.test(cell.sha256 || "") && digest(readFileSync(evidenceFile(dir, cell.png))) === cell.sha256; }
  catch { return false; }
}
export function galleryIndex(groups, manifest) {
  if (manifest.kind !== "native-screenshot") throw new Error("gallery requires native-screenshot manifest");
  const cells = groups.flatMap(g => g.cells.map(c => ({ g, c, r: manifest.cells[c.key] })));
  const items = cells.filter(({ r }) => r?.status === "done" && /^[a-f0-9]{64}$/.test(r.sha256 || "") && r.receipt?.backend === manifest.request.backend && r.receipt.readiness && r.receipt.via).map(({ g, c, r }) => ({
    id: c.key, title: `${g.part} · ${g.angle} · ${c.variant}`, kind: "native-screenshot", src: r.png, sha256: r.sha256, sourceRevision: manifest.source.revision, source: manifest.source,
    team: manifest.request.team, part: g.part, angle: g.angle, colour: g.colour, lighting: g.light, variant: c.variant, base: c.base, design: c.design, isBaseline: c.isBaseline, baselineId: c.baselineKey,
    backend: r.receipt.backend, frame: { az: r.az, el: r.el, dist: r.dist, pan: r.receipt.pan }, readiness: r.receipt.readiness, via: r.receipt.via, diff: r.diff,
  }));
  const ids = new Set(items.map(i => i.id));
  return { schemaVersion: 1, kind: "native-screenshot-gallery", source: manifest.source, requested: cells.length, completed: items.length, complete: items.length === cells.length, missing: cells.filter(x => !ids.has(x.c.key)).map(x => x.c.key), items };
}
// Lifecycle: https://nodejs.org/api/child_process.html#event-close
export function garageChannel(child, { startupMs = 180000, commandMs = 120000 } = {}) {
  const lines = createInterface({ input: child.stdout });
  let readyDone = false, dead = null, pending = null, startup, acceptReady, rejectReady, sequence = 0;
  const ready = new Promise((yes, no) => { acceptReady = yes; rejectReady = no; });
  function fail(error) {
    dead ||= error; clearTimeout(startup);
    if (!readyDone) { readyDone = true; rejectReady(dead); }
    if (pending) { clearTimeout(pending.timer); pending.reject(dead); pending = null; }
  }
  startup = setTimeout(() => fail(new Error("garage startup timed out")), startupMs);
  child.once("error", fail);
  child.once("close", (code, signal) => { fail(new Error(`garage exited before completing work (${signal || code})`)); lines.close(); });
  child.stdin.on("error", fail);
  lines.on("line", line => {
    let value; try { value = JSON.parse(line); } catch { return; }
    if (!value || typeof value !== "object" || dead) return;
    if (!readyDone && value.ok === false) { fail(new Error(`garage startup refused: ${value.error}`)); return; }
    if (!readyDone && value.ready) { readyDone = true; clearTimeout(startup); acceptReady(value); return; }
    if (pending && value.id === pending.id) { const p = pending; pending = null; clearTimeout(p.timer); p.resolve(value); }
  });
  return {
    ready,
    send(cmd) {
      if (dead) return Promise.reject(dead);
      if (!readyDone || pending) return Promise.reject(new Error("garage not ready or command already pending"));
      return new Promise((resolveReply, reject) => {
        const id = ++sequence, timer = setTimeout(() => fail(new Error(`garage command ${id} timed out`)), commandMs);
        pending = { id, timer, resolve: resolveReply, reject };
        try { child.stdin.write(JSON.stringify({ ...cmd, id }) + "\n"); } catch (error) { fail(error); }
      });
    },
    async close() {
      clearTimeout(startup);
      if (child.exitCode != null || child.signalCode != null) { lines.close(); return; }
      const stopped = new Promise(done => child.once("close", done));
      if (!child.stdin.destroyed && child.stdin.writable) child.stdin.end(JSON.stringify({ quit: true }) + "\n");
      let timer;
      const wait = ms => new Promise(done => { timer = setTimeout(() => done(false), ms); });
      const graceful = await Promise.race([stopped.then(() => true), wait(3000)]); clearTimeout(timer);
      if (!graceful) { child.kill("SIGTERM"); const reaped = await Promise.race([stopped.then(() => true), wait(5000)]); clearTimeout(timer); if (!reaped) throw new Error("owned garage cleanup unconfirmed after SIGTERM"); }
      lines.close();
    },
  };
}
