/* deploy-staging.test.mjs — everything the browser fetches must be DEPLOYED.
 *
 * WHY THIS EXISTS. .github/workflows/pages.yml does not upload the repo root
 * (that shipped a ~174 MB artifact and timed out the Pages deploy). It stages
 * an ALLOW-LIST of runtime directories via tools/desktop/stage.mjs (shared with
 * the Electron packager). An allow-list edited by hand is a list that goes
 * stale, and this one did: `vendor/` was never in it, so every dynamically
 * imported library — trystero, rapier, jsQR, three.js — 404'd on the deployed
 * site while working in every local run and every test, because those serve
 * the repo root.
 *
 * The failure mode is what makes it worth a test. A missing <script> tag breaks
 * the page instantly and loudly. A missing DYNAMIC import breaks one feature,
 * on one screen, only in production, and only for whoever taps that button —
 * it reached a real player as "could not load the room service".
 *
 * So: read the stage allow-list, read what the shipped code can fetch, and
 * assert the second is covered by the first. Also pin that pages.yml calls the
 * shared stage script (not a forked inline cp list).
 *
 * Run: node --test tests/unit/deploy-staging.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { stageSite } from "../../tools/desktop/stage.mjs";
import { fileURLToPath } from "node:url";
import { STAGE_DIRS, STAGE_EXCLUDE, STAGE_ROOT_FILES, stageExcluded, stagedNames } from "../../tools/desktop/stage-files.mjs";

const { SW_LOCALES } = createRequire(import.meta.url)("../../tools/manifest.cjs");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const workflow = read(".github/workflows/pages.yml");
const html = read("index.html");
const sw = read("sw.js");

function staged() {
  return stagedNames();
}

/* Every same-origin path the shipped code can request, as its top-level entry
 * (a file for `sw.js`, a directory for `vendor/…`). */
