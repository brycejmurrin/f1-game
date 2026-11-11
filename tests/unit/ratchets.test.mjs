// ratchets.test.mjs — the size ratchets in tests/data/ratchets.json, checked
// in-process by tools/check/ratchets.mjs. LOWER a ceiling when you extract
// (`node tools/check/ratchets.mjs --update`); raising one is a deliberate edit of
// the JSON with a reason in the commit. History: docs/notes/CEILING-HISTORY.md.
// Run: node --test tests/unit/ratchets.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { load, measure, relativize, verdict, looseAdvisory, METRICS, TREE_METRICS, SLACK_MIN, SLACK_PCT, looseLine, diffRatchets, compareToBase, loadAt, applyFragments, EXCLUDED_FILES, scopeToBranch, mergeFragment } from "../../tools/check/ratchets.mjs";

// ONE TREE WALK PER METRIC PER PROCESS (pass-3 T1 / audit4 E1, 2026-10-26). This
// file called measure() three times in full, the TREE_METRICS loop once more, and
// a doctored-ceiling measure() per test: ~6 walks of every tree metric, which made
// it the critical path of the commit hook (68 s CI, 98 s local). No test here
// edits the tree between measurements — the doctored inputs change CEILINGS, never
// the counted files — so each tree metric and each async per-file metric is
// computed once and shared. measure() reads TREE_METRICS[name] at call time, so
// it, verdict() and autoRaise() all see the memo; the module itself is unchanged.
const memo = new Map();
const once = (key, fn) => { if (!memo.has(key)) memo.set(key, fn()); return memo.get(key); };
for (const [name, fn] of Object.entries(TREE_METRICS)) TREE_METRICS[name] = () => once(`tree:${name}`, fn);
for (const name of ["blanketOnlyRoutes", "gMembers"]) {
  const fn = METRICS[name];
  if (fn) METRICS[name] = (rel, text) => once(`file:${name}:${rel}`, () => fn(rel, text));
}

test("every ratcheted metric is at or under its ceiling", async () => {
  // relativize: a pin counter's overage the base already carries is not this change's (ratchetMode).
  const v = verdict(await relativize(await measure()));
  // Put the over list in the assertion message (and on the not-ok line via
  // assert.equal) so tooling-fast's TAP filter cannot strip the metric name —
  // deepEqual's `actual: / 0: …` rows were dropped from CI logs until
  // tapFailureDetail kept them (Structural guards, 2026-10-04).
  const overs = v.over.map((r) => `${r.file} ${r.metric}: ${r.value} > ${r.ceiling} (+${r.over})`);
  assert.equal(overs.length, 0,
    overs.length
      ? `a file grew past its ceiling — ${overs.join("; ")} — extract something, or raise the number in tests/data/ratchets.json deliberately and say why in the commit`
      : "a file grew past its ceiling — extract something, or raise the number in tests/data/ratchets.json deliberately and say why in the commit");
  const missing = v.rows.filter((r) => r.missing).map((r) => r.file);
  assert.equal(missing.length, 0,
    missing.length ? `a ratcheted file is gone — ${missing.join("; ")}` : "a ratcheted file is gone — drop its entry or fix the path");
});

test("no ceiling is left far above the value it guards (one slack rule)", async (t) => {
  // ADVISORY OFF A PULL REQUEST (R3-CI-HEALTH-1 follow-up): two green PRs that
  // each remove one item from a slack-0 metric merge to a tip below its
  // ceiling, and this turned the deploy tip red on an improvement. On a push /
  // schedule / Pages run the rows are printed as warnings and pass; a PR run
  // and a local run (no GITHUB_EVENT_NAME) still fail. OVER is the test above.
  const advisory = looseAdvisory();
  const v = verdict(await measure(), { looseAdvisory: advisory });
  const loose = v.loose.map(looseLine);
  if (advisory) {
    for (const l of loose) t.diagnostic(`LOOSE (advisory on ${process.env.GITHUB_EVENT_NAME}) ${l} — lower it with node tools/check/ratchets.mjs --update --lower-only`);
    assert.equal(v.ok, v.over.length === 0, "advisory: a LOOSE row never decides the verdict, an OVER row still does");
    return;
  }
  assert.deepEqual(loose, [],
    "a ceiling drifted above its file and stopped ratcheting — node tools/check/ratchets.mjs --update");
});

