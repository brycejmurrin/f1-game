/* glx-fallback-routing.test.mjs — the GLX safe-mode spec is reachable and selectable (#7045, #6861 phase 4).
 *
 * tests/specs/glx-fallback.spec.js is the browser proof of GLX's safe-mode job
 * (.claude/rules/render-glx.md, D-058): no adapter and a failed TLX create()
 * each land on GLX and finish a lap. It only proves anything if a diff to the
 * code it guards selects it, so this pins the whole chain: pick-tests routes
 * js/render/glx/** and js/render/renderer-boot.js to a group that holds the
 * spec, and the spec stays cheap enough for the selected gate (the render-boot
 * contract in select-specs.test.mjs). The boot chooser's own VM pin is in
 * renderer-boot-timeout.test.mjs ("#7045").
 * Run: node --test tests/unit/glx-fallback-routing.test.mjs
 */
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pick } from "../../tools/ci/pick-tests.mjs";
import { specsOf, maxDeclaredTimeout, fit } from "../../tools/ci/select-specs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPEC = "tests/specs/glx-fallback.spec.js";
const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;

/** Every spec the groups `files` route to. */
const routedSpecs = (files) => new Set(specsOf([...pick(files).keys()].map((g) => "test:" + g), scripts));

for (const file of ["js/render/glx/glx.js", "js/render/glx/post.js", "js/render/renderer-boot.js"]) {
  test(`pick-tests routes ${SPEC} for ${file}`, () => {
    const groups = [...pick([file]).keys()];
    assert.ok(routedSpecs([file]).has(SPEC), `${file} routes to [${groups.join(", ")}], none of which holds ${SPEC}`);
  });
}

test(`${SPEC} stays inside the selected gate (no declared timeout, fits a shard)`, () => {
  assert.ok(fs.existsSync(path.join(ROOT, SPEC)), `${SPEC} is gone; so is GLX's safe-mode proof`);
  assert.equal(maxDeclaredTimeout(SPEC), 0, `${SPEC} declares a timeout, which drops it from the selected gate`);
  const cut = fit([SPEC], 15, { rank: () => 3 });
  assert.deepEqual(cut.selected.map((r) => r.file), [SPEC],
    `${SPEC} did not fit the budgeted shard: ${JSON.stringify({ skipped: cut.skipped, unreachable: cut.unreachable, over: cut.overBudgetSpecs })}`);
});
