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

test("garage-angles defaults to spine group and soft-captures via probe helpers", () => {
  const src = code("tools/shot/garage-angles.mjs");
  assert.match(src, /spine:\s*\[\s*"hero"/, "spine group covers crown-friendly presets");
  assert.match(src, /viewsDefault = rollupOnly[\s\S]*?\? rollupView/,
    "rollup-only trims views; --views/--full-views override");
  assert.match(src, /startsWith\(name \+ "="\)/, "must accept --team=value as well as --team value");
  assert.match(src, /screenshotGameCanvas/, "must reuse soft-present capture helper");
  assert.match(src, /openGarage/, "must reuse openGarage retries, not a one-shot mb-garage click");
  assert.match(src, /settleGarage/, "settle soft-present between presets");
  assert.match(src, /isLive|argv\.includes\("--live"\)/, "supports --live github.io capture");
  assert.match(src, /labelShot|buildContactSheet/, "writes labeled PNGs and a contact sheet");
  assert.match(src, /withLabels = \(isLive \|\| \(multiTeam && rollupOnly\)\)/,
    "labels default on for --live and multi-team rollup surveys");
  assert.match(src, /--design=/, "repeatable --design=logo:side pairs");
  assert.match(src, /--list-ids|printHelp/, "documents ids via --list-ids/--help");
  assert.doesNotMatch(src, /const COMBOS/, "no hardcoded named combo presets");
  assert.match(src, /garageParts|--part=/, "supports parts overrides");
  assert.match(src, /wings:\s*\[/, "wings view group for aero surveys");
  assert.match(src, /expandTokenList|readLiverytexIds/, "spine-side=all expands SPINE_SIDE_IDS");
  assert.match(src, /parseTeams|arg === "all"/, "supports --team=all roster walk");
  assert.match(src, /all\+custom|fullRoster/, "supports --team=all+custom (12 cars)");
  assert.match(src, /--reset/, "supports --reset to wipe output dir");
  assert.match(src, /rollupEntries\.push/, "rollup entries for catalog livery too");
  assert.match(src, /buildTeamRollup/, "multi-team rollup contact sheet");
  assert.match(src, /rollupOnly/, "multi-team defaults to rollup-only survey");
  assert.match(src, /skipAwait:\s*true/, "skips duplicate present wait after settle");
  assert.match(src, /garageFrame|__apex\.garageFrame/, "uses __apex.garageFrame for preset+zoom+pan");
  assert.match(src, /garageTeam|__apex\.garageTeam/, "store-fast team switch via __apex.garageTeam");
  assert.match(src, /resumeTeamSet|--resume/, "supports --resume for interrupted all-team runs");
  assert.match(src, /Excludes DEFAULT_CUSTOM|block\[1\]\.matchAll/,
    "rosterIds parses LIST only, not DEFAULT_CUSTOM");
  assert.doesNotMatch(src, /page\.reload\(/, "no second boot — openGarage pins the team live");
});

test("__apex exposes garageTeam and garageFrame for multi-shot surveys", () => {
  const apex = read("js/agent/apex.js");
  assert.match(apex, /garageTeam\(id\)/, "direct store team switch without teampicker");
  assert.match(apex, /garageFrame\(view/, "one-shot preset + zoom/pan clicks");
  assert.match(apex, /garageParts\(parts\)/, "parts override for mesh surveys");
  const game = read("js/game.js");
  assert.match(game, /setSetupView:\s*\(\.\.\.a\)\s*=>\s*setSetupView/, "G facade for garageFrame");
  assert.match(game, /setupPan:\s*\(\.\.\.a\)\s*=>\s*setupPan/, "G facade for pan nudges");
});

test("teams.js LIST is 11 grid teams — custom is not a roster entry", () => {
  const teamsJs = read("js/data/teams.js");
  const block = teamsJs.match(/const LIST = \[([\s\S]*?)\n  \];/);
  assert.ok(block, "LIST block present");
  const ids = [...block[1].matchAll(/^      id: "([a-z]+)",/gm)].map((m) => m[1]);
  assert.equal(ids.length, 11, "2026 grid");
  assert.ok(!ids.includes("custom"), "My Team is DEFAULT_CUSTOM, not in LIST");
  assert.ok(ids.includes("redbull") && ids.includes("cadillac"));
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
  assert.match(fn, /opts\.skipAwait/, "caller can skip second present wait");
});

test("carshot uses soft→CDP clip, not page.screenshot", () => {
  const src = code("tools/car/carshot.mjs");
  assert.match(src, /screenshotPresentedCanvas/, "shared capture helper");
  assert.match(src, /clip:\s*\{\s*x:\s*96/, "keeps the tiny centre crop");
  assert.doesNotMatch(src, /page\.screenshot\(/, "no raw page.screenshot");
});
