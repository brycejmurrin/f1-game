/* One temp-dir helper for unit tests: dirs live under <repo>/artifacts/tmp (the
 * "regenerable output goes in artifacts/, never /tmp" rule) and are removed when
 * the test process exits, so a run leaves no litter behind. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = path.join(ROOT, "artifacts", "tmp");
const made = [];

process.on("exit", () => {
  for (const d of made) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/** Create a fresh directory under artifacts/tmp; cleaned up at process exit. */
export function mkTmpDir(prefix = "t-") {
  fs.mkdirSync(BASE, { recursive: true });
  const d = fs.mkdtempSync(path.join(BASE, prefix));
  made.push(d);
  return d;
}
