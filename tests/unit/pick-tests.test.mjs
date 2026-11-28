// pick-tests — the selector's contract (--json shape, --since ref handling).
// test-groups.test.mjs covers the output vocabulary; this file guards upstream.
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import test from "node:test";
import { load as loadRatchets } from "../../tools/check/ratchets.mjs";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ALWAYS_RULES, DEPLOY_BRANCH, RULES, SPECIFIC_RULES, SPEC_OWNER_REASON, blanketOnly, pick, specOwners, stripSpecOwner } from "../../tools/ci/pick-tests.mjs";
import { pickAll } from "../../tools/ci/select-specs.mjs";
import { changedPaths } from "../../tools/lib/changed-files.mjs";
import { mkTmpDir } from "../helpers/tmp-dir.mjs";

const require = createRequire(import.meta.url);
const MANIFEST = require("../../tools/manifest.cjs");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Every file the manifest loads, across all rosters — the selector's input space.
const manifestFiles = () => [
  ...MANIFEST.FULL, ...Object.values(MANIFEST.DEFERRED).flat(), ...MANIFEST.LAZY_AGENT,
  ...MANIFEST.LAZY_RACE, ...(MANIFEST.LAZY_RACE_SESSION || []), ...(MANIFEST.LAZY_TRACK_BUILD || []), ...(MANIFEST.LAZY_CIRCUIT || []), ...MANIFEST.LAZY_SCENERY, ...(MANIFEST.LAZY_AUDIO || []), ...MANIFEST.LAZY_DATA, ...MANIFEST.LAZY_NET,
  ...(MANIFEST.LAZY_EDITOR || []), ...(MANIFEST.LAZY_XR || []), ...(MANIFEST.LAZY_CAM_EDITOR || []),
  ...(MANIFEST.LAZY_CAREER_UI || []), ...(MANIFEST.LAZY_CAREER || []), ...(MANIFEST.LAZY_UI_PRESETS || []), ...(MANIFEST.LAZY_SAVES_DATA || []), ...(MANIFEST.LAZY_RESULTS_SHEET || []), ...(MANIFEST.LAZY_GFX_HI || []),
];
const run = (...args) =>
  execFileSync("node", ["tools/ci/pick-tests.mjs", "--json", ...args],
               { cwd: ROOT, encoding: "utf8" });
const json = (...args) => JSON.parse(run(...args));

test("--json reports a reason CI can branch on, not prose", () => {
  const r = json("js/ui/hud.js");
  assert.equal(r.reason, "matched");
  assert.ok(Array.isArray(r.files) && Array.isArray(r.groups));
  for (const g of r.groups) {
    assert.equal(typeof g.group, "string");
    assert.equal(g.script, `test:${g.group}`);
    assert.equal(typeof g.because, "string");
  }
});

test("F1 Dev Tools package paths select structural checks without browser suites", () => {
  for (const file of [
    "plugins/f1-dev-tools/plugin.json",
    "plugins/f1-dev-tools/skills/f1-dev-tools/SKILL.md",
    "plugins/f1-dev-tools/skills/f1-dev-tools/scripts/browser.js",
  ]) {
    const result = json(file);
    assert.equal(result.reason, "matched", file);
    assert.deepEqual(result.groups.map(row => row.group), ["tooling-fast"], file);
    assert.deepEqual(result.unclaimed, [], file);
  }
});

test("vendored Trystero changes select the wire regression group", () => {
  const result = json("vendor/trystero-0.25.4/core/action-wire.js");
  assert.equal(result.reason, "matched");
  // net + tiny come from the former EXTRA_ROUTES rows (#7253 P3a): CI's pickAll() already named them.
  assert.deepEqual(result.groups.map(row => row.group), ["net", "net-unit", "tiny"]);
  assert.deepEqual(result.unclaimed, []);
});

