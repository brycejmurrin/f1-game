#!/usr/bin/env node
/**
 * @doc Hand-back scope check: lists files a track-surveyor branch changed outside its circuit pair (exit 1 if any).
 * @skill survey-track
 * surveyor-scope.mjs — usage: node tools/track/surveyor-scope.mjs <circuit-id> <base-sha> <surveyor-branch>
 *
 * Allowed: js/circuits/<id>.js, js/circuits/scenery/<id>.js, scratch/, artifacts/.
 * Anything else is rejected (the hook cannot bind the circuit id).
 */
import { execFileSync } from "node:child_process";

const [id, base, branch] = process.argv.slice(2);
if (!id || !base || !branch || !/^[a-z0-9-]+$/.test(id)) {
  console.error("usage: surveyor-scope.mjs <circuit-id> <base-sha> <surveyor-branch>");
  process.exit(2);
}
const files = execFileSync("git", ["diff", "--name-only", `${base}..${branch}`], { encoding: "utf8" })
  .split("\n").filter(Boolean);
const allowed = (f) => f === `js/circuits/${id}.js` || f === `js/circuits/scenery/${id}.js` ||
  f.startsWith("scratch/") || f.startsWith("artifacts/");
const bad = files.filter((f) => !allowed(f));
for (const f of bad) console.log(`REJECT ${f}`);
console.log(`= scope ${bad.length ? "violation" : "ok"} (${files.length} files, ${bad.length} outside ${id})`);
process.exit(bad.length ? 1 : 0);
