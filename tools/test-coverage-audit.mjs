#!/usr/bin/env node
// Coverage guard: every top-level browser spec and Node tool test must be named
// explicitly by a topical test:* script. Catch-all/project partition scripts do
// not demonstrate that a spec belongs to an intentional verification group.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
    for (const token of command.match(/tests\/[^\s"']+\.(?:spec\.js|test\.mjs)/g) || []) {
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
  const testFiles = fs.readdirSync(path.join(ROOT, "tests"))
    .filter((file) => file.endsWith(".spec.js") || file.endsWith(".test.mjs"))
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