function referenced() {
  const hits = new Map();          // top-level entry -> an example full path
  const add = (url, where) => {
    if (/^[a-z]+:/i.test(url) || url.startsWith("//") || url.startsWith("#")) return;
    const clean = url.replace(/^\.?\//, "").split(/[?#]/)[0];
    if (!clean) return;
    const top = clean.split("/")[0];
    if (!hits.has(top)) hits.set(top, `${clean}  (${where})`);
  };

  // Tags and the importmap. The importmap is the ONLY thing that resolves the
  // bare specifiers the ES-module islands import, so its targets are fetched.
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) add(m[1], "index.html tag");
  const map = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (map) for (const v of Object.values(JSON.parse(map[1]).imports)) add(v, "importmap");

  // The service worker precaches by literal path, and a precache miss is a
  // failed install rather than a missing feature.
  for (const m of sw.matchAll(/"((?:\.\/)?(?:js|css|icons|assets|vendor|worker)\/[^"]+)"/g)) {
    add(m[1], "sw.js precache");
  }

  for (const url of SW_LOCALES) add(url, "manifest SW_LOCALES");
  for (const locale of Object.keys(JSON.parse(read("locales/manifest.json")))) add(`locales/${locale}.json`, "locale catalog");

  // Runtime URLs built in JS — `new URL("../../vendor/…", src)` is how the
  // debris world reaches rapier, and no tag or importmap mentions it. assets/ and
  // worker/ literals are fetched the same way, so they are swept too.
  for (const file of walk("js")) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const m of src.matchAll(/["'`]((?:\.\.\/)*(?:vendor|assets|worker)\/[^"'`\s]+)["'`]/g)) {
      add(m[1].replace(/^(\.\.\/)+/, ""), file);
    }
  }
  return hits;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (e.name.endsWith(".js")) out.push(rel);
  }
  return out;
}

test("pages.yml stages via the shared tools/desktop/stage.mjs (no forked cp list)", () => {
  const from = workflow.indexOf("- name: Stage site");
  assert.ok(from >= 0, "Stage site step missing");
  const rest = workflow.slice(from + 1);
  const nextStep = rest.indexOf("- name:");
  const stage = (nextStep >= 0 ? rest.slice(0, nextStep) : rest)
    .split("\n").map((l) => l.replace(/#.*$/, "")).join("\n");
  assert.match(stage, /tools\/desktop\/stage\.mjs/,
    "pages.yml must call tools/desktop/stage.mjs so Pages and Electron share one allow-list");
  assert.doesNotMatch(stage, /^\s*cp\b/m,
    "do not re-introduce an inline cp allow-list; edit tools/desktop/stage-files.mjs");
});

test("the Pages workflow stages every directory the shipped code can fetch", () => {
  const have = staged();
  const missing = [];
  for (const [top, example] of referenced()) {
    if (!have.has(top)) missing.push(`${top}/ — e.g. ${example}`);
  }
  assert.deepEqual(missing, [],
    "these will 404 on the deployed site and work perfectly in every local run");
});

test("vendor/ is staged, because every dynamic import lives there", () => {
  // Named explicitly as well as caught by the sweep above: this is the entry
  // that was missing, and the sweep only catches it while something still
  // references it. A regression here should read as itself.
  assert.ok(staged().has("vendor"), "vendor/ must be copied into _site");
});

test("everything the stage allow-list names actually exists in the repo", () => {
  for (const p of [...STAGE_ROOT_FILES, ...STAGE_DIRS]) {
    assert.ok(fs.existsSync(path.join(ROOT, p)), `stage-files names "${p}", which is not in the repo`);
  }
});

test("importmap targets are real files", () => {
  // Staging the right directory does not help if the path inside it is wrong.
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  for (const [spec, target] of Object.entries(map)) {
    if (target.endsWith("/")) continue;                  // a prefix mapping, not a file
    const rel = target.replace(/^\.?\//, "");
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `importmap "${spec}" points at a missing ${rel}`);
  }
});

// R3-PHONE-8: the lazy files (DEFERRED backends, circuits, scenery, LAZY_*) have
// no tag, so they were requested as `?v=<build>` — every deploy a new URL for
// ~200 files whether or not they changed. The stamp writes a content-hash map
// into the staged shell; ScriptLoader.url() and sw.js key on it.
test("the stamp maps every staged lazy file to its content hash; one changed file changes one key", async () => {
  const { spawnSync } = await import("node:child_process");
  const { createHash } = await import("node:crypto");
  const tmpRoot = path.join(ROOT, "artifacts", "tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tmpRoot, "lazyv-"));
  const bump = (...a) => spawnSync("node", ["tools/ci/bump-cache.mjs", ...a, "--root", dir], { cwd: ROOT, encoding: "utf8" });
  const put = (rel, body) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), body); };
  const mapOf = () => {
    const m = fs.readFileSync(path.join(dir, "index.html"), "utf8").match(/<script type="application\/json" id="apex-lazy-v">([\s\S]*?)<\/script>/g);
    assert.equal(m && m.length, 1, "exactly one map block");
    return JSON.parse(m[0].replace(/^<script[^>]*>|<\/script>$/g, ""));
  };
  // the bitmap worker is stamped like every other lazy file since audit4 I3 B6 (its client keys by ScriptLoader.url)
  const lazy = ["js/circuits/monza.js", "js/circuits/scenery/monza.js", "js/render/glx/glx.js", "js/track/build-worker.js", "js/workers/bitmap-decode-worker.js"];
  try {
    for (const rel of lazy) put(rel, `// ${rel}\n`);
    const entry = "js/" + "game" + ".js";
    put(entry, "// shell tag\n");
    put("index.html", `<head>\n<meta name="apex-build" content="7">\n<script src="${entry}?v=dev"></script>\n</head>\n`);
    put("version.json", `{ "build": 7 }\n`);
    assert.equal(bump("--apply", "--at", "4100", "--json").status, 0);
    const first = mapOf();
    assert.deepEqual(Object.keys(first).sort(), [...lazy].sort(), "every lazy file the root holds, nothing else");
    for (const rel of lazy) {
      assert.equal(first[rel], createHash("sha256").update(fs.readFileSync(path.join(dir, rel))).digest("hex").slice(0, 12), rel);
    }
    assert.equal(bump("--check").status, 0, "the staged copy verifies, map included");

    put("js/circuits/monza.js", "// monza, edited\n");
    assert.equal(bump("--check").status, 1, "a stale map entry fails the staged check");
    assert.equal(bump("--apply", "--at", "4101", "--json").status, 0);
    const second = mapOf();
    assert.deepEqual(Object.keys(second).filter((k) => second[k] !== first[k]), ["js/circuits/monza.js"],
      "two stagings differ in exactly the changed file's key");
    assert.equal(bump("--check").status, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the repo shell carries no lazy map (it is stamped at deploy only)", () => {
  assert.doesNotMatch(html, /id="apex-lazy-v"/);
});


test("real stageSite preserves manifest-declared locale catalogs and SW locale bytes", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "locale-stage-"));
  const root = path.join(tmp, "source"), dest = path.join(tmp, "site");
  const put = (rel, bytes) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), bytes);
  };
  try {
    for (const name of STAGE_ROOT_FILES) put(name, "fixture\n");
    for (const name of STAGE_DIRS) fs.mkdirSync(path.join(root, name), { recursive: true });
    const manifest = JSON.parse(read("locales/manifest.json"));
    // A future translated catalog must follow the same staging path as English.
    manifest.zz = { name: "Fixture", dir: "ltr" };
    put("locales/manifest.json", JSON.stringify(manifest));
    for (const locale of Object.keys(manifest)) {
      put(`locales/${locale}.json`, locale === "zz" ? '{"hello":"Fixture é"}\n' : fs.readFileSync(path.join(ROOT, `locales/${locale}.json`)));
    }
    stageSite(dest, { root, build: false });
    const targets = new Set([...SW_LOCALES, "locales/manifest.json", ...Object.keys(manifest).map((locale) => `locales/${locale}.json`)]);
    for (const rel of targets) {
      assert.deepEqual(fs.readFileSync(path.join(dest, rel)), fs.readFileSync(path.join(root, rel)), rel);
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dest, "locales/manifest.json"))), manifest);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// STAGE_EXCLUDE drops author-time inputs (assets/atlases/, 15.1 MB) from the
// deploy. That is only safe while nothing the browser loads can name them: scan
// every shipped text file for an excluded path, the way referenced() scans
// for top-level entries.
test("no shipped file references a STAGE_EXCLUDE path", () => {
  assert.ok(STAGE_EXCLUDE.length > 0);
  const offenders = [];
  const scan = (rel) => {
    const abs = path.join(ROOT, rel);
    if (stageExcluded(rel)) return;
    const st = fs.statSync(abs);
    if (st.isDirectory()) { for (const n of fs.readdirSync(abs)) scan(rel + "/" + n); return; }
    if (!/\.(m?js|cjs|css|html|json|webmanifest)$/.test(rel)) return;
    const text = fs.readFileSync(abs, "utf8");
    for (const x of STAGE_EXCLUDE) if (text.includes(x + "/") || text.includes(x + "\"")) offenders.push(`${rel} -> ${x}`);
  };
  for (const name of [...STAGE_ROOT_FILES, ...STAGE_DIRS]) if (fs.existsSync(path.join(ROOT, name))) scan(name);
  assert.deepEqual(offenders, [], "a shipped file names an excluded path: stage it again or drop the reference");
});

