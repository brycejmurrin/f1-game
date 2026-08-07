#!/usr/bin/env node
/**
 * test-observed.mjs — "which tests have I never actually seen run?"
 *
 *   node tools/test-observed.mjs            # summary + the never-observed list
 *   node tools/test-observed.mjs --json
 *   node tools/test-observed.mjs --by-file  # counts per spec, worst first
 *
 * WHY. This repo's governing rule is "what a test asserts stays true; what only
 * prose says drifts" — and the corollary found the hard way is that A TEST THAT
 * NEVER RUNS IS PROSE. Three landed this session alone, each of them red and
 * unnoticed for as long as it had existed:
 *
 *   - a Mexico terrain pin asserting a value the tree had moved past
 *   - menu-keyboard's `matches(":modal")`, pinning a <dialog> conversion whose
 *     markup a merge had silently dropped
 *   - audit.spec.js's reverse-crossing lap test, which shipped using the fixed
 *     frame budget its OWN commit message calls wrong, and failed exactly the
 *     way that message predicts
 *
 * None was found by reading. Each was found by finally running the group. The
 * suite is ~40 minutes of software rendering, so "run everything" is not the
 * answer; knowing WHICH tests have never been exercised is.
 *
 * HOW. Spec titles come from the AST (espree), not a regex — nested describes
 * decide a test's full title, and a regex cannot track block scope. Observed
 * titles come from the live-reporter lines in artifacts/logs/*.log, whose format
 * is `<status> <n>/<m> <file> › <describe> › … › <title>`.
 *
 * WHAT THIS DOES NOT MEAN. artifacts/ is gitignored and local, so a title
 * reported here as never-observed means "not in THIS machine's logs" — not
 * "never ran anywhere". CI runs elsewhere and leaves nothing behind here. Treat
 * the output as a worklist ordered by ignorance, not as proof of neglect.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as espree from "espree";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TESTS = path.join(ROOT, "tests");
const LOGS = path.join(ROOT, "artifacts", "logs");

const TEST_FNS = new Set(["test", "sharedTest", "it"]);
// .only/.skip/.fixme still DECLARE a test; .skip is worth knowing about
// separately, since a skipped test is unobserved by intent rather than by
// accident, and conflating the two hides the accidental ones.
const MODIFIERS = new Set(["only", "skip", "fixme", "serial", "parallel"]);

/** Full titles declared by one spec file, as `file › describe › … › title`. */
export function titlesIn(source, file) {
  const ast = espree.parse(source, {
    ecmaVersion: "latest", sourceType: "module", loc: false,
  });
  const out = [];

  // Resolve `test`, `test.describe`, `test.describe.only`, … to a base name
  // plus its trailing modifier, so a `.skip` is recognisable as a declaration.
  const resolve = (node) => {
    let cur = node, mods = [];
    while (cur.type === "MemberExpression" && !cur.computed &&
           cur.property.type === "Identifier") {
      mods.unshift(cur.property.name);
      cur = cur.object;
    }
    if (cur.type !== "Identifier") return null;
    return { base: cur.name, mods };
  };

  const walk = (node, stack) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const n of node) walk(n, stack); return; }

    if (node.type === "CallExpression") {
      const r = resolve(node.callee);
      const title = node.arguments[0];
      const isStr = title && title.type === "Literal" && typeof title.value === "string";
      if (r && TEST_FNS.has(r.base) && isStr && r.mods.every((m) => MODIFIERS.has(m) || m === "describe")) {
        const skipped = r.mods.includes("skip") || r.mods.includes("fixme");
        if (r.mods.includes("describe")) {
          // Recurse with this describe pushed, then skip the default walk so
          // the body is not visited twice under two different stacks.
          const next = stack.concat(title.value);
          for (const a of node.arguments.slice(1)) walk(a, next);
          walk(node.callee, stack);
          return;
        }
        // A test declared at TOP LEVEL gets the file's basename as an implicit
        // suite title in the reporter — "tests/smoke.spec.js › smoke.spec.js › title" —
        // while a test inside a describe does not. Missing this reported every
        // describe-less spec as 100% never-run, including one verified green
        // minutes earlier, which is exactly the kind of confident wrong answer
        // this tool exists to avoid.
        const implicit = stack.length ? stack : [path.basename(file)];
        out.push({ full: [file, ...implicit, title.value].join(" › "), skipped });
      }
    }
    for (const k of Object.keys(node)) {
      if (k === "type" || k === "loc" || k === "range" || k === "parent") continue;
      walk(node[k], stack);
    }
  };

  walk(ast, []);
  return out;
}

/** Every test title any local run log has reported a result for. */
export function observedTitles() {
  const seen = new Map();   // title -> {pass, fail}
  if (!fs.existsSync(LOGS)) return seen;
  for (const f of fs.readdirSync(LOGS).filter((n) => n.endsWith(".log"))) {
    let text = "";
    try { text = fs.readFileSync(path.join(LOGS, f), "utf8"); } catch (_) { continue; }
    for (const line of text.split("\n")) {
      // live-reporter.js: "[hh:mm:ss] + pass   12/64 tests/smoke.spec.js › a › b (3.1s)"
      const m = line.match(/(\+ pass|x FAIL)\s+\d+\/\d+\s+(tests\/\S+\.spec\.js .+?)(?:\s+\(\d+(?:\.\d+)?s\))?\s*$/);
      if (!m) continue;
      const title = m[2].trim();
      const rec = seen.get(title) || { pass: 0, fail: 0 };
      if (m[1] === "+ pass") rec.pass++; else rec.fail++;
      seen.set(title, rec);
    }
  }
  return seen;
}

export function audit() {
  const specs = fs.readdirSync(TESTS).filter((n) => n.endsWith(".spec.js")).sort();
  const seen = observedTitles();
  const rows = [];
  for (const spec of specs) {
    const src = fs.readFileSync(path.join(TESTS, spec), "utf8");
    let declared = [];
    try { declared = titlesIn(src, `tests/${spec}`); }
    catch (e) { rows.push({ file: `tests/${spec}`, parseError: e.message, declared: 0, observed: 0, never: [] }); continue; }
    const never = declared.filter((d) => !d.skipped && !seen.has(d.full)).map((d) => d.full);
    rows.push({
      file: `tests/${spec}`,
      declared: declared.length,
      skipped: declared.filter((d) => d.skipped).length,
      observed: declared.length - never.length,
      never,
    });
  }
  return rows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const rows = audit();
  if (argv.includes("--json")) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }

  const declared = rows.reduce((a, r) => a + (r.declared || 0), 0);
  const never = rows.reduce((a, r) => a + r.never.length, 0);
  const bad = rows.filter((r) => r.parseError);
  console.log(`${declared} Playwright tests declared across ${rows.length} spec files`);
  console.log(`${declared - never} have a recorded result in artifacts/logs/; ${never} do NOT`);
  if (bad.length) console.log(`(${bad.length} file(s) could not be parsed: ${bad.map((b) => b.file).join(", ")})`);

  if (argv.includes("--by-file")) {
    console.log("\nnever-observed, worst first:");
    for (const r of rows.filter((x) => x.never.length).sort((a, b) => b.never.length - a.never.length))
      console.log(`  ${String(r.never.length).padStart(4)} / ${String(r.declared).padEnd(4)} ${r.file}`);
  } else {
    console.log("\nnever observed locally:");
    for (const r of rows) for (const t of r.never) console.log(`  ${t}`);
  }
  console.log("\nartifacts/logs is LOCAL and gitignored — this says what this box has never run,");
  console.log("not what has never run anywhere. It is a worklist ordered by ignorance.");
}
