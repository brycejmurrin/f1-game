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
  assert.match(src, /parseFlags\(argv, KNOWN\)/,
    "flags come from the shared reader, which takes --team=value AND --team value");
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
  assert.match(src, /const \{ flag, list, has \} = parseFlags/, "one comma-list parser for every axis");
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
  assert.match(src, /const dryRun = has\("--dry-run"\)/, "--dry-run flag");
  const gate = src.slice(src.indexOf("if (dryRun)"), src.indexOf("async function bayRendered"));
  assert.match(gate, /process\.exit\(0\)/, "--dry-run exits before launchChromium");
  assert.ok(src.indexOf("if (dryRun)") < src.indexOf("launchChromium("),
    "the dry-run gate must sit above the browser launch");
});

/* The capture is the bare canvas, but the player also sees the DOM setup sheet
 * docked over it, and the preview shifts the car out from under that sheet with
 * an off-axis frustum. Judging framing from the uncropped canvas produced a
 * false defect report on 2026-09-09 ("the car is off-centre with 40% dead
 * space") for a bay that was framed correctly. The tool now measures the panel
 * instead of guessing at it. */
test("garage-angles measures the docked sheet rather than assuming where it is", () => {
  const src = code("tools/shot/garage-angles.mjs");
  assert.match(src, /async function panelGeometry\(page\)/, "read the sheet rect from the page");
  assert.match(src, /panelFrac: cam\.panelFrac/, "record what the off-axis frustum compensated by");
  const gate = src.slice(src.indexOf("async function bayRendered"), src.indexOf("async function nudge"));
  assert.match(gate, /visible \? visible\.w :/, "gate the region the sheet leaves");
  assert.match(gate, /left: visible \? visible\.x : 0/, "and gate it at the right offset");
  // The 55% cut stays as the fallback for a page that reports no sheet, but it
  // must not be the primary — that hardcoded guess is what hid the real number.
  assert.match(gate, /0\.55/, "keep the old cut as a fallback only");
  assert.match(src, /const visibleOnly = has\("--visible-only"\)/,
    "--visible-only crops shots to what the player actually sees");
});

test("garage-angles records panel geometry on every shot, cropped or not", () => {
  const src = code("tools/shot/garage-angles.mjs");
  const frame = src.slice(src.indexOf("async function frame(page, shot)"),
    src.indexOf("async function applyLivery"));
  assert.match(frame, /const panel = await panelGeometry\(page\)/, "read once per shot");
  assert.ok(frame.indexOf("const panel = await panelGeometry") < frame.indexOf("for (let attempt"),
    "panel geometry must be read before the gate loop, not per attempt");
  assert.match(frame, /^\s*panel,$/m, "the manifest carries it whether or not --visible-only cropped");
});

/* ONE flag reader for the garage/car CLIs. Four tools hand-rolled their own and
 * they disagreed: measured 2026-09-09, `--team redbull` gave spine-station and
 * flank-occlusion MCLAREN's numbers under a heading the caller read as Red
 * Bull, with nothing said anywhere. Those two are the OFFLINE MEASUREMENT
 * tools — the ones whose entire output is figures you then act on — and
 * spine-station's own header cross-references garage-angles in the space form,
 * so the docs taught the spelling that broke it. */
test("every garage/car CLI reads flags through the shared reader", () => {
  for (const f of ["tools/car/spine-station.mjs", "tools/car/flank-occlusion.mjs",
                   "tools/shot/garage-angles.mjs"]) {
    const src = code(f);
    assert.match(src, /from "\.\.\/lib\/cli-args\.mjs"/, `${f} must use the shared reader`);
    assert.match(src, /const KNOWN = \[/, `${f} must declare the flags it accepts`);
    assert.doesNotMatch(src, /process\.argv\.find\(\(a\) => a\.startsWith\(`--\$\{k\}=`\)\)/,
      `${f} still hand-rolls an =-only parser — that is the bug`);
  }
});

test("the shared reader takes both spellings and refuses what it does not know", async () => {
  const { makeFlags, CliArgError } = await import("../../tools/lib/cli-args.mjs");
  const known = ["--team", "--grid", "--json"];
  assert.equal(makeFlags(["--team=redbull"], known).flag("--team", "mclaren"), "redbull");
  assert.equal(makeFlags(["--team", "redbull"], known).flag("--team", "mclaren"), "redbull",
    "the SPACE form is the one that silently fell through to the default");
  assert.equal(makeFlags(["--json", "--team", "redbull"], known).flag("--json", null), null,
    "a bare flag must not swallow the next flag as its value");
  assert.equal(makeFlags(["--json"], known).has("--json"), true);
  assert.throws(() => makeFlags(["--tema=redbull"], known), CliArgError,
    "a typo must stop the run, not quietly measure the default team");
  assert.throws(() => makeFlags(["--tema=redbull"], known), /did you mean --team/);
});

/* AGENTS.md: regenerable output lives in artifacts/ or scratch/, nowhere else.
 * garage-frame defaulted --out to /opt/cursor/artifacts/garage-frame — a
 * Cursor-Cloud path that exists on no other box and is outside the repo on
 * every box — while tools/lib/output-paths.mjs already enforced the rule. */
test("garage-frame writes inside the repo, through the containment helper", () => {
  const src = code("tools/shot/garage-frame.mjs");
  assert.doesNotMatch(src, /\/opt\/cursor/, "no machine-specific absolute output path");
  assert.match(src, /resolveRepoDefault\(ROOT, "artifacts", "garage-frame"\)/, "default under artifacts/");
  assert.match(src, /resolveContainedChild\(ROOT, flag\("--out"\)/, "a caller's --out cannot escape the repo");
});
