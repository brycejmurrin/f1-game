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
import { execFileSync } from "node:child_process";
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
  assert.match(src, /if \(preset && !argvHas\("--views"\)\) return preset\.views/,
    "preset views win over multi-team rollup default");
  assert.match(src, /if \(rollupOnly && !argvHas\("--views"\)\) return rollupViewFlag \|\| "side"/,
    "multi-team rollup defaults to one view unless --full-views or a preset");
  assert.match(src, /return "spine"/,
    "single-team default views=spine unless a preset overrides");
  assert.match(src, /startsWith\(name \+ "="\)/, "must accept --team=value as well as --team value");
  assert.match(src, /screenshotGameCanvas\(page, png, \{[\s\S]*skipAwait: true/,
    "capture must not await soft-present twice after settleGarage");
  assert.match(src, /openGarage/, "must reuse openGarage retries, not a one-shot mb-garage click");
  assert.match(src, /settleGarage/, "settle soft-present between presets");
  // The WALK never reloads (openGarage pins the team live); only the --serve /
  // --watch session does, on purpose, to pick up an edited painter.
  const walkBody = src.slice(src.indexOf("async function walk("), src.indexOf("async function serveSession"));
  assert.doesNotMatch(walkBody, /page\.reload\(/, "no second boot — openGarage pins the team live");
  assert.match(src.slice(src.indexOf("async function serveSession")), /page\.reload\(/, "the session reloads to serve the edited tree");
  assert.doesNotMatch(src, /page\.screenshot\(\s*\{\s*path:\s*png/,
    "no raw page.screenshot — that hung under SwiftShader");
});

test("settleGarage batches steps in one evaluate", () => {
  const src = code("tools/shot/probe-page.mjs");
  const fn = src.slice(src.indexOf("export async function settleGarage"),
    src.indexOf("export async function settleGarage") + 900);
  assert.match(fn, /for \(let i = 0; i < count; i\+\+\)/, "N steps in one page.evaluate");
  assert.doesNotMatch(fn, /for \(let i = 0; i < frames; i\+\+\)[\s\S]*page\.evaluate\(\(\) => window\.__apex\.step/,
    "must not round-trip once per frame");
});

test("openGarage pins store.team as a numeric index", () => {
  const src = code("tools/shot/probe-page.mjs");
  const fn = src.slice(src.indexOf("function enterGarage"),
    src.indexOf("function enterGarage") + 1800);
  assert.match(fn, /S\.set\("team",\s*idx\)/, "store.team is the roster INDEX");
  assert.doesNotMatch(fn, /S\.set\("team",\s*t\.id\)/, "never write a team id string into store.team");
  assert.match(src, /installProbeInit/, "team pin for #mb-garage is installProbeInit before goto");
});

test("screenshotPresentedCanvas is soft-first then optional timed CDP", () => {
  const src = code("tools/shot/probe-page.mjs");
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
  const src = code("tools/shot/probe-page.mjs");
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
  for (const k of ["spineLogo", "spineSide", "finShape", "cover", "sunTint", "plateTint"]) {
    assert.ok(list.includes(`"${k}"`), `FIELDS must still carry ${k}`);
  }
  assert.equal(list.includes('"crestInk"'), false, "crestInk left the paint sheet / FIELDS");
  assert.equal(list.includes('"plateInk"'), false, "plateInk left the paint sheet / FIELDS");
  assert.equal(list.includes('"ridgeTint"'), false, "ridgeTint folded into spineTint");
  assert.equal(list.includes('"airboxTint"'), false, "airboxTint folded into cover");
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
  assert.match(src, /for \(const teamId of workTeams\)/,
    "teams walk inside ONE browser — boot was being paid per team");
});

test("a preset is a bundle of plain flags, and a named camera is parameters", () => {
  // Presets used to BE the vocabulary: a question they did not ask meant
  // editing the tool, and two survey framings (bay / bayFront) were pushed
  // into production SP_VIEWS just so this tool could name them. Now every
  // preset key is a plain flag and every named camera is an az/el/dist bundle,
  // so a preset is a starting point you can sweep away from.
  const src = code("tools/shot/garage-angles.mjs");
  assert.match(src, /const PRESETS = \{/, "purpose presets like render-car");
  assert.match(src, /const CAM_ALIAS = \{/, "named cameras are a table of parameter bundles");
  assert.match(src, /bay:\s*"hero:0\.68pi/, "bay = a base view plus an absolute orbit");
  assert.match(src, /bayFront:\s*"front:0\.32pi/, "bayFront = the opposite diagonal");
  assert.match(src, /saddleWall: \{ views: "bayFront"/, "saddleWall is a flag bundle over that camera");
  assert.match(src, /presetRaw === "list"/, "--preset=list prints and exits");
  assert.match(src, /presetRaw !== "none"/, "--preset=none is a first-class 'no preset'");
  assert.match(src, /function aliasKey/, "a modified named camera gets its own file name");
  for (const f of ["--az-nudge", "--el-nudge", "--logos", "--site"]) {
    assert.ok(src.includes(`"${f}"`), `${f} must be one of the tool's OWN flags`);
  }
  assert.match(src, /clearLogos/, "applyDesign honours logos=default");
  assert.match(src, /delete liv\.logo;/, "logos=default strips the authored mark rows");
  assert.match(src, /argvHas\("--site"\) \|\| argvHas\("--cdn"\)/,
    "--site/--cdn opens github.io; --live is gallery-only");
  assert.match(src, /if \(preset && !argvHas\("--views"\)\) return preset\.views/,
    "preset views win over the multi-team rollup default");
  assert.match(src, /argvHas\("--plan"\)/, "--plan prints the matrix without booting");
  assert.match(src, /liverySettle/, "livery/design apply uses --settle");
  assert.match(src, /viewSettle/, "camera-only moves use --view-settle");
  assert.match(src, /keepPage: !!againstRef/, "--against reuses the page for pass B");
  assert.match(src, /argvHas\("--live"\)/, "--live writes auto-refresh live.html after each shot");
  assert.doesNotMatch(src, /if \(doLive && !againstRef\)/,
    "--live must not switch gameUrl to the CDN (that is --site)");
});

test("garageFrame takes an absolute camera, not only counted clicks", () => {
  const src = code("js/agent/apex.js");
  const at = src.indexOf("garageFrame(view, opts)");
  assert.ok(at > 0, "garageFrame hook must exist");
  const body = src.slice(at, at + 2800);
  assert.match(body, /azNudge/, "UI left/right click counts");
  assert.match(body, /elNudge/, "UI up/down click counts");
  assert.match(body, /nudgeAz/, "their nudgeAz / nudgeEl aliases keep working");
  assert.match(body, /num\(o\.az\) != null/, "absolute az applied after the preset");
  assert.match(body, /num\(o\.el\) != null/, "absolute el applied after the preset");
  assert.match(body, /o\.dist \/ G\.setupPreviewDist/,
    "absolute dist goes through the game's own zoom clamp");
  assert.match(body, /view !== "free"/, "`free` keeps the camera the last call left");
  assert.match(body, /nudgeSetupCam/, "orbit goes through G.nudgeSetupCam");
});

test("every garage camera preset is one a PLAYER can reach", () => {
  // A survey framing is not a game preset. `bay` / `bayFront` were added to
  // SP_VIEWS with no #cs-stack button — production data carrying a shot tool's
  // camera — and with absolute az/el/dist in garageFrame they are parameters
  // (garage-angles CAM_ALIAS). So: everything in SP_VIEWS has a button, and
  // the tool's named cameras are not in SP_VIEWS at all.
  const game = code("js/game.js");
  const block = /const SP_VIEWS = \{([\s\S]*?)\n\};/.exec(game);
  assert.ok(block, "SP_VIEWS must still be a named const");
  const presets = [...block[1].matchAll(/^\s{2}([A-Za-z]+):\s*\{/gm)].map((m) => m[1]);
  assert.ok(presets.length >= 7, `expected the shipped camera stack, got ${presets.join(",")}`);
  const shell = read("index.html");
  const buttons = new Set([...shell.matchAll(/data-cs-view="([A-Za-z]+)"/g)].map((m) => m[1]));
  for (const p of presets) {
    assert.ok(buttons.has(p), `SP_VIEWS.${p} has no #cs-stack button — a tool camera belongs in CAM_ALIAS`);
  }
  const tool = code("tools/shot/garage-angles.mjs");
  const alias = /const CAM_ALIAS = \{([\s\S]*?)\n\};/.exec(tool);
  assert.ok(alias, "the tool must own its survey framings");
  for (const name of [...alias[1].matchAll(/^\s{2}([A-Za-z]+):/gm)].map((m) => m[1])) {
    assert.ok(!presets.includes(name), `${name} is a tool camera and must not be in SP_VIEWS`);
  }
});

test("garage-angles multi-team rollup uses __apex fast path from PR #96 port", () => {
  const src = code("tools/shot/garage-angles.mjs");
  assert.match(src, /all\+custom/, "--team=all+custom includes My Team");
  assert.match(src, /function parseTeams/, "team list parsing supports all/all+custom");
  assert.match(src, /rollupOnly/, "multi-team runs default to rollup-only");
  assert.match(src, /buildTeamRollup/, "writes all-teams rollup contact sheet");
  assert.match(src, /garageTeam/, "fast path switches teams via store hook");
  assert.match(src, /garageFrame/, "fast path frames via store hook");
  assert.match(src, /argvHas\("--reset"\)/, "--reset clears output dir");
  assert.match(src, /argvHas\("--resume"\)/, "--resume skips finished teams");
  assert.match(src, /argvHas\("--oracle"\)/, "--oracle labels flank occlusion on rollup");
});

test("garage-angles walks CAMERAS as lists — views × az × el × dist × zoom × pan × viewport", () => {
  // Five presets were the whole camera vocabulary: a question the presets did
  // not ask (a 60-degree flank, a phone-landscape canvas, a tighter distance)
  // meant editing the tool. Every camera number is a list now, walked as a
  // product with the named views, and `--cam` names whole cameras; the hook
  // takes absolute az/el/dist so the tool is not limited to counted clicks.
  const src = code("tools/shot/garage-angles.mjs");
  for (const f of ["--az", "--el", "--dist", "--cam", "--viewport", "--crop", "--name", "--design", "--zip", "--base"]) {
    assert.ok(src.includes(`"${f}"`), `${f} must be one of the tool's OWN flags`);
  }
  assert.match(src, /function camKey/, "a camera's key names only what was set (old file names survive)");
  assert.match(src, /part\.<category>|startsWith\("part\."\)/, "--part.<category> axes fit catalog parts in-page");
  const hook = read("js/agent/apex.js");
  assert.match(hook, /garageFrame\(view, opts\)[\s\S]*?view !== "free"/, "garageFrame's `free` view keeps the current camera");
  assert.match(hook, /o\.dist \/ G\.setupPreviewDist/, "an absolute dist is applied through the game's own clamp");
  // BEHAVIOUR, not just text: --plan builds the matrix without a browser.
  const plan = (args) => JSON.parse(execFileSync("node",
    ["tools/shot/garage-angles.mjs", "--plan", "--team=ferrari", ...args], { cwd: ROOT, encoding: "utf8" }));
  const p = plan(["--views=side", "--az=60deg,90deg", "--el=0.2", "--zoom=6,4", "--pan=2,0;4,0", "--viewport=1280x720,844x390"]);
  assert.equal(p.cams.length, 8, "2 az × 1 el × 2 zoom × 2 pan");
  assert.equal(p.viewports.length, 2);
  assert.equal(p.shotCount, 8 * 2, "one livery × 8 cams × 2 viewports");
  assert.ok(p.cams.every((c) => Math.abs(c.el - 0.2) < 1e-9), "el is applied to every camera");
  assert.ok(p.cams.some((c) => Math.abs(c.az - Math.PI / 3) < 1e-9), "60deg parses to radians");
  const q = plan(["--views=side", "--cam=free:1.2,0.3,7;rear:180deg,0.4"]);
  assert.equal(q.cams.length, 3, "the base view plus two explicit cameras");
  assert.deepEqual(q.cams.map((c) => c.view), ["side", "free", "rear"]);
  assert.equal(q.cams[1].dist, 7);
  const z = plan(["--spineLogo=wrap,saddle", "--part.engine=turbo,stock", "--zip"]);
  assert.deepEqual(z.designs, [{ spineLogo: "wrap", "part.engine": "turbo" }, { spineLogo: "saddle", "part.engine": "stock" }],
    "--zip pairs the axes index-wise");
  const legacy = plan(["--preset=mark", "--logo=#00ffcc"]);
  assert.deepEqual(legacy.cams.map((c) => c.key), ["front_z6_p4x0", "side_z6_p4x0", "rear_z6_p4x0"],
    "a preset is a starting point: its views, zoom and pan survive as camera keys");
  assert.deepEqual(legacy.designs, [{ finBadge: "logo", logo: "#00ffcc" }], "a preset's livery keys stay axes");
  const plain = plan(["--views=side"]);
  assert.deepEqual(plain.cams.map((c) => c.key), ["side"], "no camera axes: the old `<team>-<tag>-<view>` name");
});

test("garage-angles: ranges, targets, lamps, seats, DPR, `all`, base lists and a budget are all axes", () => {
  // The camera vocabulary stopped being presets: every number is a list, a
  // list takes a range, the orbit can LOOK at a named point, the inspection
  // lamp and the driver seat walk like any other axis, and the plan refuses a
  // matrix that will not fit a budget — before a browser boots.
  const src = code("tools/shot/garage-angles.mjs");
  for (const f of ["--target", "--lamp", "--dpr", "--budget", "--baseline", "--oracle"]) {
    assert.ok(src.includes(`"${f}"`) || src.includes(`argvHas("${f}")`), `${f} must be a flag the tool owns`);
  }
  assert.match(src, /function expandRange/, "a..b:n ranges on every numeric list");
  assert.match(src, /const TARGETS = \{/, "named look-at points are a table in the TOOL");
  assert.match(src, /function pixelDiff/, "an A/B is a changed-pixel fraction, not only a pair sheet");
  assert.match(src, /function writeMatrixSheet/, "rows × cameras contact sheet");
  assert.match(src, /oracleHiddenPct\(teamId,/, "occlusion is recorded per SHOT, not only on rollups");
  assert.match(src, /deviceScaleFactor: dpr/, "a DPR is its own browser context");
  const hook = read("js/agent/apex.js");
  assert.match(hook, /G\.setSetupAim\(o\.target\.map\(Number\)\)/, "garageFrame aims the orbit at a car-space point");
  assert.match(hook, /GarageScene\.spot\(o\.lamp \|\| null\)/, "garageFrame aims the lamp");
  assert.match(hook, /garageTeam\(id, seatWanted\)/, "garageTeam takes a seat");
  const plan = (args) => JSON.parse(execFileSync("node",
    ["tools/shot/garage-angles.mjs", "--plan", "--team=ferrari", ...args], { cwd: ROOT, encoding: "utf8" }));
  const r = plan(["--views=side", "--az=50deg..130deg:5"]);
  assert.deepEqual(r.cams.map((c) => c.key), ["side_az50", "side_az70", "side_az90", "side_az110", "side_az130"],
    "a range expands to evenly spaced values, inclusive");
  const t = plan(["--views=side", "--target=crown,wall", "--lamp=side,off"]);
  assert.deepEqual(t.cams.map((c) => c.key),
    ["side_atCrown_lampSide", "side_atCrown_lampOff", "side_atWall_lampSide", "side_atWall_lampOff"],
    "targets × lamps multiply into the camera matrix with readable keys");
  assert.deepEqual(t.cams[0].target.at, [0, 0.95, -0.55], "a named target resolves to car-space metres");
  const all = plan(["--views=side", "--spineSide=all"]);
  assert.ok(all.designs.length >= 12 && all.designs.every((d) => d.spineSide), "`all` expands an enum axis to its real list");
  const seats = plan(["--views=side", "--driver=all", "--base=default,rb_white", "--spineLogo=wrap"]);
  assert.deepEqual(seats.designs, [{ driver: "0", spineLogo: "wrap" }, { driver: "1", spineLogo: "wrap" }]);
  assert.equal(seats.shotCount, 4, "2 seats × 2 base liveries × 1 camera");
  const dpr = plan(["--views=side", "--dpr=1,2", "--viewport=1280x720,844x390"]);
  assert.equal(dpr.shotCount, 4, "DPR and viewport are both axes");
  const big = plan(["--team=all", "--views=all", "--az=0..2pi:12", "--budget=10m"]);
  assert.equal(big.overBudget, true, "the plan flags a matrix the budget cannot hold");
  assert.equal(plan(["--views=side", "--budget=10m"]).overBudget, false);
});

test("garage-angles: stations, field→station picking, pairs, flat art, a free camera and a session", () => {
  // A camera bundle keyed to a PART composes with every axis; a design walk
  // with no camera shoots where its fields are visible; a pair is scored in
  // one run with an overlay; the player's orbit floors can be lifted for a
  // dev shot; and the browser can stay open for a design loop.
  const src = code("tools/shot/garage-angles.mjs");
  assert.match(src, /const STATIONS = \{/, "stations are a table in the TOOL");
  assert.match(src, /const FIELD_STATIONS = \{/, "fields know which station shows them");
  for (const f of ["--station", "--pair", "--flat", "--eye", "--look", "--path", "--clamp", "--serve", "--watch"]) {
    assert.ok(src.includes(`"${f}"`) || src.includes(`argvHas("${f}")`), `${f} must be a flag the tool owns`);
  }
  assert.match(src, /async function serveSession/, "--serve is a JSON-lines session on ONE browser");
  assert.match(src, /async function writePairs/, "pairs get a Δ% AND a diff overlay");
  assert.match(src, /async function finishRun/, "the run tail is re-runnable for --watch");
  const hook = read("js/agent/apex.js");
  assert.match(hook, /G\.setSetupFree\(o\.clamp === false\)/, "clamp:false lifts the player's floors for a dev shot");
  assert.match(hook, /el: Math\.asin\(/, "an explicit eye becomes the orbit's own terms");
  const game = read("js/game.js");
  assert.match(game, /setSetupFree: \(on\)/, "the façade exposes the free range");
  assert.match(game, /setupPreviewFree = false;   \/\/ a preset is the player's range again/, "a preset restores the player's clamps");
  assert.match(game, /clamp\(setupPreviewEl \+ dEl, spElMin\(\), SP_EL_MAX\)/, "the nudge path clamps through the free-aware floor");
  assert.match(read("types/game-ctx.d.ts"), /setSetupFree: \(on: boolean\) => void/);
  const plan = (args) => JSON.parse(execFileSync("node",
    ["tools/shot/garage-angles.mjs", "--plan", "--team=ferrari", ...args], { cwd: ROOT, encoding: "utf8" }));
  const st = plan(["--station=spineTop", "--az=150deg,170deg"]);
  assert.deepEqual(st.cams.map((c) => c.key), ["spineTop_az150", "spineTop_az170"], "a station is a base the axes override");
  assert.deepEqual(st.cams[0].target.at, [0, 0.9, -0.85], "the crown station looks at the middle of the cover");
  assert.equal(st.cams[0].lamp, "off");
  assert.equal(st.cams[0].clamp, false, "a station inside the player's 4.6 m floor lifts the clamp for itself");
  const auto = plan(["--spineLogo=wrap,saddle"]);
  assert.deepEqual(auto.cams.map((c) => c.key), ["spineTop"], "a crown design with no camera shoots the crown station, not `side`");
  assert.deepEqual(auto.stationsFrom, [{ station: "spineTop", fields: ["spineLogo"] }]);
  assert.equal(plan(["--views=side", "--spineLogo=wrap"]).stationsFrom, null, "an explicit view wins");
  const pair = plan(["--pair=spineLogo:wrap|saddle|cap"]);
  assert.deepEqual(pair.pair, { field: "spineLogo", values: ["wrap", "saddle", "cap"] });
  assert.equal(pair.designs.length, 3, "a pair is an axis too");
  const eye = plan(["--eye=0,0.3,4.5;1.5,0.6,3", "--look=0,0.35,2", "--clamp=0"]);
  assert.deepEqual(eye.cams.map((c) => c.key), ["eye0x0_3x4_5", "eye1_5x0_6x3"]);
  assert.equal(eye.clamp, false);
  const kf = JSON.stringify([{ view: "side", az: "60deg", el: 0.2, dist: 6, target: "crown" }, { az: "150deg", el: 0.9, dist: 5, target: "crown" }]);
  const pathPlan = plan([`--path=${kf}`, "--path-steps=3"]);
  assert.deepEqual(pathPlan.cams.map((c) => c.key), ["path01", "path02", "path03", "path04"], "n steps per segment plus the last keyframe");
  assert.equal(pathPlan.cams[0].view, "side");
  assert.equal(pathPlan.cams[1].view, "free", "interpolated frames keep the camera and move it");
  assert.ok(Math.abs(pathPlan.cams[2].az - (60 + 60) * Math.PI / 180) < 1e-9, "azimuth interpolates linearly");
  assert.equal(pathPlan.cams[3].clamp, false, "a dolly may leave the player's range");
});
