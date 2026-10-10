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
import { fileURLToPath } from "node:url";
import { STAGE_DIRS, STAGE_ROOT_FILES, stagedNames } from "../../tools/desktop/stage-files.mjs";

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

  // Runtime URLs built in JS — `new URL("../../vendor/…", src)` is how the
  // debris world reaches rapier, and no tag or importmap mentions it.
  for (const file of walk("js")) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const m of src.matchAll(/["'`]((?:\.\.\/)*vendor\/[^"'`]+)["'`]/g)) {
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

test("importmap and precache targets are real files", () => {
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
  const lazy = ["js/circuits/monza.js", "js/circuits/scenery/monza.js", "js/render/glx/glx.js", "js/track/build-worker.js"];
  try {
    for (const rel of lazy) put(rel, `// ${rel}\n`);
    put("js/workers/bitmap-decode-worker.js", "// its client still keys by build\n");
    put("js/game.js", "// shell tag\n");
    put("index.html", `<head>\n<meta name="apex-build" content="7">\n<script src="js/game.js?v=dev"></script>\n</head>\n`);
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
