/* cli-args.test.mjs — tools/lib/cli-args.mjs rejects what it does not recognise.
 * The original defect (2026-09-09): a typo or a space-form value was silently
 * dropped and a measurement tool printed a full table for the DEFAULT argument.
 * Pure node, no browser, < 0.2 s. */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { makeFlags, parseFlags, exitIfHelp, CliArgError } from "../../tools/lib/cli-args.mjs";

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
