/* lane-preamble.test.mjs — the UI-survey TOOLING block: names are checked against layout-audit's real catalog.
 *
 * parseCatalog is pinned against the real `layout-audit --list` (no browser, ~0.6 s), because a hand-written fixture hid a
 * bug: viewport names followed by a single space (ios-iphone-landscape-safari) were dropped, so 3 of 11 were missing.
 *
 * Run: node --test tests/unit/lane-preamble.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { parseCatalog, checkNames, buildPreamble, buildCore } from "../../tools/ci/lane-preamble.mjs";
import { TOOLING_FAST_USAGE } from "../../tools/ci/tooling-fast.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, "tools/ci/lane-preamble.mjs"), ...a], { encoding: "utf8", cwd: ROOT });
const real = () => parseCatalog(spawnSync(process.execPath, [path.join(ROOT, "tools/ui/layout-audit.mjs"), "--list"], { encoding: "utf8", cwd: ROOT }).stdout);

test("parseCatalog reads the real layout-audit catalog, including names followed by one space", () => {
  const c = real();
  assert.ok(c.screens.length >= 40, `${c.screens.length} screens`);
  for (const s of ["title", "settings", "garage", "hud"]) assert.ok(c.screens.includes(s), s);
  for (const v of ["ios-iphone-portrait", "ios-iphone-landscape-safari", "desktop-1440x900", "desktop-windowed-1920x937", "desktop-narrow-860x560"]) assert.ok(c.viewports.includes(v), v);
  assert.ok(c.viewports.length >= 10, `${c.viewports.length} viewports`);
  assert.deepEqual(parseCatalog(""), { screens: [], viewports: [] });
  assert.deepEqual(parseCatalog("screens: a, b\n\nviewports:\n  v1   first\n  v2 second\nother:\n  v3   no"), { screens: ["a", "b"], viewports: ["v1", "v2"] });
});

test("checkNames accepts exact names and prefix wildcards, and names the nearest valid one for a typo", () => {
  const list = ["title", "settings", "settingscontrols", "ios-iphone-portrait", "ios-ipad-portrait"];
  assert.deepEqual(checkNames("screen", "title, settings", list), ["title", "settings"]);
  assert.deepEqual(checkNames("viewport", "ios-*", list), ["ios-*"]);
  assert.throws(() => checkNames("screen", "titel", list), (e) => e.message === 'unknown screen "titel"; did you mean title? (--list shows all 5)');
  assert.throws(() => checkNames("viewport", "desktop-*", list), (e) => e.message.startsWith('unknown viewport "desktop-*"'));
  assert.throws(() => checkNames("screen", "", list), (e) => e.message.startsWith("--screens is required"));
  assert.throws(() => checkNames("screen", undefined, list), (e) => e.message.startsWith("--screens is required"));
});

test("buildPreamble gives the exact commands, redirects the run, bounds the read, and steers to lsp_outline", () => {
  const b = buildPreamble({ screens: ["title", "settings"], viewports: ["ios-iphone-portrait"], scale: "100,200" });
  const lines = b.split("\n");
  assert.ok(lines[0].startsWith("TOOLING (pre-written"));
  assert.ok(b.includes("node tools/ui/layout-audit.mjs --screens=title,settings --viewports=ios-iphone-portrait --scale=100,200 > artifacts/layout-audit/run.log 2>&1; tail -n 3 artifacts/layout-audit/run.log"));
  assert.ok(b.includes("node tools/ui/audit-summary.mjs --top 12"));
  assert.ok(b.includes("no `| tee`"));
  assert.ok(b.includes("lsp_outline {file}") && b.includes("there is no lsp_workspace_symbols"));
  assert.ok(b.includes("SKIPPED cells measured nothing"));
  assert.ok(b.length < 1500, `${b.length} chars`);
  assert.throws(() => buildPreamble({ screens: ["a"], viewports: ["b"], scale: "huge" }), (e) => e.message.startsWith("--scale must be"));
  assert.ok(buildPreamble({ screens: ["a"], viewports: ["b"] }).includes("--scale=100 "));
});

test("the CLI prints the block for valid names and exits 2 with ERROR for a typo, without a stack", () => {
  const ok = run("--screens=title,settings", "--viewports=ios-iphone-portrait,desktop-1440x900", "--scale=100,200");
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(ok.stdout.startsWith("TOOLING (pre-written"));
  assert.ok(run("--screens=title", "--viewports=ios-iphone-landscape-safari").stdout.includes("--viewports=ios-iphone-landscape-safari"));
  const typo = run("--screens=titel", "--viewports=ios-iphone-portrait");
  assert.equal(typo.status, 2);
  assert.ok(typo.stdout.startsWith('ERROR unknown screen "titel"; did you mean title?'));
  assert.equal(typo.stderr, "");
  assert.equal(run("--viewports=ios-iphone-portrait").status, 2);
  const list = run("--list");
  assert.equal(list.status, 0);
  assert.ok(list.stdout.includes("desktop-narrow-860x560"));
});

test("--core prints the WORKING RULES alone; its scripts and flags exist; a survey block carries it too", () => {
  const core = buildCore();
  assert.ok(core.length < 2000, `core block grew to ${core.length} characters`);
  for (const f of core.match(/tools\/[\w/-]+\.mjs/g)) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  assert.ok(TOOLING_FAST_USAGE.includes("--quiet"));
  assert.ok(fs.readFileSync(path.join(ROOT, "tools/ci/wait-for.mjs"), "utf8").includes("--log-matches"));
  // The wait pattern must match tooling-fast's own verdict line.
  const pat = /--log-matches \S+ '([^']+)'/.exec(core)[1];
  assert.ok(new RegExp(pat).test("[tooling-fast] = run failed (799 passed, 1 failed)"));
  const r = run("--core");
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), core);
  assert.ok(run("--screens=title", "--viewports=ios-iphone-portrait").stdout.trimEnd().endsWith(core));
});
