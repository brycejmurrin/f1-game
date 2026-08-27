// assert-audit — a test that asserts nothing is prose too.
//
// tools/test-observed.mjs answers "has this test ever run?". This is the
// question that survives a yes: when it ran, did it CHECK anything? A body with
// no assertion passes as long as the page does not throw, and it reports as a
// green tick beside real tests.
//
// The tool's own failure mode is the one that matters most here, and the first
// version shipped it: a lexical scan of the test BODY calls hud-audit's eight
// steer-mode tests vacuous, because every one of them asserts through
// `assertHud(page, mode)` and nothing else. Fifty "zero-assertion tests" of
// which ten were false positives is a report nobody acts on. Helper following
// is therefore not a refinement of this tool, it is the tool — and it gets the
// first two tests below.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanSource, audit, CAPTURE_HARNESSES } from "../../tools/assert-audit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const one = (src) => scanSource(src).tests[0];

test("a bare body with no assertion is vacuous", () => {
  const t = one(`test("captures a screen", async ({ page }) => {
    await page.goto("/");
    await page.screenshot({ path: "x.png" });
  });`);
  assert.equal(t.verdict, "vacuous");
});

test("an assertion reached ONLY through a helper still counts", () => {
  // The exact shape of hud-audit's eight steer-mode tests.
  const t = one(`
    async function assertHud(page) { await expect(page.locator("#hud")).toBeVisible(); }
    test("touch", async ({ page }) => { await assertHud(page); await shot(page, "x"); });`);
  assert.equal(t.verdict, "asserting");
  assert.equal(t.viaHelper, true);
});

test("helper following is transitive, and terminates on a cycle", () => {
  const t = one(`
    const a = async (p) => b(p);
    const b = async (p) => { a(p); await expect(p).toBeTruthy(); };
    test("x", async ({ page }) => { await a(page); });`);
  assert.equal(t.verdict, "asserting");
});

test("a wait-only body is IMPLICIT — weak, but not nothing", () => {
  // waitForFunction fails on timeout, so it does check something. Grading it
  // as vacuous overstates the problem; grading it as asserting hides it.
  const t = one(`test("boots", async ({ page }) => {
    await page.waitForFunction(() => window.__apex);
    await page.locator("#hud").waitFor({ state: "visible" });
  });`);
  assert.equal(t.verdict, "implicit");
  assert.equal(t.direct, 0);
});

test("an empty .catch(() => {}) is reported — a rejection becomes a pass", () => {
  const t = one(`test("x", async ({ page }) => {
    await page.waitForFunction(() => done, { timeout: 8000 }).catch(() => {});
    expect(1).toBe(1);
  });`);
  assert.equal(t.swallow, 1);
});

test("a skipped test is flagged, not counted among the live ones", () => {
  const t = one(`test.skip("not now", async () => {});`);
  assert.equal(t.skipped, true);
});

test("test.describe is a suite, not a test", () => {
  const src = `test.describe("group", () => { test("leaf", async () => { expect(1).toBe(1); }); });`;
  const { tests } = scanSource(src);
  assert.deepEqual(tests.map((t) => t.title), ["leaf"]);
});

test("every spec parses", () => {
  // A parse failure drops a whole file from the denominator, which reads as
  // "nothing to worry about in there".
  const bad = audit().filter((r) => r.parseError);
  assert.deepEqual(bad.map((b) => `${b.file}: ${b.parseError}`), []);
});

test("the audit sees the whole suite — anti-vacuity on itself", () => {
  // If extraction broke, every count would collapse to zero and the tool would
  // report a perfectly clean tree rather than failing.
  const all = audit().flatMap((r) => r.tests);
  assert.ok(all.length > 900, `expected 900+ declared tests, got ${all.length}`);
  assert.ok(all.filter((t) => t.verdict === "asserting").length > 800);
  assert.ok(all.some((t) => t.viaHelper), "helper following resolved nothing at all");
});

