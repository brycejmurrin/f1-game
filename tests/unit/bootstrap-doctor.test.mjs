// Offline bootstrap regressions: no browser, npm, real Git writes or external calls.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { diagnose } from "../../tools/check/doctor.mjs";
import { browserCachePath, resolveChromium } from "../../tools/lib/chromium-path.mjs";
import { pickChromium } from "../../tools/lib/harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const scratch = path.join(ROOT, "scratch");
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", timeout: 10000, ...opts });
function fixture(t) {
  fs.mkdirSync(scratch, { recursive: true });
  const dir = fs.mkdtempSync(path.join(scratch, "bootstrap-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function put(dir, rel, text, executable = false) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  if (executable) fs.chmodSync(file, 0o755);
  return file;
}
function skillTree(dir, fm = 'name: demo\ndescription: "Use when debugging: demo."') {
  put(dir, "package.json", '{"dependencies":{}}');
  put(dir, ".claude/skills/demo/SKILL.md", `---\n${fm}\n---\n[Reference](references/guide.md)\n`);
  put(dir, ".claude/skills/demo/references/guide.md", "Guide\n");
  fs.mkdirSync(path.join(dir, ".agents/skills"), { recursive: true });
  fs.symlinkSync("../../.claude/skills/demo", path.join(dir, ".agents/skills/demo"));
}

test("doctor checks the inspected package Node engine rather than a stale minimum", (t) => {
  const dir = fixture(t);
  skillTree(dir);
  const check = (nodeVersion) => diagnose({ root: dir, nodeVersion }).checks.find((c) => c.id === "runtime.node");
  put(dir, "package.json", JSON.stringify({ engines: { node: ">=22" } }));
  assert.equal(check("20.19.0").status, "fail");
  assert.equal(check("21.7.3").status, "fail");
  assert.equal(check("22.0.0").status, "pass");
  assert.match(check("22.0.0").message, />=22/);
  put(dir, "package.json", JSON.stringify({ engines: { node: ">=22.3.1" } }));
  assert.equal(check("22.3.0").status, "fail");
  assert.equal(check("22.3.1").status, "pass");
  assert.equal(check("23.0.0").status, "pass");
  put(dir, "package.json", JSON.stringify({ engines: { node: ">=22 <24" } }));
  assert.equal(check("25.0.0").status, "warn", "unsupported ranges must remain unverified");
});

test("doctor parses real YAML and rejects colon descriptions and duplicate keys", (t) => {
  const dir = fixture(t);
  skillTree(dir);
  assert.equal(diagnose({ root: dir }).ok, true);
  put(dir, ".claude/skills/demo/SKILL.md", "---\nname: demo\ndescription: Use when debugging: demo.\n---\n");
  let result = diagnose({ root: dir });
  assert.equal(result.ok, false);
  assert.equal(result.checks.find((c) => c.id === "skills.demo.yaml").status, "fail");
  put(dir, ".claude/skills/demo/SKILL.md", "---\nname: demo\nname: other\ndescription: Use when testing\n---\n");
  result = diagnose({ root: dir });
  assert.ok(result.checks.find((c) => c.id === "skills.demo.yaml").details.codes.includes("DUPLICATE_KEY"));
});

test("doctor detects missing resources and wrong symlinks without repairing them", (t) => {
  const dir = fixture(t);
  skillTree(dir);
  const link = path.join(dir, ".agents/skills/demo");
  fs.unlinkSync(link);
  fs.symlinkSync("../../.claude/skills/absent", link);
  fs.unlinkSync(path.join(dir, ".claude/skills/demo/references/guide.md"));
  const result = diagnose({ root: dir });
  assert.equal(result.ok, false);
  assert.equal(result.checks.find((c) => c.id === "skills.demo.mirror").status, "fail");
  assert.equal(result.checks.find((c) => c.id === "skills.demo.refs.SKILL.md").status, "fail");
  assert.equal(fs.readlinkSync(link), "../../.claude/skills/absent");
});

test("doctor diagnoses supplied host capabilities and conflicting connector metadata without leaking credentials", (t) => {
  const dir = fixture(t);
  skillTree(dir);
  const catalog = { tools: [{ name: "browser_use_run" }], skills: [{ name: "work-pets:create-pet", available: false }], connectors: [{
    dependenciesResult: { source_plugin_id: "drive", source_plugin_installed: true, source_plugin_user_enabled: true },
    permissionsResults: [{ app_id: "drive", status: "not_installed" }],
    token: "SECRET_SHOULD_NOT_APPEAR",
  }] };
  const result = diagnose({ root: dir, catalog });
  assert.ok(result.checks.some((c) => c.id === "session.BROWSER_PRIMITIVES_ABSENT"));
  assert.equal(result.checks.find((c) => c.id === "session.skill.0.resources").status, "warn");
  assert.equal(result.checks.find((c) => c.id === "session.connector.0").details.state, "conflict");
  assert.doesNotMatch(JSON.stringify(result), /SECRET_SHOULD_NOT_APPEAR/);
});

test("doctor keeps remote skill locators unverified and resolves local resources relative to inspected root", (t) => {
  const dir = fixture(t);
  skillTree(dir);
  const local = ".claude/skills/demo/SKILL.md";
  const result = diagnose({ root: dir, catalog: { tools: [], skills: [
    { name: "remote", path: "skill://demo/SKILL.md", resources: [{ path: "skill://demo/references.md" }] },
    { name: "local", path: local, resources: [{ path: ".claude/skills/demo/references/guide.md" }] },
    { name: "file-url", path: pathToFileURL(path.join(dir, local)).href },
    { name: "explicit-missing", path: "skill://demo/SKILL.md", resources: [{ uri: "skill://demo/guide.md", exists: false }] },
    { name: "explicit-failed", path: "skill://demo/SKILL.md", resources: [{ uri: "skill://demo/guide.md", status: "failed" }] },
    { name: "missing-local", path: ".claude/skills/demo/absent.md" },
    { name: "failed-read", path: "skill://demo/SKILL.md", resources: [{ uri: "skill://demo/guide.md", ok: false }] },
  ] } });
  const checks = result.checks.filter((c) => /^session\.skill\.\d+\.resources$/.test(c.id));
  assert.equal(checks[0].details.state, "unverified");
  assert.equal(checks[0].details.remoteResources, 2);
  assert.doesNotMatch(checks[0].message, /missing|unavailable/i);
  assert.equal(checks[1].details.state, "local-present");
  assert.equal(checks[1].status, "pass");
  assert.equal(checks[2].details.state, "local-present");
  for (const check of checks.slice(3)) {
    assert.equal(check.details.state, "missing");
    assert.equal(check.status, "warn");
  }
});

test("doctor help and tree JSON CLI stay read-only and reject unknown flags", (t) => {
  const dir = fixture(t);
  skillTree(dir);
  const script = path.join(ROOT, "tools/check/doctor.mjs");
  assert.equal(run("node", [script, "--help"]).status, 0);
  assert.equal(run("node", [script, "--boot"]).status, 2);
  const before = fs.readdirSync(dir).sort();
  const result = run("node", [script, "--tree", "--json", "--root", dir]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).mode, "tree");
  assert.deepEqual(fs.readdirSync(dir).sort(), before);
});

test("guard blocks edits enclosing generated spans and new generated-script insertions; large stdin stays usable", (t) => {
  const dir = fixture(t);
  const fakeBin = path.join(dir, "bin");
  put(dir, "bin/git", '#!/bin/sh\ncase "$*" in *--show-toplevel*) printf "%s\\n" "$APEX_TEST_ROOT" ;; esac\n', true);
  const env = { ...process.env, PATH: fakeBin + path.delimiter + process.env.PATH, APEX_TEST_ROOT: dir };
  const hook = path.join(ROOT, ".claude/hooks/protect-files.sh");
  const guard = (tool_name, tool_input) => run("bash", [hook], { input: JSON.stringify({ tool_name, tool_input }), env });
  const shell = "before\n<!-- @gen-shell:test -->\nGENERATED\n<!-- @gen-shell:end -->\nafter\n";
  const file = put(dir, "index.html", shell);
  assert.equal(guard("Edit", { file_path: file, old_string: shell, new_string: "replaced" }).status, 2);
  assert.equal(guard("MultiEdit", { file_path: file, edits: [{ old_string: shell, new_string: "replaced" }] }).status, 2);
  const pkg = put(dir, "package.json", '{"scripts": {"test:guards":"node old"}}');
  assert.equal(guard("Edit", { file_path: pkg, old_string: '"scripts": {', new_string: '"scripts": {"test:new.group":"node new",' }).status, 2);
  assert.equal(guard("Edit", { file_path: pkg, old_string: "node old", new_string: "node changed" }).status, 2, "value-only edits must compare generated maps");
  assert.equal(guard("Edit", { file_path: pkg, old_string: '"scripts": {', new_string: '"scripts": {"test\\u003anew":"node new",' }).status, 2, "escaped JSON key must not bypass guard");
  assert.equal(guard("Edit", { file_path: pkg, old_string: '"scripts": {', new_string: '"scripts": {"serve":"node server",' }).status, 0);
  assert.equal(guard("Write", { file_path: file, content: shell + "x".repeat(400000) }).status, 0, "unchanged generated blocks with a large Write must not hit exec env limits");
  assert.equal(guard("Write", { file_path: file, content: shell.replace("GENERATED", "CHANGED") + "x".repeat(400000) }).status, 2);
});

test("mirror check detects broken/wrong existing links, repair replaces them, copies are checked for drift", (t) => {
  const dir = fixture(t);
  skillTree(dir);
  const script = put(dir, "tools/env/mirror-skills.sh", fs.readFileSync(path.join(ROOT, "tools/env/mirror-skills.sh")));
  const link = path.join(dir, ".agents/skills/demo");
  fs.unlinkSync(link);
  fs.symlinkSync("../../.claude/skills/absent", link);
  assert.equal(run("bash", [script, "--check"]).status, 1);
  assert.equal(run("bash", [script]).status, 0);
  assert.equal(fs.readlinkSync(link), "../../.claude/skills/demo");
  assert.equal(run("bash", [script, "--check"]).status, 0);
  assert.equal(run("bash", [script, "--copy"]).status, 0);
  assert.equal(run("bash", [script, "--check"]).status, 0);
  put(dir, ".agents/skills/demo/references/guide.md", "stale");
  assert.equal(run("bash", [script, "--check"]).status, 1);
});

test("Chromium PATH discovery and harness agree, ignore nonexecutables, and retain explicit precedence", (t) => {
  const dir = fixture(t);
  put(dir, "bin/chromium", "unused", false);
  const found = put(dir, "bin/google-chrome-stable", "#!/bin/sh\nexit 99\n", true);
  const opts = { env: { PATH: path.join(dir, "bin"), HOME: dir }, roots: [], systemPaths: [] };
  assert.deepEqual(resolveChromium(opts), { path: found, source: "PATH:google-chrome-stable" });
  assert.equal(pickChromium(opts), found);
  assert.equal(resolveChromium({ ...opts, env: { ...opts.env, PW_CHROMIUM: "/explicit" } }).path, "/explicit");
});

test("browser cache selection falls back from nonwritable preferred and shared directories", () => {
  const env = { HOME: "/home/example", PLAYWRIGHT_BROWSERS_PATH: "/unwritable", XDG_CACHE_HOME: "/writable/user-cache" };
  assert.equal(browserCachePath({ env, writable: (p) => p.startsWith("/writable/") }), "/writable/user-cache/ms-playwright");
  assert.equal(browserCachePath({ env, writable: () => false }), undefined);
});

test("doctor reports unusable configured browser cache and the selected fallback", (t) => {
  const dir = fixture(t);
  skillTree(dir);
  const result = diagnose({ root: dir, env: { ...process.env, HOME: dir, PLAYWRIGHT_BROWSERS_PATH: "/dev/null/not-a-directory" } });
  const cache = result.checks.find((c) => c.id === "runtime.browser-cache");
  assert.equal(cache.status, "warn");
  assert.equal(cache.details.configuredWritable, false);
  assert.equal(cache.details.configured, "/dev/null/not-a-directory");
  assert.equal(cache.details.fallback, true);
  assert.notEqual(cache.details.selected, cache.details.configured);
});

test("daemon health requires service/root identity, missing tmux is actionable, failed stop retains state", (t) => {
  const dir = fixture(t);
  const code = `import importlib.util, json, os, subprocess\nfrom pathlib import Path\nfrom argparse import Namespace\nspec=importlib.util.spec_from_file_location("probe", ${JSON.stringify(path.join(ROOT, "tools/mcp/probe-mcp.py"))})\np=importlib.util.module_from_spec(spec); spec.loader.exec_module(p)\np.CHROME_DAEMON_STATE=Path(os.environ["APEX_TEST_ROOT"])/"state"\np.CHROME_DAEMON_STATE.write_text("1234")\nclass Response:\n status=200\n def __enter__(self): return self\n def __exit__(self,*a): pass\n def read(self,*a): return json.dumps(health).encode()\nhealth={"ok":True}\np.urllib.request.urlopen=lambda *a,**kw: Response()\nassert p.daemon_port() is None\nhealth={"ok":True,"service":"apex-probe-chrome","rootId":"other-root"}\nassert p.daemon_port() is None\nhealth["rootId"]=p.CHROME_DAEMON_ID\nassert p.daemon_port()==1234\np.daemon_port=lambda:None\np.shutil.which=lambda name:None\nassert p.cmd_chrome_start(Namespace(port=1234))==1\nassert p.cmd_chrome_stop(Namespace())==1\nassert p.CHROME_DAEMON_STATE.exists()\np.daemon_port=lambda:1234\np._tmux=lambda *a:subprocess.CompletedProcess(a,1,"","denied")\nimport time\ntime.sleep=lambda n:None\nassert p.cmd_chrome_stop(Namespace())==1\nassert p.CHROME_DAEMON_STATE.exists()\np.daemon_port=lambda:None\nassert p.cmd_chrome_stop(Namespace())==1\nassert p.CHROME_DAEMON_STATE.exists()\np._tmux=lambda *a:subprocess.CompletedProcess(a,1,"","can\'t find session: absent")\nassert p.cmd_chrome_stop(Namespace())==0\nassert not p.CHROME_DAEMON_STATE.exists()\nprint("daemon safety passed")\n`;
  const result = run("python3", ["-c", code], { env: { ...process.env, APEX_TEST_ROOT: dir, PYTHONDONTWRITEBYTECODE: "1" } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /daemon safety passed/);
  assert.match(result.stderr, /tmux is required/);
});

test("daemon invalid port is rejected before a browser can start", () => {
  const result = run("python3", [path.join(ROOT, "tools/mcp/probe-mcp.py"), "chrome-daemon", "--port", "-1"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /port must be between/);
});
