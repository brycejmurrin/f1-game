// validation-cli.mjs — shared by the tests/unit/validation-cli-*.test.mjs files
// (#3043 T5-30): the repo root, a node CLI runner, and a self-cleaning fixture
// dir under artifacts/tmp.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const cli = (file, args = [], env = {}) => spawnSync(process.execPath, [file, ...args], {
  cwd: ROOT, encoding: "utf8", timeout: 10000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, ...env },
});
export const fixture = (t) => {
  const parent = path.join(ROOT, "artifacts/tmp");
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, "validation-cli-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
