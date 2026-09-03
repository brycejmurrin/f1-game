// mcp-smoke.test.mjs — five-wrapper shell probe (no Chromium).
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

test("mcp-smoke --dry-run pokes the two attached shell wrappers and never launches Chromium", () => {
  // .mcp.json is three servers (apex-tools, playwright-official, chrome-devtools);
  // only the first and last have a repo shell. probe / playwright / tinyfish
  // wrappers may stay in the plan as CLI probes but are not MCP-attached.
  const r = run(["--dry-run"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.dryRun, true);
  const servers = body.plan.map((s) => s.server);
  for (const need of ["apex-tools", "chrome-devtools"]) {
    assert.ok(servers.includes(need), `dry-run plan missing ${need}`);
  }
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, ".mcp.json"), "utf8"));
  for (const gone of ["probe", "playwright", "tinyfish", "chrome-devtools-official"]) {
    assert.equal(cfg.mcpServers[gone], undefined, `${gone} must not be MCP-attached`);
  }
  const argv = body.plan.flatMap((s) => s.argv).join(" ");
  assert.doesNotMatch(argv, /\bverify\b/);
  assert.doesNotMatch(argv, /deploy-check/);
  assert.doesNotMatch(argv, /chrome-start/);
  assert.doesNotMatch(argv, /test-bg/);
  assert.doesNotMatch(argv, /playwright-mcp\.sh run/);
  assert.ok(!body.steps?.length, "dry-run must not spawn");
});

test("smokePlan chrome (and any CLI-only wrapper it still pokes) stays status/help", () => {
  const plan = smokePlan();
  const chrome = plan.find((s) => s.server === "chrome-devtools");
  assert.ok(chrome.argv.includes("status"));
  assert.ok(!chrome.argv.includes("verify"));
  assert.ok(!chrome.argv.includes("run"));
  const pw = plan.find((s) => s.server === "playwright");
  if (pw) {
    assert.ok(pw.argv.includes("status"));
    assert.ok(!pw.argv.includes("run"));
  }
  const fish = plan.find((s) => s.server === "tinyfish");
  if (fish) {
    assert.ok(fish.argv.includes("help"));
    assert.ok(!fish.argv.includes("ensure"));
  }
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
  assert.match(r.stdout, /playwright status only/);
});

test("cloud-agent-install notes TinyFish key and chrome-devtools clone", () => {
  const src = fs.readFileSync(path.join(ROOT, "tools/env/cloud-agent-install.sh"), "utf8");
  assert.match(src, /TINYFISH_API_KEY/);
  assert.match(src, /https:\/\/agent\.tinyfish\.ai\/home/);
  assert.match(src, /chrome-devtools-mcp\.sh" clone/);
  assert.match(src, /tinyfish-mcp\.sh" setup/);
  assert.match(src, /ensure_mcp_clones/);
  assert.match(src, /APEX_SKIP_TINYFISH_SETUP/);
  assert.ok(!src.includes("sk-" + "tinyfish-"));
  assert.ok(!src.includes("BAKED" + "_KEY"));
});

test("mcp-smoke names the TinyFish home URL when the key is missing and never reports a fallback", () => {
  assert.match(fs.readFileSync(SMOKE, "utf8"), /https:\/\/agent\.tinyfish\.ai\/home/);
  const r = run(["--dry-run"], { TINYFISH_API_KEY: "" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  // With no key in the shell the only legitimate source is the gitignored
  // .env file — a "fallback" verdict would mean a tracked key came back.
  assert.notEqual(body.tinyfishKey.via, "fallback");
  assert.ok(["env-file", "missing"].includes(body.tinyfishKey.via), body.tinyfishKey.via);
  if (!body.tinyfishKey.present) {
    assert.equal(body.tinyfishKey.url, "https://agent.tinyfish.ai/home");
    assert.match(body.warnings.join("\n"), /https:\/\/agent\.tinyfish\.ai\/home/);
  }
});

test("tracked source never embeds a TinyFish key", () => {
  const src = fs.readFileSync(SMOKE, "utf8");
  assert.ok(!src.includes("sk-" + "tinyfish-"));
  assert.match(src, /TINYFISH_API_KEY/);
});