test("a file no rule claims reports 'unmatched', not an empty success", () => {
  // The distinction CI depends on: "nothing changed, run nothing" and "things
  // changed but I cannot route them, run EVERYTHING" are opposite instructions
  // and the prose output renders both as a sentence.
  const r = json("spike/README.md");
  assert.equal(r.reason, "unmatched");
  assert.deepEqual(r.groups, []);
});

test("a rename lists its source so directory rules still fire", () => {
  const dir = mkTmpDir("apex-pick-rename-");
  const g = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: "pipe" }).trim();
  try {
    g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
    fs.mkdirSync(path.join(dir, "js/circuits"), { recursive: true });
    fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
    fs.writeFileSync(path.join(dir, "js/circuits/cota.js"), "// circuit body for rename detection\n".repeat(20));
    g("add", "-A"); g("commit", "-qm", "base");
    g("mv", "js/circuits/cota.js", "docs/PHYSICS.md");
    g("commit", "-qam", "moved out of js/circuits");
    const paths = changedPaths(["HEAD~1"], { cwd: dir });
    assert.deepEqual(paths.sort(), ["docs/PHYSICS.md", "js/circuits/cota.js"]);
    const groups = new Set([...pick(paths).keys()]);
    assert.ok(groups.has("circuits"), `rename source must route circuits, got ${[...groups].join(",")}`);
    assert.ok(!pick(["docs/PHYSICS.md"]).has("circuits"), "destination alone must not claim circuits");
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test("--since takes a REF, and does not read it as a path", () => {
  // The regression this pins. Before the fix `files` was ["HEAD"] — the ref
  // itself — and `reason` was "unmatched", i.e. "nothing to run" for a diff
  // that certainly had files in it.
  //
  // HEAD, not HEAD~1: most CI jobs check out SHALLOW (`actions/checkout` with
  // no fetch-depth; the guards job is deep since 2026-09-22 but this tool runs
  // elsewhere too), where HEAD~1 does not exist and git fails with "ambiguous
  // argument". HEAD resolves in every clone and pins the same property — the
  // ref must not end up in the FILE list.
  const r = json("--since", "HEAD");
  assert.ok(!r.files.includes("HEAD"), "the ref leaked into the file list");
  const expected = changedPaths(["HEAD"], { cwd: ROOT }).slice().sort();
  assert.deepEqual(r.files.slice().sort(), expected);
});

test("explicit paths still win over every other mode", () => {
  const r = json("js/car/parts.js");
  assert.deepEqual(r.files, ["js/car/parts.js"]);
});

test("a path in FIRST argv position survives the --since filter", () => {
  // `argv.indexOf("--since")` is -1 when the flag is absent, so the original
  // `n !== since + 1` excluded index 0 UNCONDITIONALLY: the documented
  // `pick-tests.mjs <paths>` form lost its first path, and a single path lost
  // all of them and fell through to the git-diff default — a different
  // question, answered confidently. Every other case in this file hides it,
  // because run() puts --json at index 0; here the path IS argv[0].
  const r = JSON.parse(execFileSync(
    "node", ["tools/ci/pick-tests.mjs", "js/car/parts.js", "js/ui/hud.js", "--json"],
    { cwd: ROOT, encoding: "utf8" }));
  assert.deepEqual(r.files, ["js/car/parts.js", "js/ui/hud.js"]);
});

test("the default diff base is the DEPLOY branch, which pages.yml names", () => {
  // main is a stale diverged fork here, so merge-basing against it returns an
  // ancient commit and the changed-file set balloons to most of the repo —
  // the tool giving up silently, dressed as an answer. Asserting the constant
  // against pages.yml is what keeps the two from drifting apart.
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/pages.yml"), "utf8");
  // pages.yml is a release train (schedule + dispatch, no push trigger), so
  // the branch lives in its ONE declaration: the workflow-level DEPLOY_BRANCH.
  const m = yml.match(/^\s+DEPLOY_BRANCH:\s*(\S+)\s*$/m);
  assert.ok(m, "pages.yml no longer declares a deploy branch in the expected form (env DEPLOY_BRANCH)");
  assert.equal(DEPLOY_BRANCH, m[1],
    "tools/ci/pick-tests.mjs DEPLOY_BRANCH disagrees with .github/workflows/pages.yml");
});

test("parked tracks-visual lives under tests/manual and is never a gate", () => {
  // No golden baselines: the suite self-skips every circuit and used to report
  // vacuous green via a dedicated npm group. It now lives under tests/manual/
  // (playwright testIgnore) so pick-tests and package.json cannot recommend it.
  const manualVisual = path.join(ROOT, "tests", "manual", "tracks-visual.spec.js");
  assert.ok(fs.existsSync(manualVisual),
    "tracks-visual.spec.js must live under tests/manual/");
  assert.equal(RULES.some(([, groups]) => groups.includes("visual")), false,
    "tools/ci/pick-tests.mjs must not recommend a visual group");
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.ok(!pkg.scripts["test:visual"],
    "package.json must not expose test:visual while baselines are absent");
});

test("no rule is dead: each matches a tracked path, and names a test that exists", () => {
  // The inverse of the orphan check below, and the half the tree move broke.
  // Three rules pointed where their file no longer was: the track-maps module's
  // old js/track/ home, slider-effect's old tools/ root home, and a reason
  // naming a presets.test.mjs that has never existed (presets.spec.js is the
  // STEERING presets; the lighting suite is light-presets.test.mjs). A dead rule
  // is silent: it selects nothing, so the routing it was written to guarantee
  // simply stops happening and every run still looks green. Checked against
  // `git ls-files` rather than the manifest because most rules name tools/,
  // tests/, css/ or docs/ paths the manifest never lists.
  const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n");
  const dead = RULES.filter(([re]) => !tracked.some((f) => re.test(f))).map(([re]) => String(re));
  assert.deepEqual(dead, [],
    "a pick-tests rule matches no file in the tree — re-point it at where the file went, or drop it");

  const missing = [];
  for (const [re, , reason] of RULES) {
    for (const m of String(reason || "").matchAll(/([\w.-]+\.(?:test\.mjs|spec\.js))/g)) {
      if (!tracked.some((f) => f.endsWith("/" + m[1]))) missing.push(`${re} names ${m[1]}`);
    }
  }
  assert.deepEqual(missing, [],
    "a rule's reason names a test file that does not exist — the routing it promises cannot be real");
});

test("every manifest file matches at least one pick-tests rule", () => {
  // The rules are path REGEXES and the tree is about to move
  // (docs/research/TREE-RESTRUCTURE-2026-09.md §Phase 2). A file that moves out
  // from under every rule is a change nobody is told to test — the failure mode
  // this pins. Checked against the MANIFEST rather than a directory walk, so the
  // input space is the load order itself and not whatever happens to be on disk.
  const files = manifestFiles();
  assert.ok(files.length > 150, `manifest lists only ${files.length} files — the roster read broke`);
  const orphans = files.filter((f) => !RULES.some(([re]) => re.test(f)));
  assert.deepEqual(orphans, [],
    "a manifest file matches no pick-tests rule — add or widen a RULE so a change there is routed somewhere");
});

// Files that ONLY the two blanket rules (tiny / tooling-fast) reach: no rule
// names them or their directory, so an edit there is told "boot the page" and
// nothing topical. The COUNT is ratcheted in tests/data/ratchets.json
// (`blanketOnlyRoutes` on tools/ci/pick-tests.mjs) rather than frozen here as a
// path list: the Phase 2b window moves 91 files, and a list keyed on paths
// needs a hand edit per move while saying nothing the number does not. The
// list itself is still printed on a failure, so the offender names itself —
// and `node tools/check/ratchets.mjs --update` is the one-command flow after a
// legitimate move, the same as every other ratchet in the tree.
test("no more manifest files are routed by the blanket rules alone than the ratchet allows", () => {
  const ceiling = loadRatchets()
    .files["tools/ci/pick-tests.mjs"].blanketOnlyRoutes;
  const live = blanketOnly();
  assert.ok(live.length <= ceiling,
    `${live.length} manifest files are routed ONLY by the blanket tiny/tooling-fast rules, ceiling ${ceiling} — ` +
    "give the new one a specific RULE (a moved file that fell off its old rule shows up here first):\n  " +
    live.join("\n  "));
  assert.equal(live.length, ceiling,
    `only ${live.length} files are blanket-only now (ceiling ${ceiling}) — a file gained a rule, so LOWER the ` +
    "ratchet in the same commit: node tools/check/ratchets.mjs --update");
});

// A file's OWN unit test has to be in a group that changing the file selects.
// Nothing enforced that, and it is not a hypothetical: `js/ui/driving-line-opts.js`
// matches the blanket "js/ui/ -> ui" rule while its suite lives in `sweeps`, so a
// rename of the store key that file owns passed every group the selector named
// and failed in CI on the one suite written to guard it. Eight files were in
// that state when this was written; the rules now name each, and this keeps a
// ninth from arriving in silence.
//
// SAME-NAMED only. A source file with no `<basename>.test.mjs` makes no claim
// about which suite guards it, and inventing a mapping for those would assert
// something nobody wrote down.
test("a source file's own unit test is in a group that editing it selects", () => {
  const groups = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/groups.json"), "utf8"));
  const g = groups.groups || groups;
  const home = new Map();                       // test basename -> [group, ...]
  for (const [name, v] of Object.entries(g)) {
    const files = Array.isArray(v) ? v : v && v.files;
    if (!Array.isArray(files)) continue;
    for (const f of files) {
      if (typeof f !== "string" || !f.includes("tests/")) continue;
      const b = path.basename(f).replace(/\.test\.(mjs|cjs)$/, "").replace(/\.spec\.js$/, "");
      if (!home.has(b)) home.set(b, []);
      home.get(b).push(name.replace(/^test:/, ""));
    }
  }
  const walk = (d, out = []) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const p2 = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p2, out); else if (e.name.endsWith(".js")) out.push(p2);
    }
    return out;
  };
  // A basename can COLLIDE without being a claim, and one does:
  // tests/specs/presets.spec.js is the STEERING presets (RELAX/STANDARD/PRO,
  // owned by js/input/steer-tuning.js, which has no same-named source file at
  // all), not js/lighting/presets.js. Honouring that pairing put a rule in
  // routing every lighting edit at the `input` BROWSER group, which guarded
  // nothing it was meant to: the lighting suite is light-presets.test.mjs and
  // already runs on the fast gate. A same-named file is a claim; a homonym in
  // another domain is not, and the difference has to be written down somewhere.
  const HOMONYMS = new Set(["js/lighting/presets.js"]);
  const bad = [];
  for (const src of walk("js")) {
    if (src.includes("/vendor/") || HOMONYMS.has(src)) continue;
    const homes = home.get(path.basename(src, ".js"));
    if (!homes || !homes.length) continue;
    const sel = [...pick([src]).keys()];
    if (!homes.some((h) => sel.includes(h)))
      bad.push(`${src}: its suite is in [${homes.join(", ")}] but editing it selects [${sel.join(", ")}]`);
  }
  assert.deepEqual(bad, [], "give the file a RULE naming the group its own test lives in");
});

