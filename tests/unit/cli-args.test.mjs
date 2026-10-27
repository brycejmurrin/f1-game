/* cli-args.test.mjs — tools/lib/cli-args.mjs rejects what it does not recognise.
 * The original defect (2026-09-09): a typo or a space-form value was silently
 * dropped and a measurement tool printed a full table for the DEFAULT argument.
 * Pure node, no browser, < 0.2 s. */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { makeFlags, parseFlags, exitIfHelp, strictFlags, CliArgError } from "../../tools/lib/cli-args.mjs";
import { gitRun, gitMust, gitTry, gitOut } from "../../tools/lib/git-run.mjs";

const KNOWN = ["--team", "--out", "--help"];

test("an unknown flag throws CliArgError naming the near miss and what is accepted", () => {
  assert.throws(() => makeFlags(["--tema=redbull"], KNOWN), (e) => {
    assert.ok(e instanceof CliArgError);
    assert.match(e.message, /unknown flag --tema/);
    assert.match(e.message, /did you mean --team/);
    assert.match(e.message, /accepts: --team --out --help/);
    return true;
  });
});

test("a bare unknown flag is rejected, a known one and a positional are not", () => {
  assert.throws(() => makeFlags(["--bogus"], KNOWN), CliArgError);
  assert.doesNotThrow(() => makeFlags(["monza", "0.1", "--team=x", "--"], KNOWN));
});

test("--name=value and --name value read the same", () => {
  assert.equal(makeFlags(["--team=redbull"], KNOWN).flag("--team"), "redbull");
  assert.equal(makeFlags(["--team", "redbull"], KNOWN).flag("--team"), "redbull");
  assert.equal(makeFlags([], KNOWN).flag("--team", "mclaren"), "mclaren");
  // `--out --team` must not read "--team" as out's value.
  assert.equal(makeFlags(["--out", "--team", "x"], KNOWN).flag("--out", "dflt"), "dflt");
});

test("has() sees both the bare and the = spelling; list() drops empty entries", () => {
  const f = makeFlags(["--out=a,,b", "--help"], KNOWN);
  assert.ok(f.has("--help"));
  assert.ok(f.has("--out"));
  assert.ok(!f.has("--team"));
  assert.deepEqual(f.list("--out"), ["a", "b"]);
});

test("--help: exitIfHelp prints the text and exits 0; a CLI built on parseFlags exits 1 with the message, no stack", () => {
  const run = (code) => spawnSync(process.execPath, ["--input-type=module", "-e", code],
    { encoding: "utf8", cwd: new URL("../..", import.meta.url).pathname, timeout: 10000 });
  const help = run(`import {exitIfHelp} from "./tools/lib/cli-args.mjs"; exitIfHelp(["--help"], "usage: x\\n"); console.log("not reached")`);
  assert.equal(help.status, 0);
  assert.equal(help.stdout.trim(), "usage: x");
  const bad = run(`import {parseFlags} from "./tools/lib/cli-args.mjs"; parseFlags(["--tema"], ["--team"])`);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /unknown flag --tema — did you mean --team/);
  assert.doesNotMatch(bad.stderr, /\n\s+at /, "a typo is the caller's, not a crash");
  assert.equal(typeof exitIfHelp, "function");
  assert.equal(typeof parseFlags, "function");
});

test("strictFlags: --help prints usage (+ any flag it omits) and exits 0; a typo prints the near miss + usage and exits 2", () => {
  const codes = [];
  const exit = (c) => codes.push(c);
  const log = console.log, err = console.error;
  const out = [];
  console.log = (s) => out.push(["out", s]); console.error = (s) => out.push(["err", s]);
  try {
    strictFlags(["--help"], ["--team", "--out"], "usage: x [--team]", { exit });
    strictFlags(["--tema"], ["--team", "--out"], "usage: x [--team]", { exit });
    assert.equal(strictFlags(["--team", "rb"], ["--team"], "usage: x", { exit }).flag("--team"), "rb");
  } finally { console.log = log; console.error = err; }
  assert.deepEqual(codes, [0, 2]);
  assert.equal(out[0][1], "usage: x [--team]\n  flags: --out", "a parsed flag missing from the usage is appended");
  assert.deepEqual(out[1], ["err", "unknown flag --tema — did you mean --team?\n  accepts: --team --out --help\n\nusage: x [--team]\n  flags: --out"]);
});

test("git-run: gitRun never throws, gitMust names the step, gitTry reads '' on failure, gitOut throws", () => {
  const r = gitRun(["rev-parse", "--verify", "-q", "no-such-ref-xyz"]);
  assert.notEqual(r.code, 0);
  assert.throws(() => gitMust(r, "resolve ref"), /resolve ref failed/);
  assert.equal(gitTry(["rev-parse", "--verify", "-q", "no-such-ref-xyz"]), "");
  assert.throws(() => gitOut(["rev-parse", "--verify", "-q", "no-such-ref-xyz"]));
  assert.equal(gitOut(["rev-parse", "HEAD"]).length, 40);
  const fake = gitRun(["status"], { run: () => ({ status: 0, stdout: " M a\n", stderr: "" }), trim: "end" });
  assert.equal(fake.out, " M a", "trim: end keeps porcelain's index column");
});

// Every rulebook-named CLI under tools/ci (cli-help.md's list, AGENTS.md rules 3-13): `--help` answers
// in < 10 s with exit 0, and a typo exits 2 before any work (audit3 T7/T8, audit4 cli-help).
const RULEBOOK = ["deploy", "session-status", "test-bg", "ci-watch", "wait-for", "needs-sync", "sync-pr", "remote-group",
  "verify-change", "pick-tests", "bump-cache", "fleet-tick", "junit-failed", "queue-depth", "verify-live"];
test("rulebook CLIs: --help exits 0 within 10 s; --definitely-not-a-flag exits 2", () => {
  const cwd = new URL("../..", import.meta.url).pathname;
  // 10 s each. sync-pr / remote-group / verify-change pay ~1 s of select-specs import before their
  // argv check; at loadavg 33 that measured 3-4.5 s alone and > 10 s beside seven other test files,
  // so a busy box gets 3x (AGENTS.md rule 8: a timeout on a busy box measures the machine).
  const budget = os.loadavg()[0] > 8 ? 30000 : 10000;
  const run = (file, arg) => spawnSync(process.execPath, [file, arg], { encoding: "utf8", cwd, timeout: budget });
  const bad = [];
  for (const name of RULEBOOK) {
    const file = `tools/ci/${name}.mjs`;
    const h = run(file, "--help");
    if (h.status !== 0 || !/usage/i.test(h.stdout + h.stderr)) bad.push(`${name} --help -> ${h.status ?? h.signal}`);
    const u = run(file, "--definitely-not-a-flag");
    if (u.status !== 2) bad.push(`${name} --definitely-not-a-flag -> ${u.status ?? u.signal}`);
  }
  const r = run("tools/check/ratchets.mjs", "--help");
  if (r.status !== 0 || !/usage/.test(r.stdout)) bad.push(`ratchets --help -> ${r.status ?? r.signal}`);
  assert.deepEqual(bad, []);
});
