#!/usr/bin/env node
// @doc Vendors three.js: patches the readable npm build (vendor/three-patches), minifies with the pinned terser, writes vendor/three-<ver>/ + MANIFEST.json; `--check` verifies hashes.
// @skill check-changes
/**
 * vendor-three.mjs — the ONE way a three.js version enters vendor/.
 *
 *   node tools/gen/vendor-three.mjs 0.186.0                       # npm pack into scratch/, patch, minify, write vendor/three-0.186.0/
 *   node tools/gen/vendor-three.mjs 0.186.0 --tarball scratch/three-0.186.0.tgz
 *   node tools/gen/vendor-three.mjs --check                        # no network: every vendor/three-* /MANIFEST.json still matches its files
 *
 * Why this exists: three.js stopped shipping minified builds in r186 (PR #33893,
 * "jsDelivr minifies on its own"), and the unminified bundles cost ~450 KB more per
 * cold load after gzip. Upstream's own .min.js files were terser at default options
 * through r185, so terser here reproduces the shape the game always shipped. The
 * local patches used to be sed recipes against mangled names in the minified
 * bundle; they are now exact-count edits against the READABLE build
 * (vendor/three-patches/patches.mjs), applied BEFORE minification, so a needle that
 * moves upstream fails loudly here instead of vendoring a pristine file.
 *
 * Outputs: three.webgpu.min.js, three.core.min.js, three.tsl.min.js (the internal
 * `./three.core.js` import rewritten to `./three.core.min.js`, exactly as upstream's
 * min build did), LICENSE.txt, addons/tsl/display/BloomNode.js (from
 * examples/jsm/tsl/display/, the one addon TLX uses), and MANIFEST.json — the three
 * version, the terser version, the tarball's sha256, the patch ids applied, and a
 * sha256 per written file. `--check` recomputes the file hashes; it needs no network
 * and is what the guard suite runs.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VENDOR = path.join(ROOT, "vendor");
const SCRATCH = path.join(ROOT, "scratch");
const OUTPUTS = ["three.webgpu", "three.core", "three.tsl"];
const ADDONS = [["examples/jsm/tsl/display/BloomNode.js", "addons/tsl/display/BloomNode.js"]];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const rel = (p) => path.relative(ROOT, p);

function die(msg) { console.error(`[vendor-three] ${msg}`); process.exit(1); }

function check() {
  const dirs = fs.readdirSync(VENDOR).filter((d) => /^three-\d+\.\d+\.\d+$/.test(d));
  if (!dirs.length) die("no vendor/three-<version>/ directory to check");
  let bad = 0;
  for (const d of dirs) {
    const mpath = path.join(VENDOR, d, "MANIFEST.json");
    if (!fs.existsSync(mpath)) { console.error(`[vendor-three] ${d}: no MANIFEST.json — regenerate with this tool`); bad++; continue; }
    const m = JSON.parse(fs.readFileSync(mpath, "utf8"));
    for (const [file, rec] of Object.entries(m.files)) {
      const p = path.join(VENDOR, d, file);
      if (!fs.existsSync(p)) { console.error(`[vendor-three] ${d}/${file}: missing`); bad++; continue; }
      const h = sha256(fs.readFileSync(p));
      if (h !== rec.sha256) { console.error(`[vendor-three] ${d}/${file}: sha256 ${h.slice(0, 12)} != manifest ${rec.sha256.slice(0, 12)} — hand-edited, or a re-drop that skipped the generator`); bad++; }
    }
    if (!bad) console.log(`[vendor-three] ${d}: ${Object.keys(m.files).length} files match MANIFEST.json (three ${m.three}, terser ${m.terser}, patches ${m.patches.join(",")})`);
  }
  process.exit(bad ? 1 : 0);
}

async function generate(version, tarballArg) {
  const { PATCHES } = await import(path.join(VENDOR, "three-patches", "patches.mjs"));
  const { minify } = await import("terser");
  const terserVersion = JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules/terser/package.json"), "utf8")).version;
  fs.mkdirSync(SCRATCH, { recursive: true });

  // 1. The tarball: pristine npm, never a CDN copy.
  let tarball = tarballArg ? path.resolve(tarballArg) : path.join(SCRATCH, `three-${version}.tgz`);
  if (!fs.existsSync(tarball)) {
    console.log(`[vendor-three] npm pack three@${version} -> ${rel(SCRATCH)}/`);
    const r = spawnSync("npm", ["pack", `three@${version}`, "--pack-destination", SCRATCH], { cwd: ROOT, encoding: "utf8" });
    if (r.status !== 0) die(`npm pack failed:\n${r.stderr}`);
    tarball = path.join(SCRATCH, r.stdout.trim().split("\n").pop());
  }
  const tarballSha = sha256(fs.readFileSync(tarball));
  const unpack = path.join(SCRATCH, `three-${version}`);
  fs.rmSync(unpack, { recursive: true, force: true });
  fs.mkdirSync(unpack, { recursive: true });
  const t = spawnSync("tar", ["-xzf", tarball, "-C", unpack], { encoding: "utf8" });
  if (t.status !== 0) die(`tar failed:\n${t.stderr}`);
  const pkg = path.join(unpack, "package");
  const pkgVersion = JSON.parse(fs.readFileSync(path.join(pkg, "package.json"), "utf8")).version;
  if (pkgVersion !== version) die(`tarball is three@${pkgVersion}, asked for ${version}`);

  // 2. Patch the readable builds, exact counts.
  const sources = {};
  for (const name of OUTPUTS) sources[`build/${name}.js`] = fs.readFileSync(path.join(pkg, `build/${name}.js`), "utf8");
  const pristine = Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, sha256(v)]));
  for (const patch of PATCHES) {
    if (!(patch.file in sources)) die(`patch ${patch.id} names ${patch.file}, not one of ${Object.keys(sources).join(", ")}`);
    let src = sources[patch.file];
    for (const e of patch.edits) {
      const n = src.split(e.find).length - 1;
      if (n !== e.count) die(`patch ${patch.id} (${patch.title}): needle found ${n} site(s), expected ${e.count} — upstream changed the shape; read the patch before re-deriving it:\n${JSON.stringify(e.find).slice(0, 160)}`);
      src = src.split(e.find).join(e.replace);
    }
    sources[patch.file] = src;
    console.log(`[vendor-three] patch ${patch.id}: ${patch.edits.length} edit(s) applied to ${patch.file}`);
  }
  // The internal chunk import, as upstream's own min build wrote it.
  {
    const k = "build/three.webgpu.js";
    const n = sources[k].split("from './three.core.js'").length - 1;
    if (n < 1) die("three.webgpu.js no longer imports ./three.core.js — the chunk layout changed");
    sources[k] = sources[k].split("from './three.core.js'").join("from './three.core.min.js'");
    console.log(`[vendor-three] rewrote ${n} core import(s) to ./three.core.min.js`);
  }

  // 3. Minify: @rollup/plugin-terser's defaults for an ES output (module: true),
  //    keeping the @license banner three's header plugin prepends.
  const outDir = path.join(VENDOR, `three-${version}`);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, "addons/tsl/display"), { recursive: true });
  const files = {};
  const put = (name, buf) => {
    fs.writeFileSync(path.join(outDir, name), buf);
    files[name] = { sha256: sha256(buf), bytes: Buffer.byteLength(buf) };
  };
  for (const name of OUTPUTS) {
    const t0 = Date.now();
    const out = await minify(sources[`build/${name}.js`], { module: true, format: { comments: /@license/ } });
    if (!out.code) die(`terser produced no code for ${name}`);
    put(`${name}.min.js`, out.code);
    console.log(`[vendor-three] ${name}.min.js ${out.code.length} bytes (${Date.now() - t0} ms)`);
  }
  put("LICENSE.txt", fs.readFileSync(path.join(pkg, "LICENSE")));
  for (const [from, to] of ADDONS) put(to, fs.readFileSync(path.join(pkg, from)));

  // 4. The manifest — what --check and the canary read.
  const manifest = {
    generatedBy: "tools/gen/vendor-three.mjs",
    three: version,
    terser: terserVersion,
    terserOptions: { module: true, format: { comments: "/@license/" } },
    tarball: { name: path.basename(tarball), sha256: tarballSha },
    pristine,
    patches: PATCHES.map((p) => p.id),
    files,
  };
  fs.writeFileSync(path.join(outDir, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`[vendor-three] wrote ${rel(outDir)}/ (${Object.keys(files).length} files + MANIFEST.json). Now: PATCHES.md, index.html's import map, sw.js, js/game.js preloadThreeVendor, the tests — grep the old version string.`);
}

const args = process.argv.slice(2);
if (args.includes("--check")) check();
else {
  const version = args.find((a) => /^\d+\.\d+\.\d+$/.test(a));
  if (!version) die("usage: vendor-three.mjs <version> [--tarball <path>] | --check");
  const ti = args.indexOf("--tarball");
  await generate(version, ti >= 0 ? args[ti + 1] : null);
}