test("hud-audit's steer-mode tests assert through assertHud — the false positive, pinned", () => {
  const row = audit().find((r) => r.file === "tests/specs/hud-audit.spec.js");
  assert.ok(row, "tests/specs/hud-audit.spec.js has moved or gone");
  const steer = row.tests.filter((t) => /tilt|buttons|touch/.test(t.title));
  assert.equal(steer.length, 8);
  for (const t of steer) {
    assert.equal(t.verdict, "asserting", `${t.title} read as ${t.verdict}`);
    assert.equal(t.viaHelper, true);
  }
});

test("NO test in the default suite is vacuous outside a declared capture harness", () => {
  // The ratchet. A capture harness whose product is a PNG gallery is
  // legitimately assertion-free — the fix for those is to move them out of the
  // default suite, not to bolt an expect() on. Anywhere else, a body that
  // checks nothing is a green tick that means nothing.
  const bad = audit().flatMap((r) =>
    CAPTURE_HARNESSES.has(r.file)
      ? []
      : r.tests.filter((t) => t.verdict === "vacuous" && !t.skipped)
               .map((t) => `${r.file}:${t.line} ${t.title}`));
  assert.deepEqual(bad, []);
});

test("the declared capture harnesses are still capture harnesses", () => {
  // The allow-list is only safe while it stays small and stays true. A file
  // that grew real assertions should leave the list; one that no longer exists
  // must not sit here granting an exemption to nothing.
  const rows = audit();
  for (const file of CAPTURE_HARNESSES) {
    const row = rows.find((r) => r.file === file);
    assert.ok(row, `${file} is exempted but does not exist`);
    assert.equal(row.tests.filter((t) => t.verdict === "asserting").length, 0,
      `${file} now has real assertions — take it off the capture-harness list`);
  }
});

test("an aliased test import is still a test — `import { test as freshTest }`", () => {
  // An unrecognised name is not a warning, it is silence: those tests drop out
  // of the ratchet entirely, so one could lose its last assertion and nothing
  // would say so. tests/specs/tracks-walls.spec.js imports BOTH sharedTest and the
  // virgin `test` under an alias, because one of its tests mutates physics the
  // shared reset does not rewind — a legitimate shape the tool must not blind
  // itself to.
  const src = `import { sharedTest as test, test as freshTest, expect } from "./fixtures.js";
    test("shared one", async () => { expect(1).toBe(1); });
    freshTest("virgin one", async () => {});`;
  const { tests } = scanSource(src);
  assert.deepEqual(tests.map((t) => [t.title, t.verdict]),
    [["shared one", "asserting"], ["virgin one", "vacuous"]]);
});

test("an alias of something that is NOT a test function is not a test", () => {
  const src = `import { expect as check } from "./fixtures.js";
    check("not a test", 1);`;
  assert.deepEqual(scanSource(src).tests, []);
});

// ── tests/unit joins the vacuity ratchet (round 6) ───────────────────────────
// audit() defaulted to tests/specs for the tool's whole life, so the 130+ unit
// suites were never vacuity-scanned — a blind spot in the repo's own
// truth-instrument. Measured on joining: 1,376 unit tests, ALL asserting,
// zero swallows. This test keeps it that way.
test("every tests/unit suite is scanned and none is vacuous or swallowing", () => {
  const dir = path.join(ROOT, "tests/unit");
  const rows = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".test.mjs")).sort()) {
    rows.push(scanSource(fs.readFileSync(path.join(dir, f), "utf8"), "tests/unit/" + f));
  }
  const all = rows.flatMap((r) => r.tests);
  assert.ok(rows.length > 120 && all.length > 1200,
    `unit scan looks broken: ${rows.length} files / ${all.length} tests`);
  const bad = all.filter((t) => !t.skipped && t.verdict !== "asserting")
    .map((t) => `${t.title} [${t.verdict}]`);
  assert.deepEqual(bad, [],
    "a tests/unit test asserts nothing — give it a real assertion or skip-with-reason");
  const swallows = rows.flatMap((r) => r.tests.filter((t) => t.swallow > 0)
    .map((t) => `${r.file}:${t.line} ${t.title}`));
  assert.deepEqual(swallows, [], "a tests/unit test swallows a rejection");
});
