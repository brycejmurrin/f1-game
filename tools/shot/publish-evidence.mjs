#!/usr/bin/env node
// @doc Packages generated evidence with provenance and publishes checksum-verified GitHub Release assets outside Git history.
// No upload without --publish. One prerelease per bundle supports immutable releases.
// Requires tar; publication also needs gh authenticated with contents:write.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertOutputDir } from "../lib/output-paths.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const REPOSITORY = "brycejmurrin/f1-game";
// The parentless 35 KB scaffold: release tags must not pin later screenshot history.
export const STORAGE_ANCHOR = "bbc4c0a112921e790535ea52fc04e9c74a1271fb";
const MAX_ASSET_BYTES = 2 ** 31;
const hash = (data) => createHash("sha256").update(data).digest("hex");
const hashFile = (file) => {
  const digest = createHash("sha256"), fd = fs.openSync(file, "r"), chunk = Buffer.alloc(2 ** 20);
  try { for (let n; (n = fs.readSync(fd, chunk, 0, chunk.length, null));) digest.update(chunk.subarray(0, n)); }
  finally { fs.closeSync(fd); }
  return digest.digest("hex");
};
const inside = (base, target) => {
  const rel = path.relative(base, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
};
const runDefault = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 16 * 2 ** 20, ...opts });

export function inspectEvidence({ root = ROOT, dir, label }) {
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(label || "")) throw new Error("--label must be 1–48 lowercase letters, digits or hyphens");
  const input = fs.realpathSync(assertOutputDir(path.resolve(root, dir || "."), root, "--dir"));
  const roots = ["artifacts", "scratch"].map((name) => path.join(fs.realpathSync(root), name));
  if (!roots.some((base) => input !== base && inside(base, input))) throw new Error("--dir must resolve inside this checkout's artifacts/ or scratch/");
  const output = path.join(root, "artifacts", "evidence-uploads");
  if (inside(input, output) || inside(output, input)) throw new Error("input must be separate from artifacts/evidence-uploads/");
  const files = [];
  function walk(base, rel = "") {
    for (const ent of fs.readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (ent.name === ".git" || ent.name === "node_modules") throw new Error(`refusing repository/dependency directory: ${ent.name}`);
      const name = rel ? `${rel}/${ent.name}` : ent.name;
      const abs = path.join(base, ent.name);
      if (ent.isSymbolicLink()) throw new Error(`evidence cannot contain symlinks: ${name}`);
      if (ent.isDirectory()) walk(abs, name);
      else if (ent.isFile()) files.push({ path: name, bytes: fs.statSync(abs).size });
      else throw new Error(`evidence must contain only regular files: ${name}`);
    }
  }
  walk(input);
  if (!files.length) throw new Error("evidence directory is empty");
  return { input, label, files, bytes: files.reduce((n, f) => n + f.bytes, 0), repository: REPOSITORY };
}

