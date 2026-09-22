// ratchets.test.mjs — the size ratchets in tests/data/ratchets.json, checked
// in-process by tools/check/ratchets.mjs. LOWER a ceiling when you extract
// (`node tools/check/ratchets.mjs --update`); raising one is a deliberate edit of
// the JSON with a reason in the commit. History: docs/notes/CEILING-HISTORY.md.
// Run: node --test tests/unit/ratchets.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, measure, verdict, METRICS, TREE_METRICS, SLACK_MIN, SLACK_PCT, diffRatchets, compareToBase } from "../../tools/check/ratchets.mjs";

test("every ratcheted metric is at or under its ceiling", async () => {
  const v = verdict(await measure());
  assert.deepEqual(v.over.map((r) => `${r.file} ${r.metric}: ${r.value} > ${r.ceiling} (+${r.over})`), [],
    "a file grew past its ceiling — extract something, or raise the number in tests/data/ratchets.json deliberately and say why in the commit");
  assert.deepEqual(v.rows.filter((r) => r.missing).map((r) => r.file), [], "a ratcheted file is gone — drop its entry or fix the path");
});

test("no ceiling is left far above the value it guards (one slack rule)", async () => {
  const v = verdict(await measure());
  assert.deepEqual(v.loose.map((r) => `${r.file} ${r.metric}: ${r.value} but ceiling ${r.ceiling} (slack ${r.slack} > max(${SLACK_MIN}, ${SLACK_PCT * 100}%))`), [],
    "a ceiling drifted above its file and stopped ratcheting — node tools/check/ratchets.mjs --update");
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

  // Against HEAD the committed file is its own base: nothing moved, exit 0.
  const lines = [];
  assert.equal(compareToBase("HEAD", { print: (l) => lines.push(l) }), 0);
  assert.match(lines.at(-1), /0 ceiling\(s\) moved/);
  // A raise within the absorb is reported, not fatal; past it, fatal.
  const out = [];
  assert.equal(compareToBase("HEAD", { current: { ...load(), files: { ...load().files, "js/game.js": { ...load().files["js/game.js"], lines: load().files["js/game.js"].lines + 40 } } }, print: (l) => out.push(l) }), 0);
  assert.ok(out.some((l) => /RAISE  js\/game\.js lines: \d+ -> \d+ \(\+40\)/.test(l)), out.join("\n"));
  const big = [];
  assert.equal(compareToBase("HEAD", { current: { ...load(), files: { ...load().files, "js/game.js": { ...load().files["js/game.js"], lines: load().files["js/game.js"].lines + 41 } } }, print: (l) => big.push(l) }), 1);
  assert.ok(big.some((l) => /past the 40-line commit-hook absorb/.test(l)));
  // An unreachable ref is a distinct exit, not a crash and not a pass.
  const nope = [];
  assert.equal(compareToBase("0000000000000000000000000000000000000000", { print: (l) => nope.push(l) }), 2);
  assert.match(nope[0], /cannot read tests\/data\/ratchets\.json at 0{40}/);
});
