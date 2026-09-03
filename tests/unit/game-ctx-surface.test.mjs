/* game-ctx-surface.test.mjs — the G façade has ONE declaration, and it is checked.
 *
 * js/game.js publishes its closure state to every extracted module through a
 * single object (`Module.create(G)`), and for the life of that façade nothing
 * verified either half of the contract: not that a member a module reads exists,
 * not that a member game.js declares is read by anyone, not that a write lands
 * on something with a setter. The defects that produced are on the record in
 * game.js's own comments — `countT` written by netStartArm for months with no
 * accessor to receive it, a duplicate `setLightTune` key that was dead the day
 * it was written. Both are decidable statically; neither was decided.
 *
 * types/game-ctx.d.ts is now the declaration and tools/check/check-gctx.mjs is the
 * check. This suite runs it (Bedrock Phase 1 — see
 * docs/research/ARCHITECTURE-REDESIGN-2026-08.md).
 *
 * TWO LEGS, DELIBERATELY UNEQUAL. Parity — the .d.ts member set against the real
 * `const G = {…}` — needs nothing but espree, which is already a devDependency,
 * so it is unconditional and is what actually holds the line. The tsc leg checks
 * all ~1900 G reference sites in js/game|net against the interface and is SKIPPED
 * when no TypeScript is resolvable, because a guard that fails on a machine
 * without an optional toolchain teaches people to ignore it. Skipped is reported,
 * never silent.
 *
 * WHY THE COUNT ASSERTIONS. An extractor that silently returns nothing passes
 * every "no errors" check ever written. The floors below are floors, not
 * ratchets: raise them when the surface genuinely grows, never lower one to make
 * a run green.
 *
 * Run: node --test tests/unit/game-ctx-surface.test.mjs   (npm run test:tooling-fast)
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  checkParity, scanGameCtx, scanDts, emitShadow, ctxModuleFiles, deadMembers, findTsc, runTsc,
} from "../../tools/check/check-gctx.mjs";

/* Members game.js publishes that NOTHING reads — the other direction of drift, and
 * the one a type checker cannot see (an unused declaration is not an error). Frozen
 * as a baseline rather than swept, because deleting one is a js/ edit with a cache
 * bump behind it and Bedrock Phase 1 changes zero runtime bytes.
 *                   returns it at :764; no consumer ever reads it off G. Recorded
 *                   independently in docs/archive/research/raw/w4-audit.json.
 * Shrink this set when one is removed. NEVER add to it to make a run green — a new
 * entry means a member was published for a consumer that does not exist. */
const KNOWN_UNREAD = new Set();  // renderStatBars was deleted 2026-08-14 — the set is empty until the next drift

test("types/game-ctx.d.ts declares exactly the members of `const G` in game.js", () => {
  const { problems, memberCount } = checkParity();
  assert.deepEqual(problems, [],
    "the G façade and its type declaration have drifted — add the member to types/game-ctx.d.ts " +
    "(or remove the dead one from js/game.js); `node tools/check/check-gctx.mjs` prints the same list");
  assert.ok(memberCount > 200, `only ${memberCount} G members parsed — the scan broke, not the façade`);
});

test("the writability of every member is transcribed, not guessed", () => {
  // readonly <=> getter with no setter (or a plain data property); writable <=>
  // an accessor pair. checkParity() compares the two sides; this pins that BOTH
  // kinds actually occur, so a parser bug that classified everything one way
  // could not sail through the comparison.
  const real = scanGameCtx();
  const dts = scanDts();
  assert.deepEqual(dts.errors, [], "types/game-ctx.d.ts has members the single-line parser cannot read");
  const writable = [...real.members.values()].filter((m) => m.writable).length;
  const readonly = real.members.size - writable;
  assert.ok(writable > 50, `only ${writable} writable G members found`);
  assert.ok(readonly > 120, `only ${readonly} read-only G members found`);   // actual 144 (2026-08-27); a loose floor hid a 94-member gap
  assert.deepEqual(real.dupes, [], "a key appears twice in the G literal — one of the two is dead");
});

test("every module that receives the ctx is a declared GameModuleFactory", () => {
  const files = ctxModuleFiles();
  assert.ok(files.length > 15, `only ${files.length} ctx modules found — the create(ctx) scan broke`);
  // agentview-raster.js and net/session.js also spell their entry point create()
  // over a different argument; typing those bags as GameCtx would invent drift.
  assert.ok(!files.includes("js/agent/agentview-raster.js"), "AgentRaster takes a bespoke bag, not the ctx");
  assert.ok(!files.includes("js/net/session.js"), "NetSession.create takes {transport}, not the ctx");
});

test("the usage extractor finds the G reference sites it is supposed to check", () => {
  const shadow = emitShadow();
  assert.ok(shadow.sites > 1700, `only ${shadow.sites} G reference sites extracted — the scope walk broke`);   // actual 1914 (2026-08-27)
  const writes = (shadow.text.match(/= __never;/g) || []).length;
  const destructures = (shadow.text.match(/^ {2}\{ const \{/gm) || []).length;
  assert.ok(writes > 100, `only ${writes} write sites extracted`);
  assert.ok(destructures > 8, `only ${destructures} \`const {…} = ctx\` destructures extracted`);
});

test("no NEW G member is published for a consumer that does not exist", () => {
  const dead = deadMembers().map((m) => `${m.name} (js/game.js:${m.line})`).sort();
  const surprises = dead.filter((d) => !KNOWN_UNREAD.has(d.split(" ")[0]));
  assert.deepEqual(surprises, [],
    "a G member is declared but no module reads it — either wire the consumer or drop the member; " +
    "this is the `countT` defect with the arrow reversed");
  const gone = [...KNOWN_UNREAD].filter((n) => !dead.some((d) => d.startsWith(n + " ")));
  assert.deepEqual(gone, [], "a baselined unread member now has a reader (or was removed) — delete it from KNOWN_UNREAD");
});

test("tsc accepts every module's use of G against types/game-ctx.d.ts", (t) => {
  if (!findTsc()) {
    // TypeScript is optional: the parity leg above is the unconditional gate.
    // If this skip becomes permanent in CI, add typescript to devDependencies
    // rather than deleting the leg.
    t.skip("no TypeScript resolvable (no node_modules/typescript, no tsc on PATH)");
    return;
  }
  const r = runTsc();
  assert.equal(r.skipped, false, r.reason);
  assert.deepEqual(r.errors, [],
    "a module reads a G member that does not exist, or writes one declared readonly — " +
    "the locations above are real js/ file:line, not the generated shadow");
});