test("a LOOSE line names the rule the entry is held to: its own slack, or the default", async () => {
  // A `slack: 0` entry (rawColor, …) one under its ceiling used to print
  // "slack 1 > max(60, 4%)" — the default rule, which it is NOT held to.
  const v0 = (await measure({ files: {}, tree: { bareCatches: 1 } }))[0].value;
  const exact = verdict(await measure({ files: {}, tree: { bareCatches: { ceiling: v0 + 1, slack: 0 } } }));
  assert.equal(exact.loose.length, 1, "a slack-0 entry one above its value is LOOSE");
  assert.equal(looseLine(exact.loose[0]), `(tree) bareCatches: ${v0} but ceiling ${v0 + 1} (slack 1 > the entry's own slack 0 (exact))`);
  const dflt = verdict(await measure({ files: {}, tree: { bareCatches: v0 + 500 } }));
  const want = Math.max(SLACK_MIN, Math.round((v0 + 500) * SLACK_PCT));
  assert.equal(looseLine(dflt.loose[0]), `(tree) bareCatches: ${v0} but ceiling ${v0 + 500} (slack 500 > max(${SLACK_MIN}, ${SLACK_PCT * 100}%) = ${want})`);
});

test("LOOSE is advisory on push / schedule / Pages events and fatal on a PR or locally; OVER is fatal everywhere", async () => {
  assert.equal(looseAdvisory({}), false, "a local run keeps today's behaviour");
  assert.equal(looseAdvisory({ GITHUB_EVENT_NAME: "" }), false);
  assert.equal(looseAdvisory({ GITHUB_EVENT_NAME: "pull_request" }), false, "the PR run is where the author can --update");
  for (const ev of ["push", "schedule", "workflow_dispatch", "workflow_call"]) assert.equal(looseAdvisory({ GITHUB_EVENT_NAME: ev }), true, ev);
  // The real measurement, doctored: one row below its exact ceiling (the
  // 2026-10-10 rawColor 336/337 shape) and, separately, one row over.
  const value = (await measure({ files: {}, tree: { cssClasses: { ceiling: 1e9, slack: SLACK_MIN } } }))[0].value;
  const below = await measure({ files: {}, tree: { cssClasses: { ceiling: value + 1, slack: 0 } } });
  assert.equal(verdict(below).ok, false, "below an exact ceiling is LOOSE by default");
  assert.equal(verdict(below, { looseAdvisory: false }).ok, false);
  const adv = verdict(below, { looseAdvisory: true });
  assert.equal(adv.ok, true, "…and advisory off a PR: an improvement must not red the tip");
  assert.equal(adv.loose.length, 1, "the row is still REPORTED, not hidden");
  const over = await measure({ files: {}, tree: { cssClasses: { ceiling: value - 1, slack: 0 } } });
  assert.equal(verdict(over, { looseAdvisory: true }).ok, false, "OVER stays fatal under the advisory");
  assert.equal(verdict(over, { looseAdvisory: false }).ok, false);
});

test("the data names only known metrics, and game.js carries the carve metrics", () => {
  const data = load();
  for (const [file, metrics] of Object.entries(data.files))
    for (const m of Object.keys(metrics)) assert.ok(METRICS[m], `${file}: unknown metric ${m}`);
  assert.deepEqual(Object.keys(data.files["js/game.js"]).sort(), ["codeLines", "gMembers", "lines", "topLets"],
    "js/game.js is ratcheted on lines, non-comment lines, G members and column-0 lets — the four numbers a carve must move");
});

test("every declared tree metric actually resolves", async () => {
  // The defect this exists for: `subFloorFontSize` was wired into TREE_METRICS
  // on 2026-09-03 pointing at a tools/check/tree-counts.mjs export that was
  // never written. measure() only calls the metrics NAMED IN ratchets.json, so
  // a dangling entry sits green until the day someone ratchets it — and then
  // throws "is not a function" from inside the fast gate, at the exact moment
  // they are trying to lock a win in. A registry is only as good as the promise
  // that every name in it points at something.
  for (const [metric, fn] of Object.entries(TREE_METRICS)) {
    const v = await fn();
    assert.equal(typeof v, "number", `TREE_METRICS.${metric} did not return a number`);
    assert.ok(Number.isFinite(v) && v >= 0, `TREE_METRICS.${metric} returned ${v}`);
  }
  for (const metric of Object.keys(METRICS)) assert.equal(typeof METRICS[metric], "function", `METRICS.${metric}`);
});

