// ratchets.test.mjs — the size ratchets in tests/data/ratchets.json, checked
// in-process by tools/check/ratchets.mjs. LOWER a ceiling when you extract
// (`node tools/check/ratchets.mjs --update`); raising one is a deliberate edit of
// the JSON with a reason in the commit. History: docs/notes/CEILING-HISTORY.md.
// Run: node --test tests/unit/ratchets.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, measure, verdict, looseAdvisory, METRICS, TREE_METRICS, SLACK_MIN, SLACK_PCT, diffRatchets, compareToBase, loadAt } from "../../tools/check/ratchets.mjs";

test("every ratcheted metric is at or under its ceiling", async () => {
  const v = verdict(await measure());
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
  // The row's OWN slack, not the default formula: a slack-0 entry used to be
  // reported as "slack 1 > max(60, 4%)", which reads as a contradiction.
  const loose = v.loose.map((r) => `${r.file} ${r.metric}: ${r.value} but ceiling ${r.ceiling} (slack ${r.slack} > ${r.slackMax}${r.slackMax === 0 ? ", exact" : ""})`);
  if (advisory) {
    for (const l of loose) t.diagnostic(`LOOSE (advisory on ${process.env.GITHUB_EVENT_NAME}) ${l} — lower it with node tools/check/ratchets.mjs --update`);
    assert.equal(v.ok, v.over.length === 0, "advisory: a LOOSE row never decides the verdict, an OVER row still does");
    return;
  }
  assert.deepEqual(loose, [],
    "a ceiling drifted above its file and stopped ratcheting — node tools/check/ratchets.mjs --update");
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
  // A ceiling that is over by more than the bound is refused, never written:
  // simulate by asking for a bound below any real growth on a tree that has some,
  // or, on a green tree, by checking the classification directly.
  const over = rows.filter((r) => r.over > 0);
  if (over.length) {
    const tight = await autoRaise({ maxRaise: Math.max(0, Math.min(...over.map((r) => r.over)) - 1), dryRun: true });
    assert.equal(tight.ok, false);
    assert.ok(tight.blocked.length >= 1);
  }
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
  const head = loadAt("HEAD");
  const lines = [];
  assert.equal(compareToBase("HEAD", { current: head, print: (l) => lines.push(l) }), 0);
  assert.match(lines.at(-1), /0 ceiling\(s\) moved/);
  // A raise within the absorb is reported, not fatal; past it, fatal.
  const raised = (n) => ({ ...head, files: { ...head.files, "js/game.js": { ...head.files["js/game.js"], lines: head.files["js/game.js"].lines + n } } });
  const out = [];
  assert.equal(compareToBase("HEAD", { current: raised(40), print: (l) => out.push(l) }), 0);
  assert.ok(out.some((l) => /RAISE  js\/game\.js lines: \d+ -> \d+ \(\+40\)/.test(l)), out.join("\n"));
  const big = [];
  assert.equal(compareToBase("HEAD", { current: raised(41), print: (l) => big.push(l) }), 1);
  assert.ok(big.some((l) => /past the 40-line commit-hook absorb/.test(l)));
  // ADVISORY (a push run): the same raise is still named, and still says it
  // needs a reason, but the exit is 0 — a push has no PR body to carry the
  // reason, so failing there is a red that no push can clear. The PR run
  // for the same commits calls without --advisory and blocks as above.
  const adv = [];
  assert.equal(compareToBase("HEAD", { current: raised(41), print: (l) => adv.push(l), advisory: true }), 0);
  assert.ok(adv.some((l) => /past the 40-line commit-hook absorb.*advisory on a push/.test(l)), adv.join("\n"));
  assert.match(adv.at(-1), /1 past the 40-line absorb \(advisory\)/);
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
