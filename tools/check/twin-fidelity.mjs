/**
 * @doc Prove a VM twin catches what the browser copy catches — by breaking the
 * code on purpose and checking the twin notices.
 *
 * THE PROBLEM THIS SOLVES. `tools/ci/twinned-specs.mjs` checks that a spec and
 * its twin declare the same number of tests. For a HAND-PORTED twin that is a
 * real (if weak) signal. For an ADAPTED spec — the same file re-run under
 * `APEX_VM_PAGE=1` against tools/lib/game-vm.cjs — it is vacuous: the twin IS
 * the spec, so the counts are equal by construction and prove nothing about
 * whether the VM reproduces the browser's behaviour. Measured evidence that
 * this matters: `understeer-cue.spec.js` is portable by every static measure
 * and still goes 0/7, and `physics-fixes.spec.js` passed 2/2 under the adapter
 * on a day its BROWSER copy was red (docs/notes/DEFECT-LEDGER.md, 2026-09-16).
 *
 * SO: mutation testing, asymmetrically. Each row of tests/data/mutants.json
 * breaks ONE mechanism and names which tests must go red. A mutant that
 * reddens everything proves only that the suite runs; a mutant the twin
 * sleeps through is a fidelity hole, and this tool fails on it.
 *
 * Usage:  node tools/check/twin-fidelity.mjs             # every mutant
 *         node tools/check/twin-fidelity.mjs m-wall-scrub-flat
 *         node tools/check/twin-fidelity.mjs --list
 *         node tools/check/twin-fidelity.mjs --dry       # patch/restore only
 *         node tools/check/twin-fidelity.mjs --help
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CliArgError, makeFlags, runCli } from "../lib/cli-args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const MUTANTS = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/data/mutants.json"), "utf8")).mutants;

/** Does every mutant's needle still exist, exactly once, in its file? */
export function needleReport() {
  return MUTANTS.map((m) => {
    const abs = path.join(ROOT, m.file);
    if (!fs.existsSync(abs)) return { id: m.id, ok: false, why: `missing file ${m.file}` };
    const src = fs.readFileSync(abs, "utf8");
    const n = src.split(m.find).length - 1;
    return n === 1 ? { id: m.id, ok: true, n }
                   : { id: m.id, ok: false, n, why: n === 0 ? `needle gone from ${m.file}` : `needle is ambiguous (${n}x) in ${m.file}` };
  });
}

/** TAP "ok/not ok <n> - <name>" -> Map(name -> passed). */
export function parseTap(out) {
  const res = new Map();
  for (const line of out.split("\n")) {
    const m = /^(not ok|ok)\s+\d+\s+-\s+(.+?)\s*$/.exec(line.trim());
    if (m) res.set(m[2], m[1] === "ok");
  }
  return res;
}

function withMutant(m, fn) {
  const abs = path.join(ROOT, m.file);
  const original = fs.readFileSync(abs, "utf8");
  try {
    fs.writeFileSync(abs, original.replace(m.find, m.replace));
    return fn();
  } finally {
    fs.writeFileSync(abs, original);     // ALWAYS restore, including on a throw
  }
}

function runSpec(spec) {
  const r = spawnSync(process.execPath, ["--test", spec],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, APEX_VM_PAGE: "1" }, timeout: 300_000 });
  return parseTap(`${r.stdout || ""}\n${r.stderr || ""}`);
}

export function verdictFor(m, results) {
  const rows = [];
  for (const [name, mustFail] of Object.entries(m.catchers)) {
    const passed = results.get(name);
    if (passed === undefined) { rows.push({ name, ok: false, why: "test not found in the twin's output" }); continue; }
    // mustFail: the mutant broke what this test guards, so a PASS is a hole.
    rows.push(mustFail ? { name, ok: !passed, why: passed ? "the twin SLEPT THROUGH this mutant" : "caught" }
                       : { name, ok: passed, why: passed ? "correctly unaffected" : "collateral — this mutant should not touch it" });
  }
  return rows;
}

/** Resolve the entire request before reading needles or changing any source. */
export function planFidelity(args) {
  if (args.includes("--help") || args.includes("-h")) {
    return { mode: "help", run: [] };
  }
  const known = ["--list", "--dry", "--help"];
  const flags = makeFlags(args, known);
  const invalid = args.find((a) => a.startsWith("-") && !known.includes(a));
  if (invalid) throw new CliArgError(`unknown flag ${invalid}`);
  if (flags.has("--list") && flags.has("--dry")) throw new CliArgError("--list and --dry cannot be combined");
  const only = args.filter((a) => !a.startsWith("-"));
  const unknown = only.filter((id) => !MUTANTS.some((m) => m.id === id));
  if (unknown.length) throw new CliArgError(`unknown mutant id: ${unknown.map((id) => JSON.stringify(id)).join(", ")}\n  valid ids: ${MUTANTS.map((m) => m.id).join(" ")}`);
  return { mode: flags.has("--list") ? "list" : flags.has("--dry") ? "dry" : "run",
    run: only.length ? MUTANTS.filter((m) => only.includes(m.id)) : MUTANTS };
}

export function runFidelity(args, { needles = needleReport, mutate = withMutant, spec = runSpec } = {}) {
  const plan = planFidelity(args);
  if (plan.mode === "help") {
    console.log("usage: node tools/check/twin-fidelity.mjs [--list|--dry|--help] [mutant-id…]");
    console.log("  (no args)   run every mutant against its VM twin");
    console.log("  --list      print id / file / spec");
    console.log("  --dry       verify needles only (no patch, no specs)");
    return 0;
  }
  if (plan.mode === "list") {
    for (const m of MUTANTS) console.log(`${m.id}\t${m.file}\t${m.spec}`);
    return 0;
  }
  const bad = needles().filter((r) => !r.ok);
  if (bad.length) {
    for (const b of bad) console.error(`NEEDLE ${b.id}: ${b.why}`);
    return 2;
  }
  if (plan.mode === "dry") { console.log(`needles ok for ${MUTANTS.length} mutants`); return 0; }
  const { run } = plan;
  let failed = 0;
  for (const m of run) {
    const rows = mutate(m, () => verdictFor(m, spec(m.spec)));
    const ok = rows.every((r) => r.ok);
    console.log(`${ok ? "PASS" : "FAIL"} ${m.id}`);
    for (const r of rows) console.log(`   ${r.ok ? "ok  " : "FAIL"} ${r.why.padEnd(34)} ${r.name}`);
    if (!ok) failed++;
  }
  console.log(`twin-fidelity: ${run.length - failed}/${run.length} mutants caught as declared`);
  return failed ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(async () => { process.exitCode = runFidelity(process.argv.slice(2)); });
}