test("the ratchet bites, in both directions", async () => {
  // Anti-vacuity. A ratchet that cannot fail is a comment. Both halves are
  // exercised against the REAL measurement with a doctored ceiling, so this
  // stays true however the metrics are implemented.
  const real = load();
  const shrunk = { files: {}, tree: { cssClasses: { ceiling: 1, slack: 0 } } };
  const over = verdict(await measure(shrunk));
  assert.equal(over.ok, false, "a ceiling of 1 on the CSS class count must fail");
  assert.equal(over.over[0].metric, "cssClasses");

  const loose = { files: {}, tree: { cssClasses: real.tree.cssClasses.ceiling + 500 } };
  const v = verdict(await measure(loose));
  assert.equal(v.ok, false, "a ceiling 500 above the value has stopped ratcheting and must be reported LOOSE");
  assert.equal(v.loose[0].metric, "cssClasses");
});

test("an entry may tighten the slack rule, never widen it", async () => {
  // Folding five mechanisms into one must not quietly widen any of them: the
  // four CSS token-adoption counts asserted EXACT equality before the fold and
  // carry slack 0 after it. A slack above the computed default is refused.
  await assert.rejects(
    () => measure({ files: {}, tree: { cssClasses: { ceiling: 535, slack: 9999 } } }),
    /looser than the default/);
});

test("the commit hook's auto-raise absorbs small growth and blocks big growth", async () => {
  // The bound is the whole contract: ≤ maxRaise lines over → raised (and the
  // raise is in the diff the hook stages); more → blocked, exactly as before.
  const { autoRaise } = await import("../../tools/check/ratchets.mjs");
  const rows = await measure();
  const worst = Math.max(0, ...rows.map((r) => r.over));
  // On a green tree nothing moves.
  // dryRun: this test must NOT write tests/data/ratchets.json. Without it the
  // suite raised a ceiling as a side effect — red on the first run, green on
  // the second, and a raise nobody reviewed riding into the next commit.
  const quiet = await autoRaise({ maxRaise: 40, dryRun: true });
  assert.equal(quiet.ok, true);
  assert.deepEqual(quiet.blocked, []);
  if (worst === 0) assert.deepEqual(quiet.raised, [], "a green tree is not raised");
  // A ceiling that is over by more than the bound is refused, never written.
  // Synthetic data, so this runs on a green tree too: a real file whose line
  // ceiling sits 1 below its measured count.
  const file = "tools/check/ratchets.mjs";
  const lines = (await measure({ files: { [file]: { lines: 1 } }, tree: {} }))[0].value;
  const data = { files: { [file]: { lines: lines - 1 } }, tree: {} };
  const tight = await autoRaise({ maxRaise: 0, dryRun: true, data });
  assert.equal(tight.ok, false, "1 line over a 0-line bound is refused");
  assert.deepEqual(tight.blocked.map((r) => r.metric), ["lines"]);
  assert.match(tight.blocked[0].reason, /past the 0-line/);
  assert.deepEqual(tight.raised, [], "a refusal raises nothing");
  const roomy = await autoRaise({ maxRaise: 1, dryRun: true, data });
  assert.equal(roomy.ok, true, "the same growth inside the bound is absorbed");
  assert.deepEqual(roomy.raised.map((r) => r.metric), ["lines"]);
});

test("auto-raise absorbs only a per-file LINE count; a tree metric, slack 0 or another metric blocks with its reason", async () => {
  /* 2026-10-04 review: autoRaise raised every row over by <= 40, so one new
     zero-reference module raised zeroRefModules 0 -> 1 (or implicitAsserts,
     rawColor…) and the hook staged it; CI's --base only warns below 40. */
  const { autoRaise, autoRaiseBlockReason, AUTO_RAISE_METRICS } = await import("../../tools/check/ratchets.mjs");
  assert.deepEqual([...AUTO_RAISE_METRICS].sort(), ["codeLines", "lines"]);
  const row = (o) => ({ file: "f.js", metric: "lines", value: 101, ceiling: 100, over: 1, slackMax: 60, ...o });
  assert.equal(autoRaiseBlockReason(row()), null, "one line over a per-file line ceiling is absorbed");
  assert.equal(autoRaiseBlockReason(row({ metric: "codeLines" })), null);
  assert.match(autoRaiseBlockReason(row({ file: "(tree)", metric: "zeroRefModules", tree: true, ceiling: 0, value: 1 })), /tree-wide/);
  assert.match(autoRaiseBlockReason(row({ slackMax: 0 })), /slack 0/);
  assert.match(autoRaiseBlockReason(row({ metric: "gMembers" })), /not a line count/);
  assert.match(autoRaiseBlockReason(row({ over: 41 })), /past the 40-line/);
  assert.match(autoRaiseBlockReason(row({ missing: true })), /missing/);
  // End to end on synthetic data (dryRun: never writes): a real file one line
  // over is raisable, and a slack-0 tree metric one over blocks the lot.
  const file = "tools/check/ratchets.mjs";
  const lines = (await measure({ files: { [file]: { lines: 1 } }, tree: {} }))[0].value;
  const okRun = await autoRaise({ dryRun: true, data: { files: { [file]: { lines: lines - 1 } }, tree: {} } });
  assert.equal(okRun.ok, true);
  assert.deepEqual(okRun.raised.map((r) => r.metric), ["lines"]);
  const bc = (await measure({ files: {}, tree: { bareCatches: 1 } }))[0].value;
  const blocked = await autoRaise({ dryRun: true, data: {
    files: { [file]: { lines: lines - 1 } }, tree: { bareCatches: { ceiling: bc - 1, slack: 0 } } } });
  assert.equal(blocked.ok, false, "a slack-0 tree metric over its ceiling must block, not raise");
  assert.deepEqual(blocked.blocked.map((r) => r.metric), ["bareCatches"]);
  assert.match(blocked.blocked[0].reason, /tree-wide/);
});

