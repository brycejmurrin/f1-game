/* car-multi-shot-tools.test.mjs — one Chromium, many car/garage angles.
 *
 * render-car used to only allow a single --az custom, and page.screenshot hung
 * under SwiftShader. garage-angles walked presets but ignored soft-present.
 * Pin the multi-shot CLI surface and the soft-capture path (one Chromium).
 *
 * Run: node --test tests/unit/car-multi-shot-tools.test.mjs
 * (also listed in tests/groups.json → tooling-fast / docs/TESTING.md coverage)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("render-car has a spine preset and repeatable --shot customs", () => {
  const src = code("tools/car/render-car.mjs");
  assert.match(src, /spine:\s*\[/, "preset=spine must exist for crown/flank multi-shot");
  assert.match(src, /SHOT_ARGS/, "repeatable --shot=label,az,el,dist in one Chromium");
  assert.match(src, /screenshotPresentedCanvas/, "capture uses shared soft→CDP helper");
  assert.match(src, /preferView:\s*true/, "carview prefers #view soft canvas");
  assert.doesNotMatch(src, /page\.screenshot\(/, "no raw page.screenshot — fonts hang under SwiftShader");
  assert.match(src, /chromium_headless_shell-/, "findChromium must see Cloud's headless_shell install");
  assert.match(src, /before:\s*frame,\s*n:\s*need/,
    "frame settle must pass `need` into waitForFunction (free `need` is PAGEERR)");
});

test("render-car walks a team LIST in one browser, and grids the sheet by team", () => {
  const src = code("tools/car/render-car.mjs");
  // The livery FIELD overrides exist to sweep one design across cars ("does
  // spineLogo=wrap read on every team?"), but --team was singular, so that
  // sweep was still one Chromium boot and one contact sheet PER TEAM.
  assert.match(src, /raw === 'all'/, "--team=all must expand to the whole roster");
  assert.match(src, /ROSTER_IDS/, "the roster comes from js/data/teams.js, never a hard-coded list");
  assert.doesNotMatch(src, /\[\s*'mercedes',\s*'ferrari'/, "no copy of the grid inside the tool");
  assert.match(src, /MULTI_TEAM/, "the walk has to be distinguishable from a single-team run");
  // Team is the OUTER loop and only re-set when it CHANGES: CARVIEW.set({team})
  // rebuilds the car, so re-sending it every shot pays that per camera move.
  assert.match(src, /s\.team !== renderedTeam \? \{ team: s\.team \}/,
    "team must be sent only on change, not on every shot");
  assert.match(src, /s\.team !== renderedTeam/, "a team swap needs the long frame settle, like a tod change");
  assert.match(src, /assertSafePathToken\(t, 'team'\)/, "every id in the list is still a path token");
});

test("garage-angles defaults to spine group and soft-captures via probe helpers", () => {
  const src = code("tools/shot/garage-angles.mjs");
  assert.match(src, /spine:\s*\[\s*"hero"/, "spine group covers crown-friendly presets");
  assert.match(src, /viewsDefault = preset && !argvHas\("--views"\) \? preset\.views : "spine"/,
    "default views=spine unless a preset overrides");
  assert.match(src, /startsWith\(name \+ "="\)/, "must accept --team=value as well as --team value");
  assert.match(src, /screenshotGameCanvas\(page, png, \{[\s\S]*skipAwait: true/,
    "capture must not await soft-present twice after settleGarage");
  assert.match(src, /openGarage/, "must reuse openGarage retries, not a one-shot mb-garage click");
  assert.match(src, /settleGarage/, "settle soft-present between presets");
  assert.doesNotMatch(src, /page\.reload\(/, "no second boot — openGarage pins the team live");
  assert.doesNotMatch(src, /page\.screenshot\(\s*\{\s*path:\s*png/,
    "no raw page.screenshot — that hung under SwiftShader");
});

test("settleGarage batches steps in one evaluate", () => {
  const src = code("tools/capture/probe-page.mjs");
  const fn = src.slice(src.indexOf("export async function settleGarage"),
    src.indexOf("export async function settleGarage") + 900);
  assert.match(fn, /for \(let i = 0; i < count; i\+\+\)/, "N steps in one page.evaluate");
  assert.doesNotMatch(fn, /for \(let i = 0; i < frames; i\+\+\)[\s\S]*page\.evaluate\(\(\) => window\.__apex\.step/,
    "must not round-trip once per frame");
});

test("openGarage pins store.team as a numeric index", () => {
  const src = code("tools/capture/probe-page.mjs");
  const fn = src.slice(src.indexOf("function enterGarage"),
    src.indexOf("function enterGarage") + 1800);
  assert.match(fn, /S\.set\("team",\s*idx\)/, "store.team is the roster INDEX");
  assert.doesNotMatch(fn, /S\.set\("team",\s*t\.id\)/, "never write a team id string into store.team");
  assert.match(src, /installProbeInit/, "team pin for #mb-garage is installProbeInit before goto");
});

test("screenshotPresentedCanvas is soft-first then optional timed CDP", () => {
  const src = code("tools/capture/probe-page.mjs");
  assert.match(src, /export async function readSoftCanvasBytes/, "shared soft helper");
  const softFn = src.slice(src.indexOf("export async function readSoftCanvasBytes"),
    src.indexOf("export async function screenshotPresentedCanvas"));
  assert.match(softFn, /getElementById\("game"\)/,
    "Desktop Chrome fallback reads #game after freeze when soft is unarmed");
  const presented = src.slice(src.indexOf("export async function screenshotPresentedCanvas"),
    src.indexOf("export async function screenshotGameCanvas"));
  assert.match(presented, /readSoftCanvasBytes/, "soft path before CDP");
  assert.match(presented, /Page\.captureScreenshot/, "CDP fallback");
  assert.match(presented, /opts\.timeout != null/, "CDP race only when caller sets timeout");
  assert.match(presented, /via:\s*"cdp"/, "via reports capture path");
  assert.doesNotMatch(presented, /page\.screenshot/, "never Playwright screenshot API");
});

test("screenshotGameCanvas prefers #game-soft before freezing for CDP", () => {
  const src = code("tools/capture/probe-page.mjs");
  const fn = src.slice(src.indexOf("export async function screenshotGameCanvas"),
    src.indexOf("export async function screenshotGameCanvas") + 2200);
  const soft = fn.indexOf("readSoftCanvasBytes");
  const freeze = fn.indexOf("headless(true)");
  assert.ok(soft >= 0, "soft overlay path present");
  assert.ok(freeze < 0 || freeze > soft, "page-clip freeze is fallback after soft path");
  assert.match(fn, /forceCdp:\s*true/, "CDP leg skips soft retry after freeze");
});

test("carshot uses soft→CDP clip, not page.screenshot", () => {
  const src = code("tools/car/carshot.mjs");
  assert.match(src, /screenshotPresentedCanvas/, "shared capture helper");
  assert.match(src, /clip:\s*\{\s*x:\s*96/, "keeps the tiny centre crop");
  assert.doesNotMatch(src, /page\.screenshot\(/, "no raw page.screenshot");
});

test("garage-angles walks any Liveries.FIELDS axis, not two hard-coded ones", () => {
  // `--spine-logo=wrap` alone used to be a silent no-op: the walk was gated on
  // spineSides.length, so with only a crown named it fell through to the LIVERY
  // branch, shot the team default, tagged the frames `default` and exited 0. A
  // crown design could be signed off "checked in the garage" without ever
  // reaching the car — and the JSON sidecar still recorded the crown, because
  // that is the CONFIG, not what was painted.
  //
  // The fix generalised it rather than adding a second special case: any
  // --name=value that is not one of the tool's OWN flags is a livery field, the
  // axes given are walked as a CARTESIAN PRODUCT, and the field name is checked
  // in-page against Liveries.FIELDS. Two hard-coded axes against a livery system
  // with 33 fields is what left the garage unable to answer a fin, a cover or a
  // tint question at all.
  const src = code("tools/shot/garage-angles.mjs");
  assert.match(src, /OWN_FLAGS/, "the tool's own flags must be an explicit set");
  assert.match(src, /axes\.reduce/, "multiple axes walk their cartesian product");
  assert.doesNotMatch(src, /const designs = spineSides\.length\s*\n?\s*\?/,
    "the spineSide-only gate must not return");
  assert.match(src, /Liveries\.FIELDS/,
    "field names validate against Liveries' own list, not a copy that drifts");
  for (const legacy of ["--spine-side", "--spine-logo"]) {
    assert.ok(src.includes(`flag("${legacy}"`), `${legacy} must keep working as an alias`);
  }
});

test("liveries.js publishes ONE field list and forTeam consumes it", () => {
  // render-car carried a hand-copied 23 of these 33, so crestInk, bandTint2,
  // plateTint, plateInk and the tint rows were unreachable from every shot tool.
  const src = read("js/car/liveries.js");
  assert.match(src, /const FIELDS = \[/, "the whitelist must be a named const");
  assert.match(src, /for \(const k of FIELDS\)/, "forTeam must consume that const");
  assert.match(src, /return \{[^}]*\bFIELDS\b/, "and it must be exported on the global");
  const list = /const FIELDS = \[([\s\S]*?)\];/.exec(src)[1];
  for (const k of ["spineLogo", "spineSide", "finShape", "cover", "sunTint", "plateInk"]) {
    assert.ok(list.includes(`"${k}"`), `FIELDS must still carry ${k}`);
  }
});

test("garage-angles labels frames and can A/B a ref without touching the tree", () => {
  // A directory of bare frames is unreadable an hour later: three separate
  // compositors got hand-rolled in one session just to tell which car was which.
  // And that session's A/B was done by checking the old file OUT into the
  // working tree, which races anything else running and loses the diff if the
  // run dies — startStaticServer's `route` hook serves the ref's blobs from
  // memory instead, which is the reason that hook exists.
  const src = code("tools/shot/garage-angles.mjs");
  assert.match(src, /function labelPng/, "every frame gets a caption bar burned under it");
  assert.match(src, /function writeSheet/, "a run writes a labelled contact sheet");
  assert.match(src, /startStaticServer\(process\.cwd\(\), \{ route: blobRoute/,
    "--against must serve the ref through the harness route hook");
  assert.doesNotMatch(src, /"checkout"/,
    "--against must never check the ref out into the working tree");
  assert.match(src, /"absent at ref"/,
    "a file missing at the ref must 404, not fall through to the working tree");
});

test("garage-angles reports per-phase timing and reads the loadavg", () => {
  // One total number cannot separate a slow tool from a busy box: the same
  // two-shot walk measured 240.9s and 286.4s on consecutive teams here.
  const src = code("tools/shot/garage-angles.mjs");
  assert.match(src, /ms: \{ settle: settleMs, capture: capMs, gate: gateMs, tries \}/,
    "each shot records settle/capture/gate separately");
  assert.match(src, /loadavg/, "the run must read and report the loadavg");
  assert.match(src, /for \(const teamId of teams\)/,
    "teams walk inside ONE browser — boot was being paid per team");
});

test("garage-angles has presets, --plan, --fast, and tunable settle", () => {
  const src = code("tools/shot/garage-angles.mjs");
  assert.match(src, /const PRESETS = \{/, "purpose presets like render-car");
  assert.match(src, /presetRaw === "list"/, "--preset=list prints and exits");
  assert.match(src, /argvHas\("--plan"\)/, "--plan prints the matrix without booting");
  assert.match(src, /liverySettle/, "livery/design apply uses --settle");
  assert.match(src, /viewSettle/, "camera-only moves use --view-settle");
  assert.match(src, /keepPage: !!againstRef/, "--against reuses the page for pass B");
  assert.match(src, /argvHas\("--live"\)/, "--live writes auto-refresh live.html after each shot");
});
