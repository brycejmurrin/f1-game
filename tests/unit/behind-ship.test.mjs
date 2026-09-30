// behind-ship — advisory "how far behind ship?" for concurrent PRs; never fails.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SHIP, WARN_BEHIND, measure, reportLine, warningAnnotation,
} from "../../tools/ci/behind-ship.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("defaults name the ship branch and warn threshold of 10", () => {
  assert.equal(SHIP, "claude/f1-game-project-26h3ng");
  assert.equal(WARN_BEHIND, 10);
});

test("measure counts commits on ship not in head", () => {
  const git = (...args) => {
    const key = args.join(" ");
    if (key.startsWith("rev-parse --verify -q HEAD")) return { status: 0, stdout: "abc", stderr: "" };
    if (key.startsWith("rev-parse --verify -q origin/")) return { status: 0, stdout: "def", stderr: "" };
    if (key.startsWith("rev-list --count HEAD..origin/")) return { status: 0, stdout: "12", stderr: "" };
    return { status: 1, stdout: "", stderr: `unexpected ${key}` };
  };
  const m = measure({ git, head: "HEAD", ship: `origin/${SHIP}` });
  assert.equal(m.ok, true);
  assert.equal(m.behind, 12);
  assert.equal(m.warnAt, 10);
});

test("measure reports unresolved refs without throwing", () => {
  const git = () => ({ status: 1, stdout: "", stderr: "missing" });
  const m = measure({ git, head: "nope", ship: "also-nope" });
  assert.equal(m.ok, false);
  assert.equal(m.behind, null);
  assert.match(reportLine(m), /could not measure/);
  assert.equal(warningAnnotation(m), null);
});

test("warning annotation only when behind exceeds threshold", () => {
  const base = { ok: true, head: "h", ship: `origin/${SHIP}`, warnAt: 10 };
  assert.equal(warningAnnotation({ ...base, behind: 10 }), null);
  assert.equal(warningAnnotation({ ...base, behind: 0 }), null);
  const w = warningAnnotation({ ...base, behind: 11 });
  assert.match(w, /^::warning /);
  assert.match(w, /11 commits behind/);
  assert.match(w, /threshold 10/);
  assert.doesNotMatch(w, /::error/);
});

test("CLI always exits 0 even when over threshold or unresolved", () => {
  const run = (extraEnv = {}) => {
    try {
      execFileSync("node", ["tools/ci/behind-ship.mjs", "--head", "HEAD", "--ship", "origin/" + SHIP], {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, ...extraEnv },
      });
      return 0;
    } catch (e) {
      return e.status;
    }
  };
  // Real checkout: whatever the count, exit must be 0.
  assert.equal(run(), 0);
  assert.equal(run({ BEHIND_SHIP_SHIP: "refs/does-not-exist-behind-ship" }), 0);
});

test("guards job wires behind-ship as a non-blocking PR step", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const guards = yml.split("\n  guards:\n")[1]?.split(/^  [a-z][\w-]*:$/m)[0] || "";
  assert.match(guards, /behind-ship\.mjs/, "Structural guards must run behind-ship.mjs");
  assert.match(guards, /How far behind ship\?/, "step must be named");
  assert.match(guards, /if: github\.event_name == 'pull_request'/,
    "behind-ship is PR-only (ship-push already IS ship)");
  // Multiline step (fetch tip, then the tool). Never ::error / continue-on-error —
  // the tool itself exits 0.
  assert.match(guards, /node tools\/ci\/behind-ship\.mjs/);
  assert.doesNotMatch(guards.split("behind-ship.mjs")[0].slice(-400), /continue-on-error:\s*true/,
    "do not paper over a real step failure with continue-on-error; the tool never fails");
});
