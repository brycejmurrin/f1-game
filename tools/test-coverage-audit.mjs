#!/usr/bin/env node
// Coverage guard: every top-level browser spec and Node tool test must be named
// @doc Coverage guard (`npm run test:audit`): every spec / unit file must be reachable from a topical `test:<group>` script.
// @section runner
// explicitly by a topical test:* script. Catch-all/project partition scripts do
// not demonstrate that a spec belongs to an intentional verification group.
//
// ".test.cjs" is in the glob because leaving it out is how a test goes missing:
// shared-track-foundation-characterization.test.cjs sat in tests/ for months
// pinning five real behaviours and was run by nothing at all.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLING_FAST_FILES } from "./tooling-fast.mjs";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");

function globRegex(pattern) {
  return new RegExp(`^${pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")}$`);
}

export function auditCoverage(testFiles, scripts) {
  const covered = new Set();
  for (const [name, command] of Object.entries(scripts)) {
    if (!name.startsWith("test:") || name === "test:headless" || name === "test:render") continue;
    // test:tooling-fast is `node tools/tooling-fast.mjs` — the file list lives
    // on TOOLING_FAST_FILES, not as inline paths in package.json.
    if (name === "test:tooling-fast" || /tooling-fast\.mjs\b/.test(command)) {
      for (const token of TOOLING_FAST_FILES) {
        const pattern = path.basename(token);
        const regex = globRegex(pattern);
        testFiles.filter((file) => regex.test(file)).forEach((file) => covered.add(file));
      }
    }
    for (const token of command.match(/tests\/[^\s"']+\.(?:spec\.js|test\.(?:mjs|cjs))/g) || []) {
      const pattern = path.basename(token);
      const regex = globRegex(pattern);
      testFiles.filter((file) => regex.test(file)).forEach((file) => covered.add(file));
    }
  }
  return {
    covered,
    orphans: testFiles.filter((file) => !covered.has(file)),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  // specs/ and unit/ since the tests/ split — auditCoverage matches on
  // BASENAME, so discovery is the only layout-aware line. The root readdir is
  // kept so a stray suite dropped at tests/ root still gets audited rather
  // than silently escaping the taxonomy.
  const testFiles = ["", "specs", "unit"]
    .flatMap((d) => fs.readdirSync(path.join(ROOT, "tests", d)))
    .filter((file) => /\.(spec\.js|test\.(mjs|cjs))$/.test(file))
    .sort();
  const { orphans } = auditCoverage(testFiles, pkg.scripts);
  if (orphans.length) {
    console.error(`✗ ${orphans.length} test file(s) in NO topical test:* group:`);
    orphans.forEach((file) => console.error(`    tests/${file}`));
    process.exitCode = 1;
  } else {
    console.log(`✓ all ${testFiles.length} test files are covered by topical test:* groups`);
  }
}