export function prepareEvidence(opts, run = runDefault) {
  const root = opts.root || ROOT;
  const plan = inspectEvidence(opts);
  const git = (...args) => run("git", ["-C", root, ...args]).trim();
  const sourceSha = git("rev-parse", "HEAD");
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("cannot identify source commit");
  const provenance = {
    sourceSha,
    branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    dirty: Boolean(git("status", "--porcelain", "--untracked-files=normal")),
    trackedDiffSha256: hash(run("git", ["-C", root, "diff", "--binary", "HEAD"], { encoding: "buffer", maxBuffer: 64 * 2 ** 20 })),
  };
  const output = path.join(root, "artifacts", "evidence-uploads");
  const artifactRoot = path.join(root, "artifacts");
  if (fs.existsSync(artifactRoot) && fs.lstatSync(artifactRoot).isSymbolicLink()) throw new Error("artifacts/ must not be a symlink");
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error("evidence upload output must not be a symlink");
  fs.mkdirSync(output, { recursive: true });
  // Reject an output-root symlink before copying or writing any bundle files.
  if (!inside(fs.realpathSync(root), fs.realpathSync(output))) throw new Error("evidence upload output escapes checkout");
  const work = fs.mkdtempSync(path.join(output, `${plan.label}-`));
  const stage = path.join(work, "bundle");
  fs.mkdirSync(path.join(stage, "files"), { recursive: true });
  const files = plan.files.map((f) => {
    const target = path.join(stage, "files", f.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const source = path.join(plan.input, f.path);
    if (!inside(plan.input, fs.realpathSync(path.dirname(source)))) throw new Error(`source directory escaped evidence input: ${f.path}`);
    const fd = fs.openSync(source, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const digest = createHash("sha256"), chunk = Buffer.alloc(2 ** 20);
    let size = 0;
    const dest = fs.openSync(target, "wx");
    try {
      if (!fs.fstatSync(fd).isFile()) throw new Error(`not a regular file: ${f.path}`);
      for (let n; (n = fs.readSync(fd, chunk, 0, chunk.length, null));) {
        digest.update(chunk.subarray(0, n)); size += n;
        for (let offset = 0; offset < n;) offset += fs.writeSync(dest, chunk, offset, n - offset);
      }
    } finally { fs.closeSync(fd); fs.closeSync(dest); }
    return { path: f.path, bytes: size, sha256: digest.digest("hex") };
  });
  const directAssets = [];
  if (opts.linkableFiles) {
    if (!Array.isArray(opts.linkableFiles) || opts.linkableFiles.length > 997) throw new Error("select at most 997 linkable images");
    for (const selected of new Set(opts.linkableFiles)) {
      const file = files.find((f) => f.path === selected);
      if (!file || !/\.(png|jpe?g|webp|gif|avif)$/i.test(file.path)) throw new Error("linkable files must be selected images");
      const basename = path.basename(file.path).toLowerCase().replace(/[^a-z0-9.-]/g, "-").slice(-100);
      const name = `image-${file.sha256}-${basename}`;
      if (!directAssets.some((a) => a.name === name)) fs.copyFileSync(path.join(stage, "files", file.path), path.join(work, name));
      directAssets.push({ path: file.path, name, sha256: file.sha256 });
    }
  }
  const manifest = { schemaVersion: 1, repository: REPOSITORY, storageAnchorSha: STORAGE_ANCHOR, label: plan.label, createdAt: (opts.now || new Date()).toISOString(), ...provenance, files, ...(directAssets.length ? { directAssets } : {}) };
  const manifestName = `${plan.label}-manifest.json`;
  fs.writeFileSync(path.join(work, manifestName), JSON.stringify(manifest, null, 2) + "\n");
  fs.copyFileSync(path.join(work, manifestName), path.join(stage, "manifest.json"));
  const archiveName = `${plan.label}-${sourceSha.slice(0, 12)}.tar.gz`;
  try { run("tar", ["-czf", path.join(work, archiveName), "-C", stage, "."]); }
  finally { fs.rmSync(stage, { recursive: true }); }
  const assets = [...new Set([archiveName, manifestName, ...directAssets.map((a) => a.name)])].map((name) => {
    const bytes = fs.statSync(path.join(work, name)).size;
    if (bytes >= MAX_ASSET_BYTES) throw new Error("each asset must be under 2 GiB; split evidence into smaller captures");
    return { name, bytes, sha256: hashFile(path.join(work, name)) };
  });
  const checksumName = `${archiveName}.sha256`;
  fs.writeFileSync(path.join(work, checksumName), assets.map((f) => `${f.sha256}  ${f.name}\n`).join(""));
  assets.push({ name: checksumName, sha256: hash(fs.readFileSync(path.join(work, checksumName))) });
  const receipt = {
    schemaVersion: 1, state: "prepared", repository: REPOSITORY, storageAnchorSha: STORAGE_ANCHOR,
    tag: `evidence-${plan.label}-${assets[0].sha256.slice(0, 16)}`,
    ...provenance, label: plan.label, assets,
  };
  const receiptPath = path.join(work, "receipt.json");
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  return { ...receipt, receiptPath };
}

function optionalApi(endpoint, run) {
  try { return JSON.parse(run("gh", ["api", endpoint])); }
  catch (e) {
    if (/HTTP 404/.test(String(e.stderr || ""))) return null;
    throw e;
  }
}

export function publishEvidence(receiptPath, run = runDefault) {
  const dir = path.dirname(receiptPath);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  if (receipt.schemaVersion !== 1 || receipt.repository !== REPOSITORY || receipt.storageAnchorSha !== STORAGE_ANCHOR || !/^evidence-[a-z0-9-]+$/.test(receipt.tag) || !/^[a-f0-9]{40}$/.test(receipt.sourceSha)) throw new Error("invalid evidence receipt");
  if (!Array.isArray(receipt.assets) || receipt.assets.length < 3 || receipt.assets.length > 1000) throw new Error("invalid evidence assets");
  for (const asset of receipt.assets) {
    if (path.basename(asset.name) !== asset.name || !/^[a-z0-9.-]+$/.test(asset.name)) throw new Error("invalid asset filename");
    if (hashFile(path.join(dir, asset.name)) !== asset.sha256) throw new Error(`local asset changed: ${asset.name}`);
  }
  const endpoint = `repos/${REPOSITORY}/releases/tags/${receipt.tag}`;
  let release = optionalApi(endpoint, run);
  if (!release) {
    const tag = optionalApi(`repos/${REPOSITORY}/git/ref/tags/${receipt.tag}`, run);
    if (tag && (tag.object?.type !== "commit" || tag.object?.sha !== STORAGE_ANCHOR)) throw new Error("existing evidence tag points at another storage anchor");
    const notes = `Generated evidence for ${receipt.label}.\n\nPackaging checkout: ${receipt.sourceSha}\nWorking tree dirty at packaging: ${receipt.dirty}\nStorage anchor: ${STORAGE_ANCHOR}\n\nThe checkout describes packaging provenance; consult producer metadata to establish the actual captured revision.\n\nDownload the uploaded archive, manifest and checksum file, not the automatic source-code archives (those contain only the storage scaffold). Additional image assets support direct documentation links. Verify with sha256sum -c, then extract and open the gallery under files/ when present. The manifest records file hashes, provenance and direct image mappings.\n\nEvidence storage policy: docs/EVIDENCE-STORAGE.md\n`;
    const notesPath = path.join(dir, "release-notes.md");
    fs.writeFileSync(notesPath, notes);
    // No --clobber, edits or deletions. gh stages assets in a draft before publication.
    run("gh", ["release", "create", receipt.tag, ...receipt.assets.map((f) => path.join(dir, f.name)), "--repo", REPOSITORY,
      "--target", STORAGE_ANCHOR, "--title", `Evidence: ${receipt.label} (${receipt.sourceSha.slice(0, 12)})`,
      "--prerelease", "--latest=false", "--notes-file", notesPath]);
    release = optionalApi(endpoint, run);
  }
  if (!release || release.draft || !release.prerelease || release.tag_name !== receipt.tag || release.target_commitish !== STORAGE_ANCHOR) throw new Error("release metadata does not match evidence receipt; inspect the release before retrying");
  const assets = receipt.assets.map((asset) => {
    const uploaded = release.assets?.find((a) => a.name === asset.name);
    if (uploaded?.digest !== `sha256:${asset.sha256}` || !uploaded.browser_download_url) throw new Error(`uploaded asset checksum unavailable or mismatched: ${asset.name}; inspect the release before retrying`);
    return { ...asset, url: uploaded.browser_download_url };
  });
  const saved = { ...receipt, state: "published", url: release.html_url, assets };
  fs.writeFileSync(receiptPath, JSON.stringify(saved, null, 2) + "\n");
  return { ...saved, receiptPath };
}

export function main(argv = process.argv.slice(2)) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (["--publish", "--plan", "--help"].includes(arg)) opts[arg.slice(2)] = true;
    else if (["--dir", "--label", "--receipt"].includes(arg) && argv[i + 1] && !argv[i + 1].startsWith("--")) opts[arg.slice(2)] = argv[++i];
    else throw new Error(`unknown flag or missing value: ${arg}`);
  }
  if (opts.help) return console.log("node tools/shot/publish-evidence.mjs --dir artifacts/<capture> --label <slug> [--plan | --publish]\nRetry a prepared upload: --receipt artifacts/evidence-uploads/<bundle>/receipt.json --publish\nDefault: prepare locally; --publish creates a prerelease with checksum-verified assets. Requires tar and authenticated gh.");
  if (opts.plan && opts.publish) throw new Error("--plan cannot publish");
  if (opts.receipt && (opts.dir || opts.label || opts.plan || !opts.publish)) throw new Error("--receipt requires --publish and cannot be combined with --dir, --label or --plan");
  if (!opts.receipt && (!opts.dir || !opts.label)) throw new Error("--dir and --label are required");
  const result = opts.receipt ? publishEvidence(path.resolve(opts.receipt))
    : opts.plan ? inspectEvidence(opts)
      : (() => {
        const bundle = prepareEvidence(opts);
        if (!opts.publish) return bundle;
        try { return publishEvidence(bundle.receiptPath); }
        catch (e) { throw new Error(`${e.message}\nPrepared receipt (retry with --receipt ... --publish): ${bundle.receiptPath}`); }
      })();
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (e) { console.error(`publish-evidence: ${e.message}`); process.exitCode = 1; }
}
