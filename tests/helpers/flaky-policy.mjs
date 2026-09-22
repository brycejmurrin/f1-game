// flaky-policy.mjs — the one decision behind APEX_FAIL_ON_FLAKY=1, as pure
// functions so a unit test can pin it without a browser.
//
// AGENTS.md §Verification 9: a pass that needed a retry is a red. The reporter
// (tests/helpers/live-reporter.js) collects every test whose outcome() is
// "flaky" and asks this module whether the run may still be called passed.
// tests/data/flaky-quarantine.json names the specs whose flakes are known,
// owned and dated; those are printed and do not block. Anything else blocks.
//
// Playwright's own --fail-on-flaky-tests is all-or-nothing, which is why the
// verdict lives here and not in a CLI flag.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const QUARANTINE = path.join(ROOT, "tests/data/flaky-quarantine.json");

/** Specs under quarantine, as repo-relative paths (the reporter's key().spec shape). */
export function loadQuarantine(file = QUARANTINE) {
  try {
    const q = JSON.parse(fs.readFileSync(file, "utf8")).quarantine || [];
    return new Set(q.map((e) => e.spec));
  } catch {
    return new Set();
  }
}

/**
 * @param {{spec: string, title: string}[]} flaky  tests that passed only on retry
 * @param {Set<string>} quarantine  spec paths whose flakes are known and owned
 * @returns {{ blocking: object[], quarantined: object[], fail: boolean }}
 */
export function flakyVerdict(flaky, quarantine) {
  const blocking = [], quarantined = [];
  for (const t of flaky) (quarantine.has(t.spec) ? quarantined : blocking).push(t);
  return { blocking, quarantined, fail: blocking.length > 0 };
}

/** Is the policy armed? The env var is the only switch; ci.yml sets it. */
export function armed(env = process.env) {
  return env.APEX_FAIL_ON_FLAKY === "1";
}
