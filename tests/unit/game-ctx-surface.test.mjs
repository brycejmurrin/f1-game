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
 * all ~5900 G reference sites (create params, helpers, cross-file entries) against the interface and is SKIPPED
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
  checkParity, checkElsParity, scanGameCtx, scanDts, scanGameEls, scanDtsEls,
  collectUsage, emitShadow, ctxModuleFiles, deadMembers, findTsc, runTsc, factoryCoverage,
  scanCtxEntries, usageFiles, entryCoverage, UNCOVERED_ENTRIES, lazyBodyEntry,
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
  assert.ok(files.includes("js/race/race-settings.js"), "RaceSettings receives G and must stay under the usage check");
  assert.ok(!files.includes("js/fx/skidmarks.js"), "SkidMarks is self-contained and must not pretend to consume G");
  // agentview-raster.js and net/session.js also spell their entry point create()
  // over a different argument; typing those bags as GameCtx would invent drift.
  assert.ok(!files.includes("js/agent/agentview-raster.js"), "AgentRaster takes a bespoke bag, not the ctx");
  assert.ok(!files.includes("js/net/session.js"), "NetSession.create takes {transport}, not the ctx");
});

test("nested GameEls drift is rejected by a negative fixture", () => {
  const game = scanGameEls("const els = { overlay: null, tyreWear: null };", "fixture/game.js");
  const dts = scanDtsEls("interface GameEls {\n  overlay: HTMLElement;\n}", "fixture/game-ctx.d.ts");
  assert.deepEqual(checkElsParity(game, dts, "fixture/game.js", "fixture/game-ctx.d.ts"), [
    'fixture/game.js:1: els id "tyreWear" is not declared in fixture/game-ctx.d.ts\'s GameEls',
  ]);
});

test("module reads through direct, destructured and aliased G.els are emitted against GameEls", () => {
  const source = `const Fixture = (function () {
    function create(ctx) {
      void ctx.els.directTypo;
      const { destructuredTypo } = ctx.els;
      const { els } = ctx;
      const alias = els;
      alias.aliasedTypo = null;
      return destructuredTypo;
    }
    return { create };
  })();`;
  const nested = collectUsage("fixture/module.js", source).filter((h) => h.kind.startsWith("els"));
  assert.deepEqual(nested.map((h) => [h.kind, h.names]), [
    ["elsRead", ["directTypo"]],
    ["elsDestructure", ["destructuredTypo"]],
    ["elsWrite", ["aliasedTypo"]],
  ]);
});

