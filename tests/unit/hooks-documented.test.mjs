/* hooks-documented.test.mjs — every __apex hook must be in docs/DEBUG-HOOKS.md.
 *
 * `docs/DEBUG-HOOKS.md` opens by calling itself the full reference for the dev
 * API. It documented 155 of 183 hooks. Nothing checked, so nothing noticed —
 * including, immediately, a hook added earlier in this same cleanup pass
 * (`persistState`), which is how this guard came to be written.
 *
 * The gap is not cosmetic. `logLevel` was undocumented while AGENTS.md tells
 * every agent to use it; the whole `lobby*` family — fifteen hooks that are the
 * only way to drive the multiplayer screens from a test — was invisible to
 * anyone reading the reference rather than the source.
 *
 * A RATCHET, not a wall. Documenting 28 hooks properly is real work and is not
 * this pass's job, so the ones already missing are named in UNDOCUMENTED below
 * and the assertion is that NOTHING NEW joins them. Delete a name from that list
 * when you write its section; the second test fails if a name is listed but has
 * since been documented, so the list cannot rot in the other direction either.
 *
 * Same idiom as tests/data/ratchets.json and tests/unit/comment-citations.test.mjs:
 * a number (or a list) you must look at gets thought about, where a rule nobody
 * can satisfy gets deleted the first time it is inconvenient.
 *
 * Run: node --test tests/unit/hooks-documented.test.mjs   (npm run test:tooling-fast)
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveHookNames, sourceHooks, collectHooks } from "../../tools/gen/gen-hooks-table.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// Known-undocumented as of the 2026-08 cleanup pass. SHRINK THIS LIST.
// Grouped by why they are here, because the reason decides who should fix them.
const UNDOCUMENTED = new Set([
  // 2026-09: the 24 names that sat here (lobby test surface, garage staging,
  // subsystem doors) were documented in docs/DEBUG-HOOKS.md. Keep it empty.
]);

/** The LIVE hook names: Object.keys(__apex) after a headless VM boot (the
 *  generator's own list, tools/gen/gen-hooks-table.mjs liveHookNames). A regex
 *  over js/agent/apex.js saw only the `api` literal: the 17 ApexCam hooks
 *  spread into it from js/agent/apex-cam.js and `visorScene` (set by js/game.js
 *  bindAgent) were invisible to this ratchet (W25 row 12, 2026-11). */
let LIVE = null;
before(async () => { LIVE = await liveHookNames(); });
function hookNames() {
  assert.ok(LIVE && LIVE.length > 200, `live __apex key list missing or short (${LIVE && LIVE.length})`);
  return new Set(LIVE);
}

// A hook counts as documented only by a STRUCTURED hand entry: a heading that
// names it (`### \`foo(…)\``, `### … \`__apex.foo\``), a bold lead (`**\`foo(`)
// or a table row that opens with it. A passing prose mention (`__apex.foo` in an
// example, "see \`foo()\`") is NOT enough: six hooks (trackGeometry, carOrbit,
// lobby, lobbyRoom, lobbyHost, logs) passed on mentions alone while the file's
// header promises a hand section for every hook.
function documented(doc, name) {
  return new RegExp(
    "^(?:#{2,5} .*(?:`|__apex\\.)(?:await |async )?(?:__apex\\.)?" + name + "\\b" +
    "|\\*\\*`" + name + "\\b" +
    "|\\| `(?:async )?" + name + "\\b)", "m").test(doc);
}

// The generated hook index (tools/gen/gen-hooks-table.mjs) lists EVERY hook by
// construction, so it would satisfy `documented()` for all of them and turn
// this ratchet vacuous. Strip it: the requirement here is a HAND section per
// hook. tests/unit/generated-docs.test.mjs guards the index separately.
function handSections() {
  const doc = read("docs/DEBUG-HOOKS.md");
  const a = doc.indexOf("<!-- GENERATED: hooks-table -->");
  const b = doc.indexOf("<!-- /GENERATED -->", a);
  return a >= 0 && b > a ? doc.slice(0, a) + doc.slice(b) : doc;
}

test("no NEW __apex hook ships undocumented", () => {
  const doc = handSections();
  const missing = [...hookNames()].filter((n) => !documented(doc, n) && !UNDOCUMENTED.has(n)).sort();
  assert.deepEqual(missing, [],
    "a live __apex hook has no section in docs/DEBUG-HOOKS.md. Write one — " +
    "the file calls itself the full reference, and a hook nobody can find is a hook nobody uses");
});

test("the undocumented list does not name a hook that has since been documented", () => {
  const doc = handSections();
  const stale = [...UNDOCUMENTED].filter((n) => documented(doc, n)).sort();
  assert.deepEqual(stale, [],
    "these are documented now — delete them from UNDOCUMENTED so the ratchet keeps its grip");
});