// T10 (test audit 2026-10-05): the contact and AI physics modules route to the
// group whose subject they are, and a spec edit names the group that runs it.
test("contact/AI physics modules select collisions, not only physics-core", () => {
  for (const f of ["collide", "contact-geometry", "wall-clamp", "ai-drive", "ai-start", "ai-band", "ai-corridor"]) {
    const src = `js/physics/${f}.js`;
    assert.ok(fs.existsSync(path.join(ROOT, src)), `${src} moved — re-point the rule`);
    const sel = [...pick([src]).keys()];
    assert.ok(sel.includes("collisions") && sel.includes("physics-core"), `${src} selects [${sel.join(", ")}]`);
    if (!sel.includes("game-vm")) assert.fail(`${src} must also select game-vm`);
  }
  assert.ok(!pick(["js/physics/tyre-model.js"]).has("collisions"), "the rule must stay narrow");
});

test("a spec edit selects the browser group(s) that run it; the CI selectors strip that route", () => {
  assert.deepEqual(specOwners("tests/specs/collisions-deep.spec.js"), ["collisions"]);
  assert.deepEqual(specOwners("tests/specs/imola-foundation.spec.js"), ["circuits"], "globs expand");
  assert.deepEqual(specOwners("tests/specs/smoke.spec.js"), ["smoke", "tiny"], "a multi-group spec names each");
  assert.deepEqual(specOwners("tests/unit/pick-tests.test.mjs"), []);
  // Every spec a browser group globs is routed to that group by its own edit.
  const specs = fs.readdirSync(path.join(ROOT, "tests/specs")).filter((f) => f.endsWith(".spec.js"));
  let owned = 0;
  for (const name of specs) {
    const f = `tests/specs/${name}`;
    const owners = specOwners(f);
    if (!owners.length) continue;
    owned++;
    const sel = pick([f]);
    for (const g of owners) assert.ok(sel.get(g)?.has(SPEC_OWNER_REASON), `${f} must select ${g}`);
    assert.ok(sel.has("audit"), "the taxonomy check still rides along");
  }
  assert.ok(owned > 100, `only ${owned} specs resolved to a group — the groups.json read broke`);
  // stripSpecOwner gives the CI selectors exactly the RULES' answer back.
  const g = pick(["tests/specs/collisions-deep.spec.js", "js/physics/collide.js"]);
  assert.deepEqual(stripSpecOwner(g), []);
  assert.ok(g.has("collisions") && ![...g.get("collisions")].includes(SPEC_OWNER_REASON));
  const only = pick(["tests/specs/hud-mirror.spec.js"]);
  assert.deepEqual(stripSpecOwner(only), ["gfx"]);
  assert.deepEqual([...only.keys()], ["audit"]);
});

