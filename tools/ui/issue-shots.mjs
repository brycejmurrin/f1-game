#!/usr/bin/env node
// @doc Download the screenshots attached to an issue or PR (body + comments) so a worker can open and measure them.
// issue-shots.mjs — the path from the owner's phone to a worker (docs/notes/TOOLING-HUNT-2026-11-09.md).
//
// A screenshot sent in chat reaches ONE session; every other worker gets the report re-typed as numbers. An image
// dropped into a GitHub issue or comment is a URL in the Markdown body, and this repo is public, so any session can
// fetch it. This tool finds those URLs, saves the files under artifacts/phone-shots/<n>/, and says for each one which
// of his windows it shows and its px per CSS px (tools/lib/bryce-phone.mjs classifyShot), ready for
// tools/ui/phone-shot-diff.mjs or the Read tool.
//
//   node tools/ui/issue-shots.mjs 5218              # every image on issue/PR #5218
//   node tools/ui/issue-shots.mjs 5218 --json       # machine-readable rows
//   node tools/ui/issue-shots.mjs 5218 --list       # URLs only, download nothing
//   node tools/ui/issue-shots.mjs 5218 --branch     # read them from origin/phone-shots:<n>/ instead (a cloud worker's path)
//   node tools/ui/issue-shots.mjs 5218 --author brycejmurrin --attachments-only --out shots/5218   # the runner's call
//
// MEASURED 2026-11-10: a cloud session's proxy answers `github.com/user-attachments/...` with 403 ("sessions are bound
// to their configured repositories"), so the direct download works on an Actions runner or a laptop and NOT in a
// worker. A worker reads the copies .github/workflows/phone-shots.yml commits to the orphan `phone-shots` branch
// (`--branch`; #5246). A refused download says so and names `--branch`.
// The runner's call is hardened because issue text is untrusted: --author keeps only the images in the body/comments
// that login wrote, --attachments-only keeps only GitHub-hosted attachment URLs, and every run takes at most
// MAX_SHOTS images of at most MAX_BYTES each over https only; a file whose header is not PNG/JPEG/GIF/WebP is deleted.
// File names are shot-<hash of the URL>.<ext>, never anything from the issue, so a re-run rewrites the same files.
// Exit 0 at least one image saved (or listed), 1 none found, 2 usage, 3 API or download error.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { api } from "../ci/github-api.mjs";
import { strictFlags } from "../lib/cli-args.mjs";
import { classifyShot } from "../lib/bryce-phone.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const USAGE = `usage: node tools/ui/issue-shots.mjs <issue or PR number> [--list] [--json] [--out <dir>] [--branch]
       [--author <login>] [--attachments-only]
  Saves every image attached to the issue/PR body and its comments under artifacts/phone-shots/<n>/ and prints, per image,
  its pixel size, which of the owner's windows it shows (standalone | safari | neither) and its px per CSS px.
  --list prints the URLs and downloads nothing. --branch reads origin/phone-shots:<n>/ (a cloud worker's path).
  --author keeps only images written by that login; --attachments-only keeps only GitHub attachment URLs.
  Exit 0 found, 1 none, 2 usage, 3 API/download error.`;
export const KNOWN = ["--list", "--json", "--out", "--branch", "--author", "--attachments-only"];
export const SHOTS_BRANCH = "phone-shots";
/** Caps on one run: images taken (in order, the rest are skipped and counted) and bytes per image. */
export const MAX_SHOTS = 20;
export const MAX_BYTES = 20 * 1024 * 1024;

/** The image files under `<n>/` on origin/phone-shots, extracted into `dir`. `git` is injectable. */
export function fromBranch(n, dir, git = (args, opts = {}) => spawnSync("git", args, { cwd: ROOT, maxBuffer: 256 << 20, ...opts })) {
  const f = git(["fetch", "--no-tags", "--depth=1", "origin", SHOTS_BRANCH], { encoding: "utf8" });
  if (f.status !== 0) return { error: `no origin/${SHOTS_BRANCH} branch to read (${String(f.stderr || "").trim().split("\n")[0] || "fetch failed"})` };
  const ls = git(["ls-tree", "-r", "--name-only", "FETCH_HEAD", `${n}/`], { encoding: "utf8" });
  const names = String(ls.stdout || "").split("\n").filter((x) => /\.(png|jpe?g|webp|gif)$/i.test(x));
  const files = [];
  for (const name of names) {
    const blob = git(["show", `FETCH_HEAD:${name}`]);
    if (blob.status !== 0) continue;
    const file = path.join(dir, path.basename(name));
    fs.writeFileSync(file, blob.stdout);
    files.push(file);
  }
  return { files };
}
export const IMAGE_HOSTS = /^https:\/\/(?:github\.com\/user-attachments\/assets\/|(?:private-)?user-images\.githubusercontent\.com\/|github\.com\/[^/]+\/[^/]+\/assets\/)/;
const IMAGE_EXT = /\.(?:png|jpe?g|webp|heic|gif)(?:\?[^\s)"']*)?$/i;

/** Image URLs in a Markdown/HTML body, in order, de-duplicated: GitHub attachments and any direct image link. Pure. */
export function imageUrls(body) {
  const out = [];
  const add = (u) => { const url = u.replace(/[.,;]+$/, ""); if ((IMAGE_HOSTS.test(url) || IMAGE_EXT.test(url)) && !out.includes(url)) out.push(url); };
  const text = String(body || "");
  for (const m of text.matchAll(/!\[[^\]]*\]\((https:\/\/[^\s)]+)\)/g)) add(m[1]);
  for (const m of text.matchAll(/<img\b[^>]*\bsrc=["'](https:\/\/[^"']+)["']/gi)) add(m[1]);
  for (const m of text.matchAll(/(?<![("'=])\bhttps:\/\/[^\s<>)"']+/g)) add(m[0]);
  return out;
}

/** Keep the rows a runner may download: written by `author` (when given), on a GitHub attachment host (when
 *  `attachmentsOnly`), at most `max` of them. Returns `{ rows, skipped }`. Pure. */
export function filterRows(rows, { author = null, attachmentsOnly = false, max = Infinity } = {}) {
  const ok = rows.filter((r) => (!author || r.author === author) && (!attachmentsOnly || IMAGE_HOSTS.test(r.url)));
  return { rows: ok.slice(0, max), skipped: rows.length - Math.min(ok.length, max) };
}

/** A stable file stem for an image URL: `shot-<12 hex of sha256(url)>`. Pure. */
export function shotStem(url) {
  return `shot-${createHash("sha256").update(url).digest("hex").slice(0, 12)}`;
}

/** Every image on an issue: `{ url, where, author, at }`. `get` is github-api's `api` (injectable). */
export function collect(number, get = api) {
  const issue = get(`issues/${number}`);
  if (issue.error) return { error: `issue #${number}: ${issue.error}` };
  const rows = imageUrls(issue.json.body).map((url) => ({ url, where: "body", author: issue.json.user?.login || null, at: issue.json.created_at }));
  for (let page = 1; page <= 10; page++) {
    const c = get(`issues/${number}/comments?per_page=100&page=${page}`);
    if (c.error) return { error: `comments of #${number}: ${c.error}` };
    for (const cm of c.json) for (const url of imageUrls(cm.body)) if (!rows.some((r) => r.url === url)) rows.push({ url, where: `comment ${cm.id}`, author: cm.user?.login || null, at: cm.created_at });
    if (c.json.length < 100) break;
  }
  return { rows, title: issue.json.title };
}