test("--base names every ceiling that moved, and only a raise past the hook's absorb fails", () => {
  // The CI step (ci.yml guards: "Ratchet ceilings vs the base") exists because
  // the commit hook's auto-raise rides into the diff as one changed number
  // that nothing names. The diff is pure; the CLI wraps it with git show.
  const base = { files: { "fixture-a": { lines: 100, codeLines: { ceiling: 50, slack: 5 } }, "fixture-gone": { lines: 1 } },
                 tree: { bareCatches: { ceiling: 40, slack: 15 }, cssClasses: 500 } };
  const now  = { files: { "fixture-a": { lines: 130, codeLines: { ceiling: 45, slack: 5 }, topLets: 3 }, "fixture-new": { lines: 9 } },
                 tree: { bareCatches: { ceiling: 41, slack: 15 }, cssClasses: 500 } };
  const rows = diffRatchets(base, now);
  const by = (f, m) => rows.find((r) => r.file === f && r.metric === m);
  assert.deepEqual(by("fixture-a", "lines"), { file: "fixture-a", metric: "lines", base: 100, now: 130, delta: 30, kind: "raise" });
  assert.equal(by("fixture-a", "codeLines").kind, "lower");
  assert.equal(by("fixture-a", "topLets").kind, "new");
  assert.equal(by("fixture-new", "lines").kind, "new");
  assert.equal(by("fixture-gone", "lines").kind, "gone");
  assert.deepEqual(by("(tree)", "bareCatches"), { file: "(tree)", metric: "bareCatches", base: 40, now: 41, delta: 1, kind: "raise" });
  assert.equal(by("(tree)", "cssClasses"), undefined, "an unchanged ceiling is not a row");
  assert.equal(rows.length, 6);

  // HEAD's committed file against itself: nothing moved, exit 0. The current
  // side is pinned to HEAD's copy, not the working tree's: this test runs from
  // the commit hook, where a staged auto-raise or a merge of the deploy tip
  // legitimately leaves the tree's ratchets.json ahead of HEAD.
  // Pin historyReasoned:false so a dirty CEILING-HISTORY in the worktree cannot
  // soft-pass the absorb cases below.
  const head = loadAt("HEAD");
  const lines = [];
  assert.equal(compareToBase("HEAD", { current: head, print: (l) => lines.push(l), historyReasoned: false }), 0);
  assert.match(lines.at(-1), /0 ceiling\(s\) moved/);
  // A raise within the absorb is reported, not fatal. Past it: fatal only when
  // the SOURCE file's metric also grew past absorb (injectable sourceGrowthFn).
  // A ceiling-only bump with no source growth is catch-up — warning, exit 0 —
  // so a re-measure after other PRs landed lines (#1437 / ship HUD) can clear
  // Structural guards without an admin merge.
  const raised = (n) => ({ ...head, files: { ...head.files, "js/game.js": { ...head.files["js/game.js"], lines: head.files["js/game.js"].lines + n } } });
  const out = [];
  assert.equal(compareToBase("HEAD", { current: raised(40), print: (l) => out.push(l), historyReasoned: false }), 0);
  assert.ok(out.some((l) => /RAISE  js\/game\.js lines: \d+ -> \d+ \(\+40\)/.test(l)), out.join("\n"));
  const catchUp = [];
  assert.equal(compareToBase("HEAD", {
    current: raised(41), print: (l) => catchUp.push(l), sourceGrowthFn: () => 0,
  }), 0, "ceiling catch-up with no source growth must not fail");
  assert.ok(catchUp.some((l) => /catch-up \(source lines grew 0 ≤ 40/.test(l)), catchUp.join("\n"));
  const big = [];
  assert.equal(compareToBase("HEAD", {
    current: raised(41), print: (l) => big.push(l), sourceGrowthFn: () => 41, historyReasoned: false,
  }), 1, "real source growth past absorb still fails");
  assert.ok(big.some((l) => /past the 40-line commit-hook absorb/.test(l)));
  // ADVISORY (a push run): the same real-growth raise is still named, and still
  // says it needs a reason, but the exit is 0 — a push has no PR body to carry
  // the reason, so failing there is a red that no push can clear. The PR run
  // for the same commits calls without --advisory and blocks as above.
  const adv = [];
  assert.equal(compareToBase("HEAD", {
    current: raised(41), print: (l) => adv.push(l), advisory: true, sourceGrowthFn: () => 41, historyReasoned: false,
  }), 0);
  assert.ok(adv.some((l) => /past the 40-line commit-hook absorb.*advisory on a push/.test(l)), adv.join("\n"));
  assert.match(adv.at(-1), /1 past the 40-line absorb \(advisory\)/);
  // CEILING-HISTORY reason (deliberate remesaure): same raise past absorb is
  // named and annotated, exit 0 — the written why is the gate, not a red that
  // no remesaure PR can clear (#1437 / stacked HUD merges on ship). Pin real
  // source growth so catch-up does not soft-pass before the history gate runs.
  const hist = [];
  assert.equal(compareToBase("HEAD", {
    current: raised(41), print: (l) => hist.push(l), sourceGrowthFn: () => 41, historyReasoned: true,
  }), 0);
  assert.ok(hist.some((l) => /reason recorded in docs\/notes\/CEILING-HISTORY\.md/.test(l)), hist.join("\n"));
  // An unreachable ref is a distinct exit, not a crash and not a pass.
  const nope = [];
  assert.equal(compareToBase("0000000000000000000000000000000000000000", { print: (l) => nope.push(l) }), 2);
  assert.match(nope[0], /cannot read tests\/data\/ratchets\.json at 0{40}/);
});

test("15-F10: --base blocks a loosened slack and a deleted entry whose file still exists", () => {
  const head = loadAt("HEAD");
  const exact = Object.entries(head.tree).find(([, v]) => typeof v === "object" && v.slack === 0)?.[0];
  assert.ok(exact, "ratchets.json carries at least one exact-equality (slack 0) tree entry to loosen");
  const loosened = { ...head, tree: { ...head.tree, [exact]: head.tree[exact].ceiling } };   // {ceiling, slack:0} -> bare number
  const out = [];
  assert.equal(compareToBase("HEAD", { current: loosened, print: (l) => out.push(l) }), 1);
  assert.ok(out.some((l) => new RegExp(`LOOSEN \\(tree\\) ${exact}: slack 0 -> default`).test(l)), out.join("\n"));
  const adv = [];
  assert.equal(compareToBase("HEAD", { current: loosened, print: (l) => adv.push(l), advisory: true }), 0, "advisory on a push");
  // A tightened slack, or a ceiling lowered with it, is not a loosening.
  const tighter = { ...head, tree: { ...head.tree, bareCatches: { ...head.tree.bareCatches, slack: 0 } } };
  assert.equal(compareToBase("HEAD", { current: tighter, print: () => {} }), 0);
  // Deleting the entry of a file that still exists removes a guard; of a file that is gone does not.
  const { "js/game.js": _game, ...rest } = head.files;
  const dropped = [];
  assert.equal(compareToBase("HEAD", { current: { ...head, files: rest }, print: (l) => dropped.push(l) }), 1);
  assert.ok(dropped.some((l) => /GONE   js\/game\.js lines: was \d+ — .*the file still exists/.test(l)), dropped.join("\n"));
  const rows = diffRatchets({ files: { "fixture-gone": { lines: 1 } } }, { files: {} });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "gone");
});