test("the stylesheets the blessed menu PNGs see route to baseline (incident 2026-09-16)", () => {
  for (const f of ["css/menus.css", "css/carsetup.css", "css/tokens.css", "css/select.css", "css/components.css"]) {
    const groups = json(f).groups.map((g) => g.group);
    assert.ok(groups.includes("baseline") && groups.includes("ui"), `${f} must pick ui + baseline, got ${groups}`);
  }
  assert.ok(!json("css/hud.css").groups.some((g) => g.group === "baseline"), "a HUD-only sheet stays ui-only");
});

test("an index.html edit selects the service-worker group (the precached shell and its boot guard)", () => {
  const groups = json("index.html").groups.map((g) => g.group);
  assert.ok(groups.includes("service-worker"), `index.html must pick service-worker, got ${groups}`);
  assert.ok(groups.includes("baseline") && groups.includes("ui"), "the existing routes stay");
  assert.ok(!json("css/hud.css").groups.some((g) => g.group === "service-worker"), "a stylesheet edit does not drag it in");
});

test("an explicit path that does not exist draws a stderr warning", () => {
  const gone = ["js/ui/", "no-such-file-xyz.js"].join("");
  const r = spawnSync("node", ["tools/ci/pick-tests.mjs", "--json", gone, "js/ui/hud.js"], { cwd: ROOT, encoding: "utf8" });
  assert.ok(r.stderr.includes(`warning: ${gone} does not exist`), r.stderr);
  assert.equal(r.stderr.trim().split("\n").length, 1, r.stderr); // only the missing path warns
  assert.deepEqual(JSON.parse(r.stdout).files, [gone, "js/ui/hud.js"]);
});