/** PNG / JPEG / GIF / WebP pixel size from the file header; null when unknown (HEIC). Pure. */
export function imageSize(buf) {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: "png" };
  if (buf.length >= 10 && buf.toString("ascii", 0, 3) === "GIF") return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), type: "gif" };
  if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const kind = buf.toString("ascii", 12, 16);
    if (kind === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3), type: "webp" };
    if (kind === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, type: "webp" };
    if (kind === "VP8L") { const b = buf.readUInt32LE(21); return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff), type: "webp" }; }
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    for (let i = 2; i + 9 < buf.length;) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5), type: "jpeg" };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

const EXT = { png: "png", jpeg: "jpg", gif: "gif", webp: "webp" };

function download(url, file) {
  const r = spawnSync("curl", ["-sSL", "--proto", "=https", "--proto-redir", "=https", "--max-redirs", "5", "--max-time", "60",
    "--max-filesize", String(MAX_BYTES), "-o", file, "-w", "%{http_code}", url], { encoding: "utf8" });
  if (r.status === 63) return `larger than ${MAX_BYTES} bytes`;
  if (r.status !== 0) return `curl failed: ${(r.stderr || "").trim().split("\n")[0]}`;
  return /^2/.test(r.stdout.trim()) ? null : `HTTP ${r.stdout.trim()}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flags = strictFlags(argv, KNOWN, USAGE);
  const outArg = flags.flag("--out", null);
  const authorArg = flags.flag("--author", null);
  const n = Number(argv.find((a) => !a.startsWith("--") && a !== outArg && a !== authorArg));
  if (!Number.isInteger(n) || n < 1) { console.error(USAGE); process.exit(2); }
  const describe = (file, extra = "") => {
    const size = imageSize(fs.readFileSync(file));
    const c = size ? classifyShot(size.width, size.height) : null;
    return { file: path.relative(ROOT, file), ...(size ? { width: size.width, height: size.height, ...c } : { note: "unknown image type (HEIC?): convert before measuring" }), extra };
  };
  const line = (r) => `${r.file}  ${r.width ? `${r.width}x${r.height} → ${r.window || `neither window (nearest ${r.nearest}, aspect off ${(r.aspectError * 100).toFixed(1)} %)`}${r.pxPerCss ? ` at ${r.pxPerCss} px per CSS px` : ""}, ${r.orientation}` : r.note}${r.extra ? `  (${r.extra})` : ""}`;
  if (flags.has("--branch")) {
    const dir = path.resolve(ROOT, outArg || path.join("artifacts", "phone-shots", String(n)));
    fs.mkdirSync(dir, { recursive: true });
    const got = fromBranch(n, dir);
    if (got.error) { console.error(`issue-shots: ${got.error}`); process.exit(3); }
    if (!got.files.length) { console.log(`= issue-shots #${n}: origin/${SHOTS_BRANCH} holds no image under ${n}/`); process.exit(1); }
    const rows = got.files.map((f) => describe(f, `origin/${SHOTS_BRANCH}`));
    if (flags.has("--json")) console.log(JSON.stringify({ issue: n, rows }, null, 2)); else for (const r of rows) console.log(line(r));
    console.log(`= issue-shots #${n}: ${rows.length} saved from origin/${SHOTS_BRANCH}`);
    process.exit(0);
  }
  const found = collect(n);
  if (found.error) { console.error(`issue-shots: ${found.error}`); process.exit(3); }
  const kept = filterRows(found.rows, { author: authorArg, attachmentsOnly: flags.has("--attachments-only"), max: MAX_SHOTS });
  if (kept.skipped) console.log(`  skipped ${kept.skipped} image URL(s): another author, a non-attachment host or over the ${MAX_SHOTS}-image cap`);
  found.rows = kept.rows;
  if (!found.rows.length) { console.log(`= issue-shots #${n}: no image in the body or comments (attach the screenshot to the issue, then re-run)`); process.exit(1); }
  if (flags.has("--list")) { for (const r of found.rows) console.log(`${r.url}  (${r.where}, ${r.author}, ${r.at})`); process.exit(0); }
  const dir = path.resolve(ROOT, outArg || path.join("artifacts", "phone-shots", String(n)));
  fs.mkdirSync(dir, { recursive: true });
  let failed = 0;
  const rows = found.rows.map((r) => {
    const stem = shotStem(r.url);
    const tmp = path.join(dir, `${stem}.bin`);
    const err = download(r.url, tmp);
    if (err) { failed++; fs.rmSync(tmp, { force: true }); return { ...r, error: err }; }
    const size = imageSize(fs.readFileSync(tmp));
    // Not a PNG/JPEG/GIF/WebP header: never keep it (HEIC included; the phone app uploads JPEG/PNG).
    if (!size) { failed++; fs.rmSync(tmp, { force: true }); return { ...r, error: "not a PNG/JPEG/GIF/WebP image" }; }
    const file = path.join(dir, `${stem}.${EXT[size.type]}`);
    fs.renameSync(tmp, file);
    return { ...r, ...describe(file, `${r.where}, ${r.at}`) };
  });
  if (flags.has("--json")) console.log(JSON.stringify({ issue: n, title: found.title, rows }, null, 2));
  else for (const r of rows) console.log(r.error ? `FAILED ${r.url}: ${r.error}` : line(r));
  if (rows.some((r) => /HTTP 403/.test(r.error || ""))) console.log(`  HTTP 403: this session's proxy does not serve GitHub attachments (cloud workers are bound to repository endpoints). Read the copies on origin/${SHOTS_BRANCH}: node tools/ui/issue-shots.mjs ${n} --branch`);
  console.log(`= issue-shots #${n}: ${rows.length - failed} saved${failed ? `, ${failed} failed` : ""}`);
  process.exit(failed && failed === rows.length ? 3 : 0);
}