test("baked data files are excluded from the size ratchet (#1659)", () => {
  assert.ok(EXCLUDED_FILES.has("js/lighting/presets.js"));
  const base = { files: { "js/lighting/presets.js": { lines: 7339 }, "js/net/lobby.js": { lines: 2407 } }, tree: {} };
  const frag = { name: "x.json", data: { files: { "js/lighting/presets.js": { lines: 50 }, "js/net/lobby.js": { lines: 10 } } } };
  const out = applyFragments(base, [frag]);
  assert.equal(out.files["js/lighting/presets.js"], undefined, "an excluded row is dropped, with or without a fragment delta");
  assert.equal(out.files["js/net/lobby.js"].lines, 2417, "other rows still take their deltas");
  assert.equal(load().files["js/lighting/presets.js"], undefined, "the live ceilings carry no row for it");
});

// Hunt-2 D-rows that rg proved have no caller (#1673). A reintroduction fails
// here before a browser run. Kept rows (game.js destructures, alongAdx,
// deleteMark, doneByInto, getBoostFlame, CamTune, beginUi/afterPaint,
// streetLamp/gridshellCanopy/underpassPortal) still have callers or sit in a
// forbidden file; they are not in this list.
test("hunt-2 zero-ref exports stay deleted (#1673)", () => {
  const gone = [
    ["js/perf/metrics-overlay.js", /\bPANEL_STYLE\b/],
    ["js/track/core/mesh.js", /\bbuildPitGarages\b/],
    ["js/data/real-race-tab.js", /\blapEvents\b/],
    ["js/input/haptics.js", /\btriggerHapticsEnabled\b/],
    ["js/input/input.js", /\btriggerHapticsEnabled\b/],
    ["index.html", /\bid="tc-edge"/],
    ["index.html", /\bid="tc-ink"/],
  ];
  const still = gone.filter(([file, re]) => re.test(fs.readFileSync(file, "utf8")));
  assert.deepEqual(still.map(([file, re]) => `${file} ${re}`), [],
    "a hunt-2 zero-ref export is back");
});

