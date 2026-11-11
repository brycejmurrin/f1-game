/* vendor-doctor.test.mjs — tools/ci/vendor-doctor.mjs reports each vendor's CLI, sign-in and key state without
 * leaking a key, e-mail or account id, and without any argv that starts or messages an agent.
 * No CLI and no network: the process runner and fetch are injected. Run: node --test tests/unit/vendor-doctor.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VENDORS, checkVendor, main, scrub, savedSignIns } from "../../tools/ci/vendor-doctor.mjs";
import { secondAccountEnv, codexEnv, runVendor } from "../../tools/ci/vendor-run.mjs";

const SECRET = "xai-ABCDEFGHIJKLMNOPQRSTUVWX";
const fakeRun = (table) => async (bin, argv) => table[`${bin} ${argv.join(" ")}`] ?? { code: 127, out: "" };

test("a signed-in CLI with a working key reports login, the key NAME and 200, never the value", async () => {
  const calls = [];
  const row = await checkVendor("grok", {
    env: { GROK_API_KEY: SECRET },
    run: fakeRun({ "grok --version": { code: 0, out: "grok 1.0.77 (50ca579fa996)" }, "grok models": { code: 0, out: "You are logged in with grok.com." } }),
    fetchImpl: async (url, init) => { calls.push([url, init.headers.Authorization]); return { status: 200 }; },
  });
  assert.deepEqual({ cli: row.cli, version: row.version, login: row.login, key: row.key, api: row.api },
    { cli: "grok", version: "1.0.77", login: true, key: "GROK_API_KEY", api: 200 });
  assert.equal(calls[0][1], `Bearer ${SECRET}`, "the key goes to its own vendor's host only");
  assert.equal(new URL(calls[0][0]).host, "api.x.ai");
  assert.ok(!JSON.stringify(row).includes(SECRET), "the row never carries the key");
});

test("a missing CLI names the install step; a signed-out CLI names the sign-in step", async () => {
  const missing = await checkVendor("codex", { env: {}, run: fakeRun({}), fetchImpl: null });
  assert.equal(missing.cli, null);
  assert.match(missing.next[0], /^install: /);
  const out = await checkVendor("cursor", {
    env: {}, fetchImpl: null,
    run: fakeRun({ "cursor-agent --version": { code: 0, out: "2026.11.10-731fb78" }, "cursor-agent status": { code: 0, out: "Not logged in" } }),
  });
  assert.equal(out.login, false);
  assert.match(out.next[0], /^sign in: .*cursor-agent login/);
  assert.match(out.next.at(-1), /^cloud: .*prepaid credit balance/);
});

test("the second binary name is tried, and a key that fails is reported by name and host", async () => {
  const row = await checkVendor("cursor", {
    env: { CURSOR_API_KEY: "crsr_0123456789abcdefghij" },
    run: fakeRun({ "agent --version": { code: 0, out: "2026.11.10" }, "agent status": { code: 0, out: "✓ Logged in as someone@example.com" } }),
    fetchImpl: async () => { throw new Error("socket hang up"); },
  });
  assert.equal(row.cli, "agent");
  assert.equal(row.login, true);
  assert.equal(row.api, "unreachable");
  assert.ok(row.next.some((n) => n === "CURSOR_API_KEY did not answer 200 at api.cursor.com"));
  assert.ok(!JSON.stringify(row).includes("someone@example.com"));
});

test("scrub masks e-mails, keys, bearer tokens, account ids and terminal codes", () => {
  const s = scrub(`\x1b[32m✓\x1b[0m bryce@example.com ${SECRET} Bearer abc.def account 38513877-5eca-419a-81da-62ff971ca45a`);
  assert.equal(s, "✓ <email> <key> Bearer <key> account <id>");
});

test("every argv is a read: no launch, send, exec, followup, cancel or delete", () => {
  for (const [name, v] of Object.entries(VENDORS)) {
    for (const argv of [v.version, v.login]) {
      assert.ok(!argv.some((a) => /launch|send|exec|followup|cancel|delete|archive|-p|--print|cloud/.test(a)), `${name}: ${argv.join(" ")}`);
    }
    if (v.api) assert.match(v.api, /\/v1\/(me|models)$/, `${name}: the API probe is a GET of identity or models`);
  }
});

test("main honours --only and rejects an unknown vendor", async () => {
  const rows = await main(["--only", "claude"], { env: {}, run: fakeRun({ "claude --version": { code: 0, out: "2.1.322 (Claude Code)" }, "claude auth status": { code: 0, out: '{"loggedIn": true}' } }), fetchImpl: null });
  assert.deepEqual(rows.map((r) => [r.vendor, r.version, r.login]), [["claude", "2.1.322", true]]);
  await assert.rejects(main(["--only", "gemini"], { env: {}, run: fakeRun({}), fetchImpl: null }), /unknown vendor: gemini/);
});

test("savedSignIns reports variable names, never values", () => {
  const row = savedSignIns({ APEX_CLAUDE_B_OAUTH_TOKEN: SECRET, APEX_CODEX_HOME: "/x" });
  assert.deepEqual([row.claudeB, row.codex, row.next], ["APEX_CLAUDE_B_OAUTH_TOKEN", "APEX_CODEX_HOME", []]);
  assert.ok(!JSON.stringify(row).includes(SECRET));
  assert.equal(savedSignIns({}).next.length, 2);
});

test("the second-account env drops the host session's identity and carries the saved token only to the child", () => {
  const host = { PATH: "/bin", CLAUDE_CODE_REMOTE: "1", CLAUDECODE: "1", ANTHROPIC_BASE_URL: "https://x", CCR_X: "1", CLAUDE_CODE_OAUTH_TOKEN: "host-token" };
  assert.throws(() => secondAccountEnv(host, { tmpDir: "/t" }), /APEX_CLAUDE_B_OAUTH_TOKEN or APEX_CLAUDE_CONFIG_DIR/);
  const byToken = secondAccountEnv({ ...host, APEX_CLAUDE_B_OAUTH_TOKEN: SECRET }, { tmpDir: "/t" });
  assert.deepEqual(Object.keys(byToken).sort(), ["CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CONFIG_DIR", "PATH"]);
  assert.equal(byToken.CLAUDE_CODE_OAUTH_TOKEN, SECRET);
  assert.equal(byToken.CLAUDE_CONFIG_DIR, path.join("/t", "claude-b-config"));
  const byDir = secondAccountEnv({ ...host, APEX_CLAUDE_CONFIG_DIR: "/b" }, { tmpDir: "/t" });
  assert.deepEqual([byDir.CLAUDE_CONFIG_DIR, byDir.CLAUDE_CODE_OAUTH_TOKEN], ["/b", undefined]);
});

test("codexEnv seeds auth.json once at 0600 and never passes the saved secrets on", () => {
  const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vendor-run-")), "codex");
  const b64 = Buffer.from('{"tokens":{}}').toString("base64");
  const env = codexEnv({ PATH: "/bin", APEX_CODEX_HOME: home, APEX_CODEX_AUTH_JSON_B64: b64, APEX_CLAUDE_B_OAUTH_TOKEN: SECRET });
  assert.equal(env.CODEX_HOME, home);
  assert.equal(env.APEX_CODEX_AUTH_JSON_B64, undefined);
  assert.equal(env.APEX_CLAUDE_B_OAUTH_TOKEN, undefined);
  assert.equal(fs.readFileSync(path.join(home, "auth.json"), "utf8"), '{"tokens":{}}');
  assert.equal(fs.statSync(path.join(home, "auth.json")).mode & 0o777, 0o600);
  fs.writeFileSync(path.join(home, "auth.json"), "refreshed");
  codexEnv({ APEX_CODEX_HOME: home, APEX_CODEX_AUTH_JSON_B64: b64 });
  assert.equal(fs.readFileSync(path.join(home, "auth.json"), "utf8"), "refreshed", "a refreshed sign-in is never overwritten");
  assert.deepEqual(codexEnv({ PATH: "/bin" }), { PATH: "/bin" });
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "vendor-run-home-"));
  assert.equal(codexEnv({ HOME: fakeHome, APEX_CODEX_AUTH_JSON_B64: b64 }).CODEX_HOME, path.join(fakeHome, ".codex-apex"), "the saved sign-in alone is enough");
});

test("runVendor builds read-only argv per vendor, scrubs the answer and reports a missing CLI", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "vendor-run-cwd-"));
  const seen = [];
  const spawnImpl = async (bin, argv, o) => { seen.push([bin, argv, o.env]); return { code: 0, out: JSON.stringify({ result: `hi ${SECRET} someone@example.com` }) }; };
  const row = await runVendor("claude", { cwd, prompt: "q", env: { PATH: "/bin", CLAUDE_CODE_REMOTE: "1", APEX_CLAUDE_B_OAUTH_TOKEN: SECRET }, spawnImpl });
  assert.deepEqual([row.ok, row.text], [true, "hi <key> <email>"]);
  assert.deepEqual(seen[0][1].slice(0, 6), ["-p", "q", "--output-format", "json", "--permission-mode", "plan"]);
  assert.equal(seen[0][2].CLAUDE_CODE_REMOTE, undefined);
  const cur = await runVendor("cursor", { cwd, prompt: "q", env: {}, spawnImpl });
  assert.ok(seen.at(-1)[1].includes("ask") && !seen.at(-1)[1].includes("--force"), "read-only is the default");
  assert.equal(cur.ok, true);
  await runVendor("grok", { cwd, prompt: "q", env: { GROK_API_KEY: SECRET }, spawnImpl });
  assert.equal(seen.at(-1)[2].XAI_API_KEY, SECRET, "the stored GROK_API_KEY reaches Grok Build under the name it reads");
  await runVendor("grok", { cwd, prompt: "q", write: true, env: {}, spawnImpl });
  assert.ok(seen.at(-1)[1].join(" ").includes("--permission-mode acceptEdits --allow Edit --allow Write"), "Grok write mode pre-approves edits");
  const cancelled = await runVendor("grok", { cwd, prompt: "q", env: {}, spawnImpl: async () => ({ code: 0, out: '{"text":"I will","stopReason":"cancelled"}\npermission required: Edit was not run' }) });
  assert.equal(cancelled.ok, false, "a cancelled headless Grok run is not a pass");
  const gone = await runVendor("grok", { cwd, prompt: "q", env: {}, spawnImpl: async () => ({ code: 127, out: "" }) });
  assert.deepEqual([gone.ok, gone.error], [false, "cli_not_found"]);
  await assert.rejects(runVendor("codex", { cwd: "/nope", prompt: "q" }), /existing directory/);
  assert.equal(fs.readdirSync(cwd).length, 0, "the temp directory is removed");
});
