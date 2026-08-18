// mcp-smoke.test.mjs — four-server shell probe (no Chromium).
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { smokePlan } from "../../tools/mcp-smoke.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SMOKE = path.join(ROOT, "tools/mcp-smoke.mjs");
const SH = path.join(ROOT, "tools/apex-tools-mcp.sh");

function run(args, extraEnv = {}) {
  return spawnSync(process.execPath, [SMOKE, ...args], {
    encoding: "utf8",
    cwd: ROOT,
    env: { ...process.env, ...extraEnv },
    timeout: 15000,
  });
}

test("mcp-smoke --dry-run lists the four repo servers and never launches Chromium", () => {
  const r = run(["--dry-run"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.dryRun, true);
  const servers = body.plan.map((s) => s.server);
  for (const need of ["apex-tools", "probe", "chrome-devtools", "tinyfish"]) {
    assert.ok(servers.includes(need), `dry-run plan missing ${need}`);
  }
  const joined = JSON.stringify(body.plan);
  assert.doesNotMatch(joined, /verify/);
  assert.doesNotMatch(joined, /deploy-check/);
  assert.doesNotMatch(joined, /chrome-start/);
  assert.doesNotMatch(joined, /test-bg/);
  assert.ok(!body.steps?.length, "dry-run must not spawn");
});

test("smokePlan chrome/tinyfish steps stay status/help", () => {
  const plan = smokePlan();
  const chrome = plan.find((s) => s.server === "chrome-devtools");
  const fish = plan.find((s) => s.server === "tinyfish");
  assert.ok(chrome.argv.includes("status"));
  assert.ok(!chrome.argv.includes("verify"));
  assert.ok(!chrome.argv.includes("run"));
  assert.ok(fish.argv.includes("help"));
  assert.ok(!fish.argv.includes("ensure"));
});

test("apex-tools-mcp.sh smoke --dry-run delegates", () => {
  const r = spawnSync("bash", [SH, "smoke", "--dry-run"], {
    encoding: "utf8",
    cwd: ROOT,
    timeout: 15000,
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.dryRun, true);
  assert.ok(body.plan.some((s) => s.server === "apex-tools"));
});

test("help names the never-wrap and the write path", () => {
  const r = run(["--help"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Never wraps test-bg/);
  assert.match(r.stdout, /mcp-smoke\.json/);
  assert.match(r.stdout, /playwright stays out of \.mcp\.json/);
});

test("cloud-agent-install notes TinyFish key and chrome-devtools clone", () => {
  const src = fs.readFileSync(path.join(ROOT, "tools/cloud-agent-install.sh"), "utf8");
  assert.match(src, /TINYFISH_API_KEY/);
  assert.match(src, /chrome-devtools-mcp\.sh clone/);
  assert.doesNotMatch(src, /BAKED/);
});

test("tracked source never embeds a TinyFish key", () => {
  const src = fs.readFileSync(SMOKE, "utf8");
  assert.ok(!src.includes("sk-" + "tinyfish-"));
  assert.match(src, /TINYFISH_API_KEY/);
});
