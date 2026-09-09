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
  assert.match(src, /flag\("--views",\s*"spine"\)/, "default views=spine for cover checks");
  assert.match(src, /startsWith\(name \+ "="\)/, "must accept --team=value as well as --team value");
  assert.match(src, /screenshotGameCanvas/, "must reuse soft-present capture helper");
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

/* The garage matrix: every axis is a LIST and the walk is cost-ordered.
 * Before 2026-09-09 team/zoom/pan were single-valued, the livery and design
 * walks were mutually exclusive (`if (designs) … else …`, so a design could
 * only ever be seen on the team default paint), and there was no parts axis at
 * all — a build comparison meant one boot per build. */
test("garage-angles walks every axis as a list, cheapest innermost", () => {
  const src = code("tools/shot/garage-angles.mjs");
  assert.match(src, /const list = \(name, dflt\)/, "one comma-list parser for every axis");
  for (const axis of ["--team", "--livery", "--parts", "--spine-side", "--zoom"]) {
    assert.match(src, new RegExp(`list\\("${axis}"`), `${axis} must be a list axis`);
  }
  // Cost order is the whole point: a framing nudge is a few clicks, a team
  // switch is UI navigation plus a rebuild. Assert the nesting, not the prose.
  const walk = src.slice(src.indexOf("const PLAN = []"), src.indexOf("const dupes"));
  const order = [...walk.matchAll(/for \(const (\w+) of (\w+)\)/g)].map((m) => m[2]);
  assert.deepEqual(order, ["teams", "paints", "parts", "views", "framings"],
    "team → paint → parts → view → framing: outermost is the most expensive step");
  assert.doesNotMatch(src, /page\.reload\(/, "a second team must not cost a second boot");
});

test("garage-angles crosses design with livery rather than replacing it", () => {
  const src = code("tools/shot/garage-angles.mjs");
  assert.match(src, /async function applyDesign\(page, team, baseLivery,/,
    "a design is applied on top of the livery it is crossed with");
  assert.match(src, /list\.find\(\(l\) => l\.id === base\) \|\| list\[0\]/,
    "the base is the selected paint job, falling back to the team default");
});

test("garage-angles validates part ids against availability for THAT team", () => {
  const src = code("tools/shot/garage-angles.mjs");
  const fn = src.slice(src.indexOf("async function applyParts"), src.indexOf("async function switchTeam"));
  assert.match(fn, /Parts\.isOptionAvailable\(opt, t\)/,
    "a part locked to another team resolves to the default silently — check first");
  assert.match(fn, /Parts\.FACTORY_PRESETS\[teamId\]/, "factory build per team");
  assert.match(fn, /Parts\.DEFAULTS/, "stock build");
  assert.match(fn, /have:/, "a rejection must name what IS available");
  // The mesh key is team:partsVisualKey:num and partsVisualKey reads the store
  // live, so the write busts the cache on its own — no dropPreviewMeshes here.
  // Verified on pixels: factory vs stock on one McLaren side shot differ in
  // 6.63% of bytes (max delta 241), so the second build is not a cached mesh.
  assert.doesNotMatch(fn, /dropPreviewMeshes/,
    "a parts write already moves the preview key; an extra bust would hide a key regression");
});

test("garage-angles can print the matrix without booting Chromium", () => {
  const src = code("tools/shot/garage-angles.mjs");
  assert.match(src, /const dryRun = argv\.includes\("--dry-run"\)/, "--dry-run flag");
  const gate = src.slice(src.indexOf("if (dryRun)"), src.indexOf("async function bayRendered"));
  assert.match(gate, /process\.exit\(0\)/, "--dry-run exits before launchChromium");
  assert.ok(src.indexOf("if (dryRun)") < src.indexOf("launchChromium("),
    "the dry-run gate must sit above the browser launch");
});