test("the usage extractor finds the G reference sites it is supposed to check", () => {
  const shadow = emitShadow();
  assert.ok(shadow.sites >= 5930, `only ${shadow.sites} G reference sites extracted — the scope walk broke`);   // measured 5930 on the #6044 deployment base
  assert.ok(shadow.files > 115, `only ${shadow.files} files in the shadow — the entry scan broke`);   // actual 121 (98 factories + 23 entry-only)
  const writes = (shadow.text.match(/= __never;/g) || []).length;
  const destructures = (shadow.text.match(/^ {2}\{ const \{/gm) || []).length;
  assert.ok(writes > 300, `only ${writes} write sites extracted`);   // actual 338 (2026-11-20)
  assert.ok(destructures > 25, `only ${destructures} \`const {…} = ctx\` destructures extracted`);   // actual 33 (2026-11-20)
});

/** Split the dead-member rows ("name (js/game.js:N)") against the baseline set. */
function judgeDead(dead, known) {
  return {
    surprises: dead.filter((d) => !known.has(d.split(" ")[0])),
    gone: [...known].filter((n) => !dead.some((d) => d.startsWith(n + " "))),
  };
}

test("no NEW G member is published for a consumer that does not exist", () => {
  const dead = deadMembers().map((m) => `${m.name} (js/game.js:${m.line})`).sort();
  const { surprises, gone } = judgeDead(dead, KNOWN_UNREAD);
  assert.deepEqual(surprises, [],
    "a G member is declared but no module reads it — either wire the consumer or drop the member; " +
    "this is the `countT` defect with the arrow reversed");
  assert.deepEqual(gone, [], "a baselined unread member now has a reader (or was removed) — delete it from KNOWN_UNREAD");
});

test("positive control: the KNOWN_UNREAD judge fails on both drift directions", () => {
  const dead = ["orphan (js/game.js:12)"];
  // KNOWN_UNREAD is empty today, so neither failure branch above has ever run.
  assert.deepEqual(judgeDead(dead, new Set()), { surprises: dead, gone: [] }, "an unbaselined unread member is a surprise");
  assert.deepEqual(judgeDead(dead, new Set(["orphan"])), { surprises: [], gone: [] }, "a baselined one passes");
  assert.deepEqual(judgeDead([], new Set(["orphan"])), { surprises: [], gone: ["orphan"] }, "a baselined member that gained a reader is flagged");
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

test("a method-shorthand create(G) factory is scanned like `function create(G)`", () => {
  // js/perf/soak-run.js and bench-run.js return `{ create(G) { … } }`; the scanner
  // used to match only `function create(`, so a bad member read in them was clean.
  const src = "const SoakRun = (() => { let _G = null;\n" +
    "  return { create(G) { void G.zzNotAMember; _G = G; return this; } };\n})();\n";
  const hits = collectUsage("js/perf/soak-run.js", src);
  assert.ok(hits.some((h) => h.kind === "read" && h.names[0] === "zzNotAMember"),
    "the method-shorthand create(G) parameter was not resolved — its G reads are unchecked");
  const prop = "const X = (() => ({ create: function (G) { G.zzW = 1; } }))();\n";
  assert.ok(collectUsage("<fixture>", prop).some((h) => h.kind === "write" && h.names[0] === "zzW"));
  const files = ctxModuleFiles();
  assert.deepEqual(["js/perf/soak-run.js", "js/perf/bench-run.js"].filter((rel) => !files.includes(rel)), [],
    "these receive G from game.js and must be under the usage check");
});

test("every global handed the ctx is covered by the usage leg", () => {
  assert.deepEqual(factoryCoverage(), [],
    "a module receives G but its create() is not scanned — teach isCreateFn() the new shape");
});

// ── #5980: the checker sees every use, not only create(ctx) parameters ───────

test("a same-file helper handed the ctx is scanned like create()'s own parameter", () => {
  // js/race/cooldown-lap.js: create(G) → sessionEligible(G) read G.watchMode, a
  // member that does not exist, and no row was ever emitted for it.
  const src = `const Fixture = (function () {
    function eligible(ctx, n) { return ctx.zzHelperRead && n; }
    const arrow = (x, ctx) => { ctx.zzArrowWrite = 1; };
    function create(G) { eligible(G, 1); arrow(0, G); return {}; }
    return { create };
  })();`;
  const hits = collectUsage("fixture/helper.js", src).map((h) => [h.kind, h.names[0]]);
  assert.deepEqual(hits, [["read", "zzHelperRead"], ["write", "zzArrowWrite"]]);
});

test("cross-file entries: X.fn(ctx) hand-offs are followed without widening the factory roster", () => {
  const { rows: entries, byFile } = scanCtxEntries();
  const rows = entries.map((r) => `${r.global}.${r.fn}#${r.argIndex}`);
  for (const [rel, ownsCollect] of [["js/ui/settings-export.js", false], ["js/ui/settings-export-body.js", true]]) {
    assert.equal(!!byFile.get(rel)?.some(e => e.fn === "collect" && e.argIndex === 1), ownsCollect, rel);
  }
  const want = ["ApexCam.hooks#0", "ApexTrack.hooks#0", "ApexLobby.hooks#0", "ApexNet.hooks#0",
    "TvGraphics.create#0", "QualiWire.bindQuali#2", "SettingsExportBody.collect#1"];
  assert.deepEqual(want.filter((w) => rows.indexOf(w) < 0), [], "not a scanned ctx entry — its G use is unchecked");
  assert.ok(rows.length > 30, `only ${rows.length} cross-file entries found`);   // actual 34 (2026-11-20)
  const files = usageFiles();
  assert.deepEqual(["js/race/tv-graphics.js", "js/race/cooldown-lap.js", "js/net/quali-wire.js"]
    .filter((rel) => files.indexOf(rel) < 0), [], "these receive G and must be under the usage check");
  // The GameModuleFactory roster stays create-only: TvGraphics is reached through
  // Reflect.apply and is an entry, not a declared factory.
  assert.deepEqual(ctxModuleFiles().filter((rel) => rel === "js/race/tv-graphics.js"), []);
  assert.deepEqual(entryCoverage(), [], "an entry names a function the usage leg could not bind");
});

test("a skipped entry is named in UNCOVERED_ENTRIES, and every named entry still exists (no stale exception)", () => {
  const rows = scanCtxEntries().rows;
  // A row of the skipped-entry kind names its call site: `<file>: <Global>.<fn>(<args>) (<caller>:<line>) — why`.
  // (CrowdAudio.bind is the other kind: a call site whose ctx is a call result, never a scanned entry.)
  const named = UNCOVERED_ENTRIES.map((u) => /^([^:]+): ([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\([^)]*\) \(js\//.exec(u)).filter(Boolean);
  const stale = named.filter(([, rel, g, fn]) => !rows.some((r) => r.rel === rel && r.global === g && r.fn === fn)).map(([u]) => u);
  assert.deepEqual(stale, [], "an UNCOVERED_ENTRIES row names an entry that no longer exists: delete the row");
});

test("positive control: a bad read behind Mod.hooks(G) is a tsc error row at the real file:line", (t) => {
  if (!findTsc()) { t.skip("no TypeScript resolvable"); return; }
  const src = "const Mod = (function () {\n  function hooks(G) {\n    return G.notAMember;\n  }\n  return { hooks };\n})();\n";
  const hits = collectUsage("fixture/mod.js", src, { create: false, entries: [{ fn: "hooks", argIndex: 0 }] });
  assert.deepEqual(hits.map((h) => [h.kind, h.names[0], h.line]), [["read", "notAMember", 3]]);
  const r = runTsc(emitShadow([{ rel: "fixture/mod.js", hits }]), "artifacts/gctx-fixture");
  assert.equal(r.skipped, false, r.reason);
  assert.equal(r.ok, false, "tsc accepted a read of a member GameCtx does not declare");
  assert.ok(r.errors.some((e) => e.startsWith("fixture/mod.js:3: ") && /notAMember/.test(e)), r.errors.join("\n"));
});

test("a lazy forwarder's ctx parameter reaches the body's tsc error at its real line", t => {
  const body = "const ModBody = { collect(mode, ctx) {\n  return ctx.notAMember;\n} }; Mod._bind(ModBody);";
  const direct = "const Mod = { collect: (...args) => ModBody.collect(...args) };";
  const factory = `const Mod = (() => {
    let slot;
    function _bind(body) { slot = body; }
    const bodyApi = () => slot;
    const fwd = name => (...args) => bodyApi()[name](...args);
    const api = {};
    for (const key of ["collect", "save"]) api[key] = fwd(key);
    return { ...api, _bind };
  })();`;
  for (const shell of [direct, factory]) assert.equal(lazyBodyEntry(shell, body, "Mod", "collect"), true);
  assert.equal(lazyBodyEntry(factory, body, "Mod", "unlisted"), false);
  const overridden = factory.replace("...api, _bind", "...api, _bind, collect(mode, ctx) { return ctx.bad; }");
  assert.equal(lazyBodyEntry(overridden, body, "Mod", "collect"), false);
  const unused = direct.replace("=> ModBody.collect(...args)", "=> { const unused = () => ModBody.collect(...args); }");
  assert.equal(lazyBodyEntry(unused, body, "Mod", "collect"), false);
  const delayed = factory.replace("=> bodyApi()[name](...args)", "=> ready().then(() => bodyApi()[name](...args))");
  assert.equal(lazyBodyEntry(delayed, body, "Mod", "collect"), true);
  assert.equal(lazyBodyEntry(factory.replace("fwd(key)", 'fwd("save")'), body, "Mod", "collect"), false);
  assert.equal(lazyBodyEntry(direct.replace("ModBody.collect(...args)", "ModBody.collect(null, ...args)"), body, "Mod", "collect"), false);
  assert.equal(lazyBodyEntry(factory.replace("() => slot", "() => unrelated"), body, "Mod", "collect"), false);
  assert.equal(lazyBodyEntry(factory, body.replace("Mod._bind(ModBody)", "Other._bind(ModBody)"), "Mod", "collect"), false);
  const entry = { fn:"collect", argIndex:1 };
  const file = { rel:"fixture/lazy-body.js", hits:collectUsage("fixture/lazy-body.js", body,
    { create:false, entries:lazyBodyEntry(factory, body, "Mod", entry.fn) ? [entry] : [] }) };
  assert.deepEqual(file.hits.map(h => [h.names, h.line]), [[["notAMember"], 2]]);
  if (!findTsc()) { t.skip("no TypeScript resolvable"); return; }
  const result = runTsc(emitShadow([file]), "artifacts/gctx-forwarder-fixture");
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.startsWith("fixture/lazy-body.js:2: ") && error.includes("notAMember")), result.errors.join("\n"));
});