// BUILT, NOT COMMITTED (2026-10-28; docs/notes/DEPLOY-TIME-GEN-2026-10-28.md): a served generator output that
// git ignores reaches the live site only because stageSite renders it from source. Pin both halves.
test("every BUILT_PATHS file is gitignored, untracked, and rendered into the staged site from source", async () => {
  const { BUILT_PATHS } = await import("../../tools/lib/generated-paths.mjs");
  const git = (...a) => spawnSync("git", a, { cwd: ROOT, encoding: "utf8" });
  for (const p of BUILT_PATHS) {
    assert.equal(git("check-ignore", "-q", "--no-index", "--", p).status, 0, `${p} must be in .gitignore`);
    assert.equal(git("ls-files", "--", p).stdout.trim(), "", `${p} must not be tracked`);
    assert.ok(STAGE_DIRS.includes(p.split("/")[0]), `${p} must sit under a staged directory`);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "built-stage-"));
  const root = path.join(tmp, "source");
  try {
    for (const name of STAGE_ROOT_FILES) { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(path.join(root, name), "fixture\n"); }
    for (const name of STAGE_DIRS) fs.mkdirSync(path.join(root, name), { recursive: true });
    stageSite(path.join(tmp, "fixture-site"), { root, build: false });
    for (const p of BUILT_PATHS) assert.equal(fs.existsSync(path.join(tmp, "fixture-site", p)), false, `an explicit copy-only fixture builds nothing: ${p}`);
    // A second source root must supply its own manifest and circuits, even if a
    // stale local build product is present. The module checkout's roster differs.
    fs.mkdirSync(path.join(root, "tools"), { recursive: true });
    fs.mkdirSync(path.join(root, "js/circuits"), { recursive: true });
    fs.mkdirSync(path.join(root, "js/track"), { recursive: true });
    fs.writeFileSync(path.join(root, "tools/manifest.cjs"), 'module.exports = { CIRCUITS: ["chosen"], circuitPath: id => "js/circuits/" + id + ".js" };\n');
    fs.writeFileSync(path.join(root, "js/circuits", "chosen.js"), 'window.TrackDefs.push({ id: "chosen", name: "Selected source", country: "ZZ", path: [[0, 0], [1, 1]] });\n');
    fs.writeFileSync(path.join(root, "js/track/circuit-meta.js"), "stale output from selected root\n");
    stageSite(path.join(tmp, "site"), { root });
    const sandbox = { window: { TrackDefs: [] } };
    vm.runInNewContext(fs.readFileSync(path.join(tmp, "site/js/track/circuit-meta.js"), "utf8"), sandbox, { filename: path.join(tmp, "site/js/track/circuit-meta.js") });
    assert.equal(sandbox.window.TrackDefs.length, 1);
    assert.equal(sandbox.window.TrackDefs[0].id, "chosen");
    assert.equal(sandbox.window.TrackDefs[0].name, "Selected source");
    assert.equal(sandbox.window.TrackDefs[0].path, undefined, "staging renders metadata, not the full circuit payload");

  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("stageSite skips STAGE_EXCLUDE paths and keeps their siblings", () => {
  assert.equal(stageExcluded("assets/atlases"), true);
  assert.equal(stageExcluded("assets/atlases/atlas-arch-albedo.png"), true);
  assert.equal(stageExcluded("assets/atlases-old/x.png"), false);
  assert.equal(stageExcluded("assets/pack/mat-albedo-128.png"), false);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "exclude-stage-"));
  const root = path.join(tmp, "source"), dest = path.join(tmp, "site");
  const put = (rel) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), "fixture\n");
  };
  try {
    for (const name of STAGE_ROOT_FILES) put(name);
    for (const name of STAGE_DIRS) fs.mkdirSync(path.join(root, name), { recursive: true });
    put("assets/atlases/atlas-arch-albedo.png");
    put("assets/atlases/README.md");
    put("assets/pack/mat-albedo-128.png");
    stageSite(dest, { root, build: false });
    assert.equal(fs.existsSync(path.join(dest, "assets/atlases")), false);
    assert.equal(fs.existsSync(path.join(dest, "assets/pack/mat-albedo-128.png")), true);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
