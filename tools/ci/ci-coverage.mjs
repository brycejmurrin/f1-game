// Reports CI's two different browser-test contracts: fixed specs that run in
// @doc What does the deploy gate execute? Resolves every `npm run test:*` / by-path invocation in `ci.yml` against the specs.
// @section runner
// the deploy workflow, and the blocking change-aware selection on pushes/PRs.
// A dynamic gate cannot honestly claim every non-fixed spec, so report its
// event/base/fail-closed contract separately instead of calling those specs
// "gated by nothing". See docs/archive/research/CAMPAIGN-2026-08.md.
//
//   node tools/ci/ci-coverage.mjs
//   node tools/ci/ci-coverage.mjs --json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
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

// What ci.yml runs, in the order it runs it — PER JOB, because not every job
// in the file is in the deploy gate. pages.yml calls ci.yml as a reusable
// workflow and `needs: ci` consumes the AGGREGATE of every job that ran, so a
// job is outside the gate only by being SKIPPED on the Pages call. The file's
// convention for that is a job-level `if:` on `!inputs.concurrency_key` (the
// input pages.yml always forwards); a job that `needs:` such a job is skipped
// with it. Specs those jobs run are reported under their own heading, never
// counted as deploy-gate coverage — a macOS renderer job that runs on branch
// pushes is real coverage, but not of what ships.
const ci = read(".github/workflows/ci.yml");
const jobsAt = ci.search(/^jobs:\s*$/m);
const jobsText = jobsAt >= 0 ? ci.slice(jobsAt) : "";
const jobs = [];
{
  const heads = [...jobsText.matchAll(/^  ([a-z][\w-]*):\s*$/gm)];
  heads.forEach((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index : jobsText.length;
    const body = jobsText.slice(h.index, end);
    jobs.push({
      name: h[1],
      body,
      start: h.index,
      end,
      runsOn: body.match(/^    runs-on:\s*(.+)$/m)?.[1]?.trim() || "",
      ifLine: body.match(/^    if:\s*(.+)$/m)?.[1]?.trim() || "",
      needs: (body.match(/^    needs:\s*(.+)$/m)?.[1] || "").replace(/[[\]]/g, "").split(/,\s*/).map((s) => s.trim()).filter(Boolean),
    });
  });
  const excluded = new Set();
  for (const j of jobs) if (/!inputs\.concurrency_key/.test(j.ifLine)) excluded.add(j.name);
  // one pass is enough: a `needs:` chain is at most one deep here, and a longer
  // one would be a design change worth seeing in this report
  for (const j of jobs) if (j.needs.some((n) => excluded.has(n))) excluded.add(j.name);
  for (const j of jobs) j.deployGate = !excluded.has(j.name);
}
const jobOf = (index) => jobs.find((j) => index >= jobsAt + j.start && index < jobsAt + j.end);

const executed = new Set();
const viaGroup = [];
for (const m of ci.matchAll(/run:\s*npm run (test:[\w-]+)/g)) {
  const specs = groupSpecs(m[1]);
  if (specs === null) continue;
  const job = jobOf(m.index);
  const entry = { group: m[1], specs, job: job?.name || null, deployGate: job ? job.deployGate : true };
  viaGroup.push(entry);
  if (entry.deployGate) specs.forEach((s) => executed.add(s));
}
const viaPath = [];
for (const m of ci.matchAll(/run:\s*(?:npm test --|npx playwright test)\s+([^\n]+)/g)) {
  const specs = m[1].split(/\s+/).flatMap(expand);
  if (!specs.length) continue;
  const job = jobOf(m.index);
  const entry = { where: m[1].trim().slice(0, 60), specs, job: job?.name || null, deployGate: job ? job.deployGate : true };
  viaPath.push(entry);
  if (entry.deployGate) specs.forEach((s) => executed.add(s));
}

// The renderer job: the one browser job on a hardware adapter, and the one
// outside the gate by design (its comment in ci.yml says why). Reported as its
// own contract so the flag rule the real GPU depends on is machine-checked.
const rendererJob = jobs.find((j) => j.name === "renderer-macos");
const rendererRun = rendererJob?.body.match(/run:\s*npm run (test:[\w-]+)([^\n]*)/) || null;
const rendererGate = {
  present: Boolean(rendererJob),
  runsOn: rendererJob?.runsOn || "",
  deployGate: rendererJob ? rendererJob.deployGate : false,
  group: rendererRun?.[1] || "",
  specs: rendererRun ? (groupSpecs(rendererRun[1]) || []) : [],
  config: rendererRun?.[2].match(/--config=(\S+)/)?.[1] || "",
  // the trap the census documented: this flag turns the Metal run into SwiftShader
  vulkanAngle: /--use-angle=vulkan/.test(rendererJob?.body.replace(/^\s*#.*$/gm, "") || ""),
  censusGated: /gpu-census\.mjs/.test(rendererJob?.body || "") && /anyHardware !== true/.test(rendererJob?.body || ""),
};

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
  rendererGate,
  jobs: jobs.map((j) => ({ name: j.name, runsOn: j.runsOn, deployGate: j.deployGate })),
  viaGroup, viaPath,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Deploy CI's fixed browser gates execute ${report.specsInFixedGates} of ` +
    `${report.specsOnDisk} Playwright specs ` +
    `(${((report.specsInFixedGates / report.specsOnDisk) * 100).toFixed(1)} %).`);
  console.log(`${report.specsOutsideFixedGates} specs are outside those fixed gates.\n`);
  for (const g of viaGroup) if (g.specs.length && g.deployGate) console.log(`  ${g.group} (${g.job}): ${g.specs.join(", ")}`);
  for (const p of viaPath) if (p.deployGate) console.log(`  by path (${p.job}): ${p.specs.join(", ")}`);
  const r = report.rendererGate;
  console.log(`\nRenderer job (${r.present ? r.runsOn : "ABSENT"}): ${r.present ? (r.deployGate ? "IN" : "OUTSIDE") + " the deploy gate" : ""}` +
    `${r.present ? `; ${r.group} = ${r.specs.length} specs via ${r.config || "the default config"}; census-gated=${r.censusGated}; --use-angle=vulkan=${r.vulkanAngle}` : ""}`);
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