test("the undocumented list does not name a hook that no longer exists", () => {
  const names = hookNames();
  const gone = [...UNDOCUMENTED].filter((n) => !names.has(n)).sort();
  assert.deepEqual(gone, [],
    "these hooks are gone from the live __apex — drop them from UNDOCUMENTED");
});

test("openf1 and jolpica guard a missing path instead of fetching garbage", () => {
  // Both hooks route through one apiHook() (2026-09-10: the guard and the
  // F1API queue live there), so the guard is asserted once and each hook is
  // asserted to delegate to it.
  const src = read("js/agent/apex.js");
  const guard = src.match(/function apiHook\(base, path, fix\) \{[\s\S]*?\n\}/);
  assert.ok(guard, "apiHook body not found");
  assert.match(guard[0], /error:\s*"missing_path"/);
  assert.match(guard[0], /ok:\s*false/);
  for (const name of ["openf1", "jolpica"]) {
    const m = src.match(new RegExp(name + "\\(path\\) \\{[\\s\\S]*?\\n  \\},"));
    assert.ok(m, name + " body not found");
    assert.match(m[0], /apiHook\(/, name + " must delegate to apiHook");
  }
});

test("jump synchronises the HUD instead of depending on the next animation frame", () => {
  const game = read("js/game.js");
  const apex = read("js/agent/apex.js");
  assert.match(game, /refreshHud:\s*\(\.\.\.a\)\s*=>\s*updateHud\(\.\.\.a\)/,
    "the shared facade must expose the real HUD updater through a deferred binding");
  const jump = apex.match(/jump\(frac, speed, lateral(?:, opts)?\) \{[\s\S]*?\n  \},/);
  assert.ok(jump, "jump body not found");
  assert.match(jump[0], /G\.refreshHud\(true\)/,
    "jump must force-publish its state to the HUD for frozen/headless probes");
});

// ---- the generated index lists the LIVE hooks (W25 row 12, 2026-11) ----------------------------
// tools/gen/gen-hooks-table.mjs took the FIRST `return {…}` found anywhere inside ApexCam's `hooks()` —
// the nested clearShot() helper's `{ T, tries }` — so the index listed two hooks that do not exist and
// dropped 18 that do (the camera family and `visorScene`), and `--check` passed because it compared the
// doc with the same wrong parse. The set now comes from Object.keys(__apex) after a headless boot; the
// source parse only supplies signatures and summaries, and a parsed name that is not live throws.
test("the live __apex key list is the real surface, camera hooks included", () => {
  const live = LIVE;
  assert.ok(live.length > 200, `only ${live.length} live keys`);
  const liveSet = new Set(live);
  for (const n of ["cameraState", "camera", "snapCam", "orbit", "visorScene", "race", "groundY"]) assert.ok(liveSet.has(n), n);
});

test("the source parse takes hooks()'s own return, not a nested helper's", () => {
  const names = sourceHooks().map((h) => h.name);
  const nameSet = new Set(names);
  assert.ok(!nameSet.has("T") && !nameSet.has("tries"), "ApexCam clearShot's { T, tries } parsed as hooks");
  for (const n of ["cameraState", "camera", "flybyCam", "dolly", "roadside"]) assert.ok(nameSet.has(n), n);
});

test("a live hook assigned outside the api literal still gets an index row (visorScene)", () => {
  // js/game.js bindAgent sets __apex.visorScene after ApexApi.create(G).
  assert.ok(!sourceHooks().some((h) => h.name === "visorScene"));
  const row = collectHooks(LIVE).find((h) => h.name === "visorScene");
  assert.ok(row && row.kind === "live", "visorScene row");
});

test("collectHooks(LIVE) is one row per live name, in live order", () => {
  assert.deepEqual(collectHooks(LIVE).map((h) => h.name), LIVE);
});

test("collectHooks throws when the parse names a hook the game does not expose", () => {
  assert.throws(() => collectHooks(LIVE.filter((n) => n !== "cameraState")), /not live __apex hooks[\s\S]*cameraState/);
});

test("the committed index in docs/DEBUG-HOOKS.md has exactly the live hooks", () => {
  const doc = read("docs/DEBUG-HOOKS.md");
  const a = doc.indexOf("<!-- GENERATED: hooks-table -->");
  const b = doc.indexOf("### Agent view surface", a);
  assert.ok(a >= 0 && b > a, "hooks-table block not found");
  const rows = [...doc.slice(a, b).matchAll(/^\| `(?:async )?([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  assert.deepEqual(rows, LIVE, "regenerate with: node tools/gen/gen-hooks-table.mjs");
});