test("garage-census usage lists every flag it parses; assets-api.spec cites only npm scripts that exist (#6829)", () => {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  const src = read("tools/perf/garage-census.mjs");
  const usage = src.split("\n").filter((l) => l.startsWith("//")).join("\n");
  for (const f of new Set([...src.matchAll(/flag\("(--[a-z-]+)"/g)].map((m) => m[1]))) assert.ok(usage.includes(f), `${f} missing from usage`);
  const help = spawnSync("node", ["tools/perf/garage-census.mjs", "--help"], { cwd: ROOT, encoding: "utf8" }).stdout;
  assert.equal(help.split("\n").filter((l) => l.startsWith("//")).length, 0, help);
  const scripts = JSON.parse(read("package.json")).scripts;
  for (const [, name] of read("tests/specs/assets-api.spec.js").matchAll(/npm run ([\w:-]+)/g)) assert.ok(scripts[name], `npm run ${name} is not in package.json`);
});

// ONE PATH→GROUP ROUTER (#7253 P3a). select-specs' EXTRA_ROUTES used to be applied by its pickAll()
// only, so pick() (this CLI, node-plan, select-recall) said nothing for vendor/, the standalone pages
// and agent config while CI routed them. The rows below are EXTRA_ROUTES as it stood, frozen: every
// tracked path must get each matching row's groups (and reason) from pick() itself.
const FORMER_EXTRA_ROUTES = [
  [/^vendor\/(three-[^/]+|three-patches)\//, ["tiny", "gfx"], "three.js: the shipped default renderer (TLX) boots on it"],
  [/^vendor\/rapier-[^/]+\//, ["physics-core", "collisions"], "Rapier: the debris world and the incident takeover"],
  [/^vendor\/(trystero-[^/]+|jsqr-[^/]+)\//, ["net"], "multiplayer signalling and the QR room-code scan"],
  [/^vendor\/gpu-capture\//, ["hooks"], "the GPU capture toggle (gpu-capture.spec.js)"],
  [/^vendor\//, ["tiny"], "a vendored script the page may load"],
  [/^controller\.html$/, ["tiny", "input"], "the phone-as-controller page"],
  [/^overlay\.html$/, ["modes"], "the stream overlay page (overlay-live.spec.js)"],
  [/^cockpit-view\.html$/, ["tiny", "ui"], "the cockpit-view page"],
  [/^bench\.html$/, ["perf-frametime"], "the benchmark page (perf-frametime.spec.js)"],
  [/^\.(claude|cursor|codex)\/|^\.githooks\//, ["guards"], "agent hooks and config: the guard suites exec them"],
];
test("pick() is the one router: every tracked path gets the former EXTRA_ROUTES groups (#7253 P3a)", () => {
  assert.equal(pickAll, pick, "select-specs routes through pick() itself");
  assert.deepEqual(RULES, [...ALWAYS_RULES, ...SPECIFIC_RULES], "RULES is the always rows then the specific ones");
  assert.equal(ALWAYS_RULES.length, 2);
  const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  const missing = [];
  for (const f of tracked) {
    const got = pick([f]);
    for (const [re, gs, why] of FORMER_EXTRA_ROUTES) {
      if (!re.test(f)) continue;
      for (const g of gs) if (!got.get(g)?.has(why)) missing.push(`${f} → ${g} (${why})`);
    }
  }
  assert.deepEqual(missing.slice(0, 20), [], `${missing.length} path→group routes pick() drops`);
  const three = pick(["vendor/three-0.187.0/three.webgpu.min.js"]);
  assert.ok(three.has("tiny") && three.has("gfx"), `a vendored three.js path names tiny + gfx: ${[...three.keys()]}`);
  const ctl = pick(["controller.html"]);
  assert.ok(ctl.has("tiny") && ctl.has("input"), `controller.html names tiny + input: ${[...ctl.keys()]}`);
});
