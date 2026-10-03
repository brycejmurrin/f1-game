// environment-json.test.mjs — repo Cloud Agent bootstrap contract.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../..");
const ENV_JSON = path.join(ROOT, ".cursor/environment.json");
const MCP_JSON = path.join(ROOT, ".mcp.json");

test(".cursor/environment.json exists and bootstraps chrome MCP", () => {
  const env = JSON.parse(fs.readFileSync(ENV_JSON, "utf8"));
  assert.equal(env.name, "Apex 26");
  assert.match(env.install, /cloud-agent-install\.sh/);
  assert.equal(Object.hasOwn(env, "chromeExecutablePath"), false,
    "do not override the host with a machine-specific /opt path; repository launchers discover Chromium at runtime");
  const names = (env.mcpServerAllowlist || []).map((row) => row.name).sort();
  // Allowlist = the three committed catalog servers only. A stale fourth name
  // (chrome-devtools-mcp) used to linger after that row left .mcp.json.
  assert.deepEqual(names, [
    "apex-tools",
    "chrome-devtools",
    "playwright-official",
  ]);
});

test("SessionStart reuses a discovered browser and routes missing-browser installs through shared bootstrap", (t) => {
  const scratch = path.join(ROOT, "scratch");
  fs.mkdirSync(scratch, { recursive: true });
  const dir = fs.mkdtempSync(path.join(scratch, "session-bootstrap-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const put = (rel, text, executable = false) => {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    if (executable) fs.chmodSync(file, 0o755);
    return file;
  };
  put("package.json", "{}");
  put("node_modules/.package-lock.json", "{}");
  const calls = path.join(dir, "calls");
  // Stub discovery and installs so this contract needs no browser, npm or network.
  put("bin/node", '#!/bin/sh\ncase "$*" in *chromium-path.mjs*) [ -z "$APEX_TEST_BROWSER" ] || printf "%s\\n" "$APEX_TEST_BROWSER" ;; esac\n', true);
  put("bin/npm", '#!/bin/sh\nprintf "npm\\n" >>"$APEX_TEST_CALLS"\nexit 99\n', true);
  put("bin/git", "#!/bin/sh\nexit 1\n", true);
  const browser = put("browser", '#!/bin/sh\nprintf "browser launched\\n" >>"$APEX_TEST_CALLS"\nexit 99\n', true);
  put("tools/env/install-browsers.sh", '#!/bin/sh\nprintf "browser install\\n" >>"$APEX_TEST_CALLS"\nexit 0\n', true);
  const hook = path.join(ROOT, ".claude/hooks/session-start.sh");
  const env = { ...process.env, CLAUDE_PROJECT_DIR: dir, PATH: path.join(dir, "bin") + path.delimiter + process.env.PATH,
    APEX_SKIP_SESSION_INSTALL: "", APEX_SKIP_BROWSER_INSTALL: "", APEX_TEST_CALLS: calls, APEX_TEST_BROWSER: browser };
  let result = spawnSync("bash", [hook], { encoding: "utf8", env, timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Chromium: present/);
  assert.equal(fs.existsSync(calls), false, "usable browser must not launch, download or invoke npm");
  result = spawnSync("bash", [hook], { encoding: "utf8", env: { ...env, APEX_TEST_BROWSER: "" }, timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Chromium: installed/);
  assert.equal(fs.readFileSync(calls, "utf8"), "browser install\n");
  fs.unlinkSync(calls);
  result = spawnSync("bash", [hook], { encoding: "utf8", env: { ...env, APEX_TEST_BROWSER: "", APEX_SKIP_BROWSER_INSTALL: "1" }, timeout: 10000 });
  assert.match(result.stdout, /MISSING \(install skipped\)/);
  assert.equal(fs.existsSync(calls), false);
});

test(".cursor/environment.json allowlist covers every stdio MCP command in .mcp.json", () => {
  const env = JSON.parse(fs.readFileSync(ENV_JSON, "utf8"));
  const cfg = JSON.parse(fs.readFileSync(MCP_JSON, "utf8"));
  const allowedCmds = new Set((env.mcpServerAllowlist || []).map((row) => row.command));
  const allowedNames = new Set((env.mcpServerAllowlist || []).map((row) => row.name));
  for (const [name, row] of Object.entries(cfg.mcpServers)) {
    assert.ok(allowedCmds.has(row.command), `${name} command ${row.command} must be allowlisted`);
    assert.ok(allowedNames.has(name), `${name} must appear in mcpServerAllowlist by name`);
  }
  // No orphans: every allowlist name is a catalog server (dashboard aliases
  // belong in Cursor Integrations & MCP, not this file).
  for (const name of allowedNames) {
    assert.ok(cfg.mcpServers[name], `allowlist name ${name} is not in .mcp.json`);
  }
});