test("terrain-over-road does not treat a missing gap as a pass (#1674)", () => {
  const src = fs.readFileSync("tests/specs/terrain-over-road.spec.js", "utf8");
  assert.equal(/gap === null/.test(src), false,
    "gap === null must not be an accepted success; sample where terrain exists and require a number");
});

test("ratchet data is validated: own keys only, finite numbers, a clear error", async () => {
  const file = Object.keys(load().files)[0];
  // Inherited names are not metrics (`METRICS.constructor` is a function).
  await assert.rejects(measure({ files: { [file]: { constructor: 1 } } }), /unknown metric "constructor"/);
  await assert.rejects(measure({ files: {}, tree: { toString: 1 } }), /tree: unknown metric "toString"/);
  const metric = Object.keys(load().files[file])[0];
  for (const bad of [NaN, Infinity, -Infinity]) {
    await assert.rejects(measure({ files: { [file]: { [metric]: bad } } }), /not a finite number/);
    await assert.rejects(measure({ files: { [file]: { [metric]: { ceiling: 5, slack: bad } } } }), /slack .* finite number/);
  }
  await assert.rejects(measure({ files: { [file]: { [metric]: { ceiling: 5, slack: -1 } } } }), /slack -1/);
  await assert.rejects(measure({ files: { [file]: { [metric]: null } } }), /no ceiling/);
});

test("applyFragments: a delta is matched on own keys and must be a finite number", () => {
  const base = { files: { "a.js": { lines: 10 } }, tree: { rawColor: 5 } };
  // Inherited keys are ignored like any entry the base no longer carries...
  const ok = applyFragments(base, [{ name: "x.json", data: { files: { constructor: { lines: 1 }, "a.js": { toString: 1, lines: 2 } }, tree: { constructor: 1 } } }]);
  assert.deepEqual(ok, { files: { "a.js": { lines: 12 } }, tree: { rawColor: 5 } });
  // ...but a bad number for a real entry is an error that names it, not a silent no-op.
  assert.throws(() => applyFragments(base, [{ name: "x.json", data: { files: { "a.js": { lines: "3" } } } }]), /a\.js lines must be a finite number/);
  assert.throws(() => applyFragments(base, [{ name: "x.json", data: { tree: { rawColor: null } } }]), /tree rawColor must be a finite number/);
});

test("pin counters: APEX_RATCHET_ABSOLUTE judges the tree alone, a named base judges this change's growth (2026-10-26)", async () => {
  const { ratchetMode, pinVerdict } = await import("../../tools/check/ratchets.mjs");
  assert.equal(ratchetMode({ APEX_RATCHET_ABSOLUTE: "1", APEX_RATCHET_BASE_REF: "HEAD" }).mode, "absolute");
  const named = ratchetMode({ APEX_RATCHET_BASE_REF: "HEAD" });
  assert.equal(named.mode, "relative");
  assert.equal(named.base.length, 40, "the base is resolved to a full sha");
  assert.equal(ratchetMode({ APEX_RATCHET_BASE_REF: "refs/heads/no-such-ref-xyz" }).mode, "absolute", "an unreachable base falls back to absolute, never to a pass");
  // Against a synthetic ceiling 5 below the count: absolute is over; relative to HEAD with an equally
  // over base (the same ceiling at HEAD) is an inherited overage, green unless this tree grew past HEAD.
  const data = load();
  const value = (await pinVerdict("rawGameReads", { env: { APEX_RATCHET_ABSOLUTE: "1" }, data })).value;
  const tight = { ...data, tree: { ...data.tree, rawGameReads: value - 5 } };
  const abs = await pinVerdict("rawGameReads", { env: { APEX_RATCHET_ABSOLUTE: "1" }, data: tight });
  assert.equal(abs.ok, false);
  assert.equal(abs.over, 5);
});

