// A CI step that can run perf-frametime or perf-race-entry must set both STRICT envs (#5334).
// Without them each spec only annotates, so a lane that runs it can never go red on a perf
// regression. This reads every workflow, finds each step that runs Playwright, works out which
// specs it can run (a whole matrix/GROUP variable = any spec; a named group = that group's
// files) and fails if one that can run a perf spec lacks APEX_PERF_*_STRICT=1 in its env
// (workflow, job and step env merged, as Actions merges them). < 1 s, no browser.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WF_DIR = path.join(ROOT, ".github", "workflows");
const GROUPS = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "groups.json"), "utf8")).groups;

export const PERF_SPECS = {
  "tests/specs/perf-frametime.spec.js": "APEX_PERF_FRAMETIME_STRICT",
  "tests/specs/perf-race-entry.spec.js": "APEX_PERF_RACE_ENTRY_STRICT",
};
const ANY = Symbol("any spec");

/** The specs a `run:` script can reach: ANY for a variable spec list or group, the
 *  named group's files, the literal spec paths, or [] for a step that runs no Playwright. */
export function specsOfRun(run) {
  const out = new Set();
  const lines = String(run || "").split("\n").map((l) => l.replace(/(^|\s)#.*$/, ""));
  for (const line of lines) {
    // npm test -- $SPECS / npm run "test:${GROUP}": the plan or the rota picks the spec.
    if (/\bnpm (?:test|run test)\b[^\n]*\$\{?SPECS\b/.test(line)) return ANY;
    if (/\bnpm run "?test:\$\{?GROUP\b/.test(line)) return ANY;
    for (const m of line.matchAll(/\bnpm run "?(test:[\w-]+)"?/g)) {
      const g = GROUPS[m[1]];
      if (!g) continue;
      for (const f of g.files || []) out.add(f);
    }
    if (/\b(?:npm test|run-playwright\.mjs|playwright test)\b/.test(line)) {
      for (const m of line.matchAll(/tests\/specs\/[\w.*-]+\.spec\.js/g)) out.add(m[0]);
    }
  }
  return [...out];
}

function* playwrightSteps() {
  for (const file of fs.readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f)).sort()) {
    const wf = parseYaml(fs.readFileSync(path.join(WF_DIR, file), "utf8")) || {};
    for (const [jobId, job] of Object.entries(wf.jobs || {})) {
      for (const step of job.steps || []) {
        if (!step.run) continue;
        const specs = specsOfRun(step.run);
        if (specs !== ANY && !specs.length) continue;
        yield { file, jobId, name: step.name || step.run.slice(0, 40), specs, env: { ...wf.env, ...job.env, ...step.env } };
      }
    }
  }
}

test("every CI step that can run a perf spec sets its STRICT env to 1", () => {
  const missing = [];
  let checked = 0;
  for (const s of playwrightSteps()) {
    const need = Object.entries(PERF_SPECS).filter(([spec]) => s.specs === ANY || s.specs.includes(spec));
    if (!need.length) continue;
    checked++;
    for (const [spec, key] of need) {
      if (String(s.env[key]) !== "1") missing.push(`${s.file} ${s.jobId} "${s.name}": runs ${spec} without ${key}=1`);
    }
  }
  assert.deepEqual(missing, [], "a lane that runs a perf spec soft can never fail on it");
  // The selected legs, the nightly rota and the SwiftShader dispatch: if this drops, the parser went blind.
  assert.ok(checked >= 3, `expected >= 3 steps that can run the perf specs, found ${checked}`);
});

test("specsOfRun reads plan, rota, named-group and literal-path steps", () => {
  assert.equal(specsOfRun('set -f\nnpm test -- $SPECS --retries="$RETRIES"'), ANY);
  assert.equal(specsOfRun('npm run "test:${GROUP:-tiny}" -- --shard=1/4'), ANY);
  assert.ok(specsOfRun("npm run test:perf-race-entry").includes("tests/specs/perf-race-entry.spec.js"));
  assert.deepEqual(specsOfRun("node tools/ci/run-playwright.mjs tests/specs/perf-frametime.spec.js"), ["tests/specs/perf-frametime.spec.js"]);
  assert.deepEqual(specsOfRun("echo tests/specs/perf-frametime.spec.js"), []);
  assert.deepEqual(specsOfRun("# npm test -- $SPECS"), []);
});

test("both specs read the STRICT env as exactly '1'", async () => {
  for (const [helper, key] of [["perf-frametime.mjs", "APEX_PERF_FRAMETIME_STRICT"], ["perf-race-entry.mjs", "APEX_PERF_RACE_ENTRY_STRICT"]]) {
    const src = fs.readFileSync(path.join(ROOT, "tests", "helpers", helper), "utf8");
    assert.match(src, new RegExp(`process\\.env\\.${key} === "1"`), `${helper} must read ${key} === "1"`);
  }
});
