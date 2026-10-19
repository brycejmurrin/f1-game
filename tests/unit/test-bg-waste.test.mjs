/* test-bg-waste.test.mjs — WASTE line when a browser group starts on a docs-only diff.
 *
 * Advisory detector in test-bg.mjs (#1714 / measurement.md item 3). Pure function
 * over (groups, scripts, changed, force); never blocks the start.
 *
 * Run: node --test tests/unit/test-bg-waste.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { docsOnlyWasteWarning } from "../../tools/ci/test-bg.mjs";

const scripts = {
  "test:smoke": "node tools/ci/run-playwright.mjs tests/specs/smoke.spec.js",
  "test:logging": "node tools/ci/run-playwright.mjs tests/specs/logging.spec.js",
  "test:tooling-fast": "node tools/ci/tooling-fast.mjs",
  "test:guards": "node --test tests/unit/docs-integrity.test.mjs",
};

test("docs-only + browser group → WASTE line naming the group", () => {
  const line = docsOnlyWasteWarning({
    groups: ["smoke"],
    scripts,
    changed: ["docs/TESTING.md", "AGENTS.md", ".claude/skills/check/SKILL.md"],
    force: false,
  });
  assert.equal(
    line,
    "WASTE: docs-only diff — group smoke buys nothing (AGENTS.md verification table). --force to run.",
  );
});

test("multiple browser groups are listed; --force silences", () => {
  const line = docsOnlyWasteWarning({
    groups: ["smoke", "logging"],
    scripts,
    changed: ["docs/TESTING.md"],
    force: false,
  });
  assert.match(line, /group smoke, logging buys nothing/);
  assert.equal(docsOnlyWasteWarning({
    groups: ["smoke"], scripts, changed: ["docs/TESTING.md"], force: true,
  }), null);
});

test("code diff or non-browser group → no WASTE", () => {
  assert.equal(docsOnlyWasteWarning({
    groups: ["smoke"], scripts, changed: ["docs/TESTING.md", "js/game.js"], force: false,
  }), null);
  assert.equal(docsOnlyWasteWarning({
    groups: ["tooling-fast"], scripts, changed: ["docs/TESTING.md"], force: false,
  }), null);
  assert.equal(docsOnlyWasteWarning({
    groups: ["guards"], scripts, changed: ["README.md"], force: false,
  }), null);
  assert.equal(docsOnlyWasteWarning({
    groups: ["smoke"], scripts, changed: [], force: false,
  }), null);
});