test("assertPinsAll counts every source-pin SHAPE, loop arrays element by element (audit4 E1)", async () => {
  const { countPinsAll, loopRegexPins, PIN_METRICS, pinPatterns, seedTreeMetric } = await import("../../tools/check/ratchets.mjs");
  // Fixtures are built from `${A}` so this file's own pin counts do not grow with them.
  const A = "assert";
  const one = {
    [`${A}.match(src, /x/)`]: 1, [`${A}.ok(src.includes("x"))`]: 1, [`${A}.doesNotMatch(src, /x/)`]: 1,
    [`${A}.ok(/x\\(/.test(src))`]: 1, [`${A}.ok(!RE.test(src))`]: 1, [`${A}.ok(src.indexOf("x") >= 0)`]: 1,
    [`${A}.equal(src.includes("x"), false)`]: 1, [`${A}.equal((src.match(/x/g) || []).length, 2)`]: 1,
    [`${A}.ok(src.startsWith("#!"))`]: 1, [`${A}.ok(!src.endsWith("z"))`]: 1,
    [`${A}.equal(f(1), 2)`]: 0, [`${A}.deepEqual(rows, [])`]: 0,
  };
  for (const [line, n] of Object.entries(one)) assert.equal(countPinsAll(line), n, line);
  // A loop over N patterns is N pins, inline or through the const it names; `]` in a
  // string or a character class does not close the array early.
  assert.equal(loopRegexPins('for (const re of [/a\\]b/, "x]", [/c[\\]]/, 1], /d/g]) check(s, re);'), 3);
  assert.equal(loopRegexPins("const PINS = [/a/, /b/];\nfor (const re of PINS) check(s, re);"), 2);
  assert.equal(loopRegexPins("for (const x of [1, 2]) check(x, x);"), 0);
  // assertPins is untouched: the new metric is a superset, not a redefinition.
  assert.equal(PIN_METRICS.assertPins.count(`${A}.doesNotMatch(s, /x/)`), 0);
  assert.equal(pinPatterns.ASSERT_PIN.source, /assert\.match\b|assert\.ok\(\s*!?\s*[\w$.]+\.includes\(/.source);
  // The ceiling exists and was SEEDED by the tool; a second seed is refused (it would be a raise).
  assert.ok(load().tree.assertPinsAll, "tests/data/ratchets.json must carry tree.assertPinsAll (node tools/check/ratchets.mjs --seed=assertPinsAll)");
  await assert.rejects(seedTreeMetric("assertPinsAll", { dryRun: true }), /already has a ceiling/);
  await assert.rejects(seedTreeMetric("noSuchMetric", { dryRun: true }), /unknown tree metric/);
});

test("scopeToBranch: a topic fragment never lowers a loose tree-wide ceiling, but keeps a deliberate tree raise", () => {
  const rows = [
    { tree: true, metric: "assertPins", value: 8119, ceiling: 8173 },        // loose: the deploy branch lowers it, not a topic
    { tree: true, metric: "shellNodes", value: 2236, ceiling: 2229 },        // over: a deliberate --update --fragment raise
    { file: "js/race/pit-lane.js", metric: "lines", value: 101, ceiling: 100 },       // over
    { file: "js/agent/apex.js", metric: "lines", value: 90, ceiling: 100 },  // loose, touched by the branch
    { file: "js/race/wind.js", metric: "lines", value: 90, ceiling: 100 },   // loose, untouched (#2583)
  ];
  const keys = (rs) => rs.map((r) => r.file || r.metric);
  assert.deepEqual(keys(scopeToBranch(rows, new Set(["js/agent/apex.js"]))), ["shellNodes", "js/race/pit-lane.js", "js/agent/apex.js"]);
  assert.deepEqual(keys(scopeToBranch(rows, null)), ["shellNodes", "js/race/pit-lane.js", "js/agent/apex.js", "js/race/wind.js"],
    "no merge-base: every file row as before, still no loose tree row");
});


test("mergeFragment: a re-snap drops a stale negative tree delta instead of pinning it at zero slack", () => {
  const frag = { files: { "js/agent/apex.js": { lines: 5 } }, tree: { assertPins: -50, assertPinsAll: -52, shellNodes: 3 } };
  const out = mergeFragment(frag, [
    { tree: true, metric: "assertPins", value: 8178, ceiling: 8174 },       // over by 4 on the merge result
    { tree: true, metric: "assertPinsAll", value: 10288, ceiling: 10283 },
    { tree: true, metric: "shellNodes", value: 2236, ceiling: 2229 },        // a real raise stays
    { tree: false, file: "js/agent/apex.js", metric: "lines", value: 90, ceiling: 93 },   // a file lowering stays
  ]);
  assert.deepEqual(out, { files: { "js/agent/apex.js": { lines: 2 } }, tree: { shellNodes: 10 } });
});

test("#4257: a topic branch lowers a tree ceiling by its OWN reduction (merge-base delta), never further", async () => {
  const { attributeTree, autoRaiseBlockReason } = await import("../../tools/check/ratchets.mjs");
  const at = { rawColor: () => 334, rawColorDistinct: () => 180 };
  const rows = [
    { tree: true, metric: "rawColor", value: 321, ceiling: 334, slack: 13, slackMax: 0 },             // the branch removed 13
    { tree: true, metric: "rawColorDistinct", value: 178, ceiling: 182, slack: 4, slackMax: 0 },      // base already loose by 2
    { tree: true, metric: "shellNodes", value: 2100, ceiling: 2189, slack: 89, slackMax: 25 },        // no AT_REF form: old rule
  ];
  const got = await attributeTree(rows, { name: "no-such-branch.json", base: "BASE", at });
  assert.deepEqual(got.map((r) => r.ownMin), [-13, -2, undefined]);
  assert.deepEqual(await attributeTree(rows, { name: "no-such-branch.json", base: null, at }), rows, "no merge-base: rows unchanged");
  assert.deepEqual(await attributeTree(rows, { name: null, base: "BASE", at }), rows, "the deploy branch: rows unchanged");
  assert.deepEqual(scopeToBranch(got, new Set()).map((r) => r.metric), ["rawColor", "rawColorDistinct"]);
  // The fragment carries the branch's own share: −13, and −2 (not −4: the base's own looseness is not this branch's).
  assert.deepEqual(mergeFragment({}, scopeToBranch(got, new Set())), { tree: { rawColor: -13, rawColorDistinct: -2 } });
  // A re-snap after re-adding one colour gives back 1 of the branch's −13 (a raise inside its own lowering).
  const back = { tree: true, metric: "rawColor", value: 322, ceiling: 321, over: 1, slack: -1, slackMax: 0, ownMin: -12, ownFrag: -13 };
  assert.equal(autoRaiseBlockReason(back), null, "giving back the branch's own lowering is not a raise");
  assert.equal(autoRaiseBlockReason({ ...back, value: 335, over: 14 }), "a tree-wide metric is shrink-only — never auto-raised", "past the branch's own lowering it is a raise again");
  assert.deepEqual(mergeFragment({ tree: { rawColor: -13 } }, [back]), { tree: { rawColor: -12 } });
  // Every colour re-added: the delta nets to zero and goes; a stale negative with no ownMin still drops (#3996).
  assert.deepEqual(mergeFragment({ tree: { rawColor: -13 } }, [{ ...back, value: 334, over: 13, ownMin: 0 }]), { tree: {} });
  assert.deepEqual(mergeFragment({}, [{ tree: true, metric: "rawColor", value: 321, ceiling: 334 }]), { tree: {} });
});

test("#4257: own tree lowerings add under a merge, so siblings stay at ceiling == value (no #3996 sibling-OVER)", () => {
  const base = { files: {}, tree: { rawColor: { ceiling: 334, slack: 0 } } };
  const lowering = (value, ownMin) => mergeFragment({}, [{ tree: true, metric: "rawColor", value, ceiling: 334, ownMin }]);
  const a = lowering(321, -13), b = lowering(332, -2), c = {};   // c touches no CSS
  const merged = applyFragments(base, [{ name: "a", data: a }, { name: "b", data: b }, { name: "c", data: c }]);
  assert.equal(merged.tree.rawColor.ceiling, 334 - 13 - 2, "the merged tip measures 319 and its ceiling is 319");
});

test("#4257: AT_REF counts css/ at a git ref the same way the live scan counts the working tree", async (t) => {
  const cp = await import("node:child_process");
  const dirty = cp.execFileSync("git", ["status", "--porcelain", "--", "css/"], { encoding: "utf8" }).trim();
  if (dirty) { t.skip("css/ differs from HEAD in this checkout"); return; }
  const { AT_REF } = await import("../../tools/check/tree-counts.mjs");
  for (const [metric, fn] of Object.entries(AT_REF)) assert.equal(fn("HEAD"), await TREE_METRICS[metric](), metric);
});
