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
export function loadQuarantine(file = QUARANTINE, now = new Date()) {
  try {
    const q = JSON.parse(fs.readFileSync(file, "utf8")).quarantine || [];
    const active = q.filter((e) => e.title && e.owner && e.review && e.evidence &&
      /^\d{4}-\d{2}-\d{2}$/.test(e.expires || "") && Number.isFinite(Date.parse(e.expires + "T00:00:00Z")) &&
      now.toISOString().slice(0, 10) <= e.expires && signatureOk(e));
    // Keep spec membership for shard scheduling, exact identities for verdicts.
    const specs = new Set(active.map((e) => e.spec));
    specs.policies = active;
    return specs;
  } catch {
    return new Set();
  }
}

/** A row's optional `signature` (audit4 D1, 2026-10-26): a case-sensitive
 *  regex SOURCE anchored with `^`, matched against the retried attempt's
 *  normalised first error line (errorLine). A row that carries one exempts
 *  ONLY that failure: the same test failing with another message still blocks.
 *  A signature that is not a string, not anchored or does not compile makes
 *  the row inactive — fail closed, like every other missing policy field. */
export function signatureOk(row) {
  if (row.signature === undefined) return true;
  if (typeof row.signature !== "string" || !row.signature.startsWith("^")) return false;
  try { new RegExp(row.signature); return true; } catch { return false; }
}

/** The first non-empty line of an error message, ANSI colour codes and a
 *  leading `Error: ` removed — the text a quarantine signature is matched on. */
export function errorLine(message = "") {
  const first = String(message).replace(/\u001b\[[0-9;]*m/g, "").split("\n").map((l) => l.trim()).find(Boolean) || "";
  return first.replace(/^Error: /, "");
}

/** Does this quarantine row cover this flaky test (spec, exact title, and the
 *  signature when the row has one)? */
export function rowCovers(row, t) {
  if (row.spec !== t.spec || row.title !== t.title) return false;
  if (row.signature === undefined) return true;
  return signatureOk(row) && new RegExp(row.signature).test(errorLine(t.error));
}

/**
 * @param {{spec: string, title: string, error?: string}[]} flaky  tests that passed only on retry
 * @param {Set<string>} quarantine  spec paths whose flakes are known and owned
 * @returns {{ blocking: object[], quarantined: object[], fail: boolean }}
 */
export function flakyVerdict(flaky, quarantine) {
  const blocking = [], quarantined = [];
  for (const t of flaky) {
    const known = quarantine.policies
      ? quarantine.policies.some((row) => rowCovers(row, t))
      : false;
    (known ? quarantined : blocking).push(t);
  }
  return { blocking, quarantined, fail: blocking.length > 0 };
}

/** Is the policy armed? The env var is the only switch; ci.yml sets it. */
export function armed(env = process.env) {
  return env.APEX_FAIL_ON_FLAKY === "1";
}
