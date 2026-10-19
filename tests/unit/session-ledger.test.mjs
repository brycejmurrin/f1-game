/* session-ledger.test.mjs — transcript minutes by tool/family, with redaction.
 *
 * Privacy is binding (#1714): tokens, emails, and absolute paths outside the
 * repo must never appear in keys or the summary line. Allowlisted Bash shapes
 * (npm run, node tools/ci/*, git <verb>) keep a stable key; everything else
 * collapses to "other".
 *
 * Run: node --test tests/unit/session-ledger.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyBash, redactText, toolKey, fromTranscript, toJson,
  buildRows, parseTranscript, formatSummary, summarise,
} from "../../tools/ci/session-ledger.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const FIX = path.join(ROOT, "tests/fixtures/session-ledger");
const LEAKS = [
  "ghp_LEAKTOKEN01234567890123456789012",
  "sk-LEAKSECRETKEY0123456789012345",
  "ghp_ANOTHERLEAKTOKEN012345678901234",
  "agent@example.com",
  "/home/ubuntu/.ssh/id_rsa",
  "/home/ubuntu/secret/key.pem",
  "/tmp/cursor/secret-notes.txt",
];

const dumpHasLeak = (s) => LEAKS.some((x) => String(s).includes(x));

test("classifyBash: allowlisted shapes stay; secrets and unknown commands become other", () => {
  assert.equal(classifyBash("npm run test:smoke"), "npm run test:smoke");
  assert.equal(classifyBash("node tools/ci/test-bg.mjs hooks"), "node tools/ci/test-bg.mjs");
  assert.equal(classifyBash("git status --short"), "git status");
  assert.equal(classifyBash("git commit -m 'x'"), "git commit");
  assert.equal(classifyBash("curl https://example.com"), "other");
  assert.equal(classifyBash("curl -H 'Authorization: Bearer sk-LEAKSECRETKEY0123456789012345' x"), "other");
  assert.equal(classifyBash("echo agent@example.com"), "other");
});

test("redactText strips tokens, emails, and abs paths outside the repo", () => {
  const s = redactText(
    "token ghp_LEAKTOKEN01234567890123456789012 mail agent@example.com file /home/ubuntu/secret/key.pem in /workspace/docs/x.md",
    { root: ROOT },
  );
  assert.equal(dumpHasLeak(s), false);
  assert.match(s, /<token>/);
  assert.match(s, /<email>/);
  assert.match(s, /<path>/);
  // Repo-relative path survives (or is rewritten relative).
  assert.match(s, /docs\/x\.md/);
});

test("toolKey never echoes an absolute path outside the repo", () => {
  assert.equal(toolKey("Write", { file_path: "/tmp/cursor/secret-notes.txt" }, { root: ROOT }), "Write:<path>");
  assert.match(toolKey("Edit", { file_path: path.join(ROOT, "docs/TESTING.md") }, { root: ROOT }), /^Edit:docs\/TESTING\.md$/);
});

test("fixture transcript: summary has families, timeouts, repeats; no secrets leak", () => {
  const result = fromTranscript(path.join(FIX, "transcript.jsonl"), {
    permissionsPath: path.join(FIX, "permissions.jsonl"),
    root: ROOT,
  });
  const json = JSON.stringify(toJson(result));
  const line = result.line;
  assert.equal(dumpHasLeak(json), false, "JSON output must not contain fixture secrets");
  assert.equal(dumpHasLeak(line), false, "summary line must not contain fixture secrets");
  assert.equal(dumpHasLeak(result.rows.map((r) => r.key).join("\n")), false);

  // Allowlisted keys present; secret curl collapsed.
  const keys = result.rows.map((r) => r.key);
  assert.ok(keys.includes("npm run test:smoke"));
  assert.ok(keys.includes("git status"));
  assert.ok(keys.includes("other"), "secret curl and outside-repo write become other / path");
  assert.ok(!keys.some((k) => /curl|sk-|ghp_|@example/.test(k)));

  assert.ok(result.summary.timeouts >= 1, "timeout row counted");
  assert.ok(result.summary.repeats.some((r) => r.key === "git status" && r.n >= 2));
  assert.ok(result.summary.permStalls >= 3, "2 embedded npm run gen + sidecar git add (+ secret→other)");
  assert.equal(result.summary.permKeys["npm run gen"], 2);
  assert.match(line, /waiting on tools/);
  assert.match(line, /by tool:/);
});

test("buildRows pairs tool_use with tool_result and records duration", () => {
  const entries = parseTranscript(fs.readFileSync(path.join(FIX, "transcript.jsonl"), "utf8"));
  const rows = buildRows(entries, { root: ROOT });
  const smoke = rows.find((r) => r.key === "npm run test:smoke");
  assert.ok(smoke);
  assert.equal(smoke.dur_ms, 40_000);
  assert.equal(smoke.ok, true);
  const timed = rows.find((r) => r.ev === "timeout" || (r.key === "npm run test:gfx" && r.ok === false));
  assert.ok(timed, "gfx timeout marked");
});

test("formatSummary is stable on an empty ledger", () => {
  assert.equal(formatSummary(summarise([])), "empty ledger");
});
