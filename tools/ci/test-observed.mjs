#!/usr/bin/env node
/**
 * @doc Which tests have I never seen run? Declared spec titles (espree) vs every title any `artifacts/logs/` run reported.
 * @section runner
 * test-observed.mjs — "which tests have I never actually seen run?"
 *
 *   node tools/ci/test-observed.mjs            # summary + the never-observed list
 *   node tools/ci/test-observed.mjs --json
 *   node tools/ci/test-observed.mjs --by-file  # counts per spec, worst first
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
import { emitJsonAndExit } from "../lib/emit-json.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TESTS = path.join(ROOT, "tests");
const LOGS = path.join(ROOT, "artifacts", "logs");

const TEST_FNS = new Set(["test", "sharedTest", "it"]);
// .only/.skip/.fixme still DECLARE a test; .skip is worth knowing about
// separately, since a skipped test is unobserved by intent rather than by
// accident, and conflating the two hides the accidental ones.
const MODIFIERS = new Set(["only", "skip", "fixme", "serial", "parallel"]);

/** Same shape as tests/helpers/live-reporter.js `name()` (file + last two titlePath segments). */
export function reporterTitle(file, titleParts) {
  const tail = titleParts.slice(-2).join(" › ");
  return `${file} › ${tail}`;
}

/** Parse one live-reporter `+ pass` / `x FAIL` line; null when it is not a final result. */
export function parseLiveReporterLine(raw) {
  // GHA / copied logs prefix ISO timestamps before `[hh:mm:ss]`; test-bg does not.
  const line = String(raw).replace(/^[^\[]*/, "").trimEnd();
  // Greedy title capture: test names may contain `()` (e.g. jump()); only the
  // trailing `(12.3s)` duration is stripped (same pitfall as spec-timings).
  const m = /^\[\d{2}:\d{2}:\d{2}\]\s+(?:\+ pass|x FAIL)\s+\d+\/\d+\s+(tests\/\S+\.spec\.js)\s+›\s+(.+)\s+\((\d+(?:\.\d+)?)s\)\s*$/.exec(line);
  if (!m) return null;
  const spec = m[1].replace(/^tests\/(?=[^/]+\.spec\.js$)/, "tests/specs/");
  return `${spec} › ${m[2].trim()}`;
}

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
      const lit = title && title.type === "Literal" && typeof title.value === "string";
      // A TEMPLATE title is the norm for loop-generated tests — 16 specs use
      // `test(\`${id}: …\`)` inside a for-of over a track list, and one of them
      // (elevation-tracks) declares 5 static tests and 42 dynamic ones. Dropping
      // them silently undercounts the denominator AND reports the spec as fully
      // observed, which is the confidently-wrong answer this tool exists to
      // avoid: `circuit` read as 0/20 while the group actually runs 64.
      const tpl = title && title.type === "TemplateLiteral";
      const isStr = lit || tpl;
      if (r && TEST_FNS.has(r.base) && isStr && r.mods.every((m) => MODIFIERS.has(m) || m === "describe")) {
        const skipped = r.mods.includes("skip") || r.mods.includes("fixme");
        // A template's runtime value is unknowable statically, so a template
        // title becomes a PATTERN: its literal chunks, with each `${…}` allowed
        // to be anything. That is enough to recognise the titles it produces in
        // a log without pretending to evaluate the loop.
        const text = lit ? title.value : title.quasis.map((q) => q.value.cooked).join("");
        if (r.mods.includes("describe")) {
          // Recurse with this describe pushed, then skip the default walk so
          // the body is not visited twice under two different stacks.
          const next = stack.concat(text);
          for (const a of node.arguments.slice(1)) walk(a, next);
          walk(node.callee, stack);
          return;
        }
        // A test declared at TOP LEVEL gets an implicit suite title in the
        // reporter — its path RELATIVE TO testDir ("./tests", playwright.config),
        // "tests/specs/smoke.spec.js › specs/smoke.spec.js › title" — while a
        // test inside a describe does not. Missing this reported every
        // describe-less spec as 100% never-run, including one verified green
        // minutes earlier, which is exactly the kind of confident wrong answer
        // this tool exists to avoid. (It was the basename until testDir moved
        // from tests/specs to tests; the reporter has printed "specs/…" since.)
        const implicit = stack.length ? stack : [path.relative("tests", file).split(path.sep).join("/")];
        const titleParts = stack.length ? [...stack, lit ? title.value : ""] : [...implicit, lit ? title.value : ""];
        const reporter = lit ? reporterTitle(file, titleParts) : null;
        if (lit) {
          out.push({
            full: [file, ...implicit, title.value].join(" › "),
            reporter,
            skipped,
            dynamic: false,
          });
        } else {
          // `${…}` becomes `.+?` and everything else is escaped literally, so
          // the pattern recognises every title the loop can emit without
          // pretending to know the loop's values. ONE declaration stands for the
          // N tests it generates; `matches` below reports how many were seen.
          const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const body = title.quasis.map((q) => esc(q.value.cooked)).join(".+?");
          const lastSuite = stack.length ? stack[stack.length - 1] : implicit[0];
          const prefix = esc(`${file} › ${lastSuite} › `);
          out.push({
            full: [file, ...implicit, title.quasis.map((q) => q.value.cooked).join("${…}")].join(" › "),
            reporter: `${file} › ${lastSuite} › ${title.quasis.map((q) => q.value.cooked).join("${…}")}`,
            pattern: new RegExp("^" + prefix + body + "$"),
            skipped, dynamic: true,
          });
        }
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
      const stripped = String(line).replace(/^[^\[]*/, "");
      const title = parseLiveReporterLine(line);
      if (!title) continue;
      const pass = /^\[\d{2}:\d{2}:\d{2}\]\s+\+ pass/.test(stripped);
      const rec = seen.get(title) || { pass: 0, fail: 0 };
      if (pass) rec.pass++; else rec.fail++;
      seen.set(title, rec);
    }
  }
  return seen;
}

export function audit() {
  const SPECS = path.join(TESTS, "specs");
  const specs = fs.readdirSync(SPECS).filter((n) => n.endsWith(".spec.js")).sort();
  const seen = observedTitles();
  const rows = [];
  for (const spec of specs) {
    const src = fs.readFileSync(path.join(SPECS, spec), "utf8");
    let declared = [];
    try { declared = titlesIn(src, `tests/specs/${spec}`); }
    catch (e) { rows.push({ file: `tests/specs/${spec}`, parseError: e.message, declared: 0, observed: 0, never: [] }); continue; }
    const titles = [...seen.keys()];
    const seenKey = (d) => d.reporter || d.full;
    const never = declared
      .filter((d) => !d.skipped)
      .filter((d) => (d.dynamic ? !titles.some((t) => d.pattern.test(t)) : !seen.has(seenKey(d))))
      .map((d) => d.full);
    // A dynamic declaration stands for however many tests its loop emits, so
    // count what was actually SEEN for it rather than 1 — otherwise a spec that
    // ran 40 of its 42 generated tests reads as fully covered.
    const emitted = declared.filter((d) => d.dynamic)
      .reduce((a, d) => a + titles.filter((t) => d.pattern.test(t)).length, 0);
    rows.push({
      // tests/specs/, not tests/ — the parseError branch above already writes the
      // real path, so --by-file printed a worklist of paths that do not exist.
      file: `tests/specs/${spec}`,
      declared: declared.length,
      dynamic: declared.filter((d) => d.dynamic).length,
      emitted,                                   // runtime tests seen from those
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
  if (argv.includes("--json")) emitJsonAndExit(JSON.stringify(rows, null, 2));

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
