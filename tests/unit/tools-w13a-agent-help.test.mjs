/** W13a #3327 — agent.mjs help <hook> never boots Chromium on command-name collisions. */
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const TOOL = join(ROOT, "tools/shot/agent.mjs");

function help(hook) {
  return spawnSync(process.execPath, [TOOL, "help", hook], {
    cwd: ROOT, encoding: "utf8", timeout: 15000,
  });
}

test("help world resolves the agent-index hook without Chromium", () => {
  const r = help("world");
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const row = JSON.parse(r.stdout);
  assert.equal(row.name, "world");
  const err = r.stderr || "";
  assert.equal(err.includes("waitForFunction"), false);
  assert.equal(err.includes("Timeout"), false);
});

test("help track does not boot Chromium (no index row → exit 1)", () => {
  const r = help("track");
  assert.equal(r.status, 1, r.stdout);
  assert.ok((r.stderr || "").includes('no hook named "track"'), r.stderr);
  assert.equal((r.stderr || "").includes("waitForFunction"), false);
  assert.equal(/Timeout \d+ms exceeded/.test(r.stderr || ""), false);
});

test("help physState still works (non-colliding)", () => {
  const r = help("physState");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).name, "physState");
});
