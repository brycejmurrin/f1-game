// Reports CI's two different browser-test contracts: fixed specs that run in
// @doc What does the deploy gate execute? Resolves every `npm run test:*` / by-path invocation in `ci.yml` against the specs.
// @section runner
// the deploy workflow, and the blocking change-aware selection on pushes/PRs.
// A dynamic gate cannot honestly claim every non-fixed spec, so report its
// event/base/fail-closed contract separately instead of calling those specs
// "gated by nothing". See docs/archive/research/CAMPAIGN-2026-08.md.
//
//   node tools/ci-coverage.mjs
//   node tools/ci-coverage.mjs --json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const ALL_SPECS = fs.readdirSync(path.join(ROOT, "tests", "specs"))
  .filter((f) => f.endsWith(".spec.js")).map((f) => `tests/specs/${f}`).sort();

// A spec token may be a literal path or a single-star glob (tests/specs/parts-*.spec.js).
function expand(token) {
  if (!token.startsWith("tests/") || !token.endsWith(".spec.js")) return [];
  if (!token.includes("*")) return ALL_SPECS.includes(token) ? [token] : [];
  const rx = new RegExp("^" + token.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$");
  return ALL_SPECS.filter((s) => rx.test(s));
}

const scripts = JSON.parse(read("package.json")).scripts || {};
// A group script resolves to the spec tokens on its command line. Groups that
// name no spec (test:render / test:headless drive whole PROJECTS) resolve to
// nothing here and are reported as such rather than silently counted.
const groupSpecs = (name) => {
  const cmd = scripts[name];
  if (!cmd) return null;
  return [...new Set(cmd.split(/\s+/).flatMap(expand))];
};

// What ci.yml runs, in the order it runs it.
const ci = read(".github/workflows/ci.yml");
const executed = new Set();
const viaGroup = [];
for (const m of ci.matchAll(/run:\s*npm run (test:[\w-]+)/g)) {
  const specs = groupSpecs(m[1]);
  if (specs === null) continue;
  viaGroup.push({ group: m[1], specs });
  specs.forEach((s) => executed.add(s));
}
const viaPath = [];
for (const m of ci.matchAll(/run:\s*(?:npm test --|npx playwright test)\s+([^\n]+)/g)) {
  const specs = m[1].split(/\s+/).flatMap(expand);
  if (!specs.length) continue;
  viaPath.push({ where: m[1].trim().slice(0, 60), specs });
  specs.forEach((s) => executed.add(s));
}

const outsideFixedGates = ALL_SPECS.filter((s) => !executed.has(s));
const selectedAt = ci.indexOf("\n  selected:\n");
const selectedJob = selectedAt >= 0 ? ci.slice(selectedAt) : "";
const selectedIf = selectedJob.match(/^    if:\s*(.+)$/m)?.[1] || "";
const selectionGate = {
  present: Boolean(selectedJob),
  blocking: Boolean(selectedJob) && !/^    continue-on-error:\s*true\s*$/m.test(selectedJob),
  onPush: selectedIf.includes("github.event_name == 'push'"),
  onPullRequest: selectedIf.includes("github.event_name == 'pull_request'"),
  onWorkflowCall: selectedIf.includes("github.event_name == 'workflow_call'"),
  usesPullRequestBase: /PR_BASE:\s*\$\{\{ github\.event\.pull_request\.base\.sha \}\}/.test(selectedJob),
  failsClosedOnInvalidBase: /fail\(\).*SELECTED GATE FAILED CLOSED/.test(selectedJob)
    && /no valid comparison base/.test(selectedJob)
    && /comparison base .* is unreachable/.test(selectedJob),
  surfacesBudgetSkips: /EXCLUDED \(declares/.test(selectedJob)
    && /SKIPPED \(over budget\)/.test(selectedJob),
};
const report = {
  specsOnDisk: ALL_SPECS.length,
  specsInFixedGates: executed.size,
  specsOutsideFixedGates: outsideFixedGates.length,
  executed: [...executed].sort(),
  outsideFixedGates,
  selectionGate,
  viaGroup, viaPath,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Deploy CI's fixed browser gates execute ${report.specsInFixedGates} of ` +
    `${report.specsOnDisk} Playwright specs ` +
    `(${((report.specsInFixedGates / report.specsOnDisk) * 100).toFixed(1)} %).`);
  console.log(`${report.specsOutsideFixedGates} specs are outside those fixed gates.\n`);
  for (const g of viaGroup) if (g.specs.length) console.log(`  ${g.group}: ${g.specs.join(", ")}`);
  for (const p of viaPath) console.log(`  by path: ${p.specs.join(", ")}`);
  const s = report.selectionGate;
  console.log(`\nChange-aware selected gate: ${s.blocking ? "BLOCKING" : "NON-BLOCKING"}; ` +
    `push=${s.onPush}, pull_request=${s.onPullRequest}, workflow_call=${s.onWorkflowCall}.`);
  console.log(`PR base=${s.usesPullRequestBase ? "explicit" : "missing"}; ` +
    `invalid base=${s.failsClosedOnInvalidBase ? "fail-closed" : "fail-open"}; ` +
    `budget skips=${s.surfacesBudgetSkips ? "surfaced" : "silent"}.`);
  console.log("Exact selected coverage varies by diff and budget; outside-budget specs are named,");
  console.log("not claimed as executed. The full suite remains a local, change-scaled run.");
}

export { report, ALL_SPECS, expand, groupSpecs };
