// Reports which Playwright specs CI executes before deploy. Advisory only —
// not a gate (`artifacts/` is gitignored, so a never-observed gate would
// fail on every CI run). See docs/archive/research/CAMPAIGN-2026-08.md.
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

const ungated = ALL_SPECS.filter((s) => !executed.has(s));
const report = {
  specsOnDisk: ALL_SPECS.length,
  specsExecutedByCI: executed.size,
  specsGatedByNothing: ungated.length,
  executed: [...executed].sort(),
  ungated,
  viaGroup, viaPath,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`CI executes ${report.specsExecutedByCI} of ${report.specsOnDisk} Playwright specs ` +
    `(${((report.specsExecutedByCI / report.specsOnDisk) * 100).toFixed(1)} %).`);
  console.log(`${report.specsGatedByNothing} specs are gated by NOTHING before deploy.\n`);
  for (const g of viaGroup) if (g.specs.length) console.log(`  ${g.group}: ${g.specs.join(", ")}`);
  for (const p of viaPath) console.log(`  by path: ${p.specs.join(", ")}`);
  console.log("\nThis is a REPORT, not a gate. The full suite is ~40 minutes of");
  console.log("SwiftShader and deliberately does not run here — see the ci.yml header.");
  console.log("The number matters because a gate nobody looks at drifts silently:");
  console.log("physics-characterization was in NO job for 175 commits of physics work.");
}

export { report, ALL_SPECS, expand, groupSpecs };
