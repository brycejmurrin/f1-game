#!/usr/bin/env node
// Coverage guard: every tests/*.spec.js must be reachable from at least one
// `test:<group>` npm script, so `npm run test:<group>` before a push can't
// silently skip a spec (53 of 90 specs were ungrouped before the cleanup).
// Run: node tools/test-coverage-audit.mjs   (exit 1 if any spec is orphaned)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

// All spec files under tests/ (excluding testIgnore'd dirs: galleries/inspect/blank-scan).
const specs = execSync("ls tests/*.spec.js", { cwd: ROOT })
  .toString().trim().split("\n").map((s) => s.replace("tests/", ""));

// Collect the glob patterns every test:* script references, expand each against
// the filesystem, and union the matched basenames.
const covered = new Set();
for (const [name, cmd] of Object.entries(pkg.scripts)) {
  if (!name.startsWith("test:")) continue;
  for (const g of cmd.match(/tests\/[^\s]+\.spec\.js/g) || []) {
    try {
      execSync(`ls ${g}`, { cwd: ROOT }).toString().trim().split("\n")
        .forEach((f) => f && covered.add(path.basename(f)));
    } catch (_) { /* glob matched nothing — ignore */ }
  }
  // Project-based scripts (--project=headless/render) cover their whole partition.
  if (/--project=(headless|render)/.test(cmd)) specs.forEach((s) => covered.add(s));
}

const orphans = specs.filter((s) => !covered.has(s));
if (orphans.length) {
  console.error(`✗ ${orphans.length} spec(s) in NO test:* group (add them to a group):`);
  for (const o of orphans) console.error(`    tests/${o}`);
  process.exit(1);
}
console.log(`✓ all ${specs.length} specs are covered by at least one test:* group`);
