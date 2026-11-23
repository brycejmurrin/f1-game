/* vendor-doctor.test.mjs — tools/ci/vendor-doctor.mjs reports each vendor's CLI, sign-in and key state without
 * leaking a key, e-mail or account id, and without any argv that starts or messages an agent.
 * No CLI and no network: the process runner and fetch are injected. Run: node --test tests/unit/vendor-doctor.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VENDORS, checkVendor, checkSecondClaude, main, scrub, savedSignIns, secondAccountEnv } from "../../tools/ci/vendor-doctor.mjs";

const SECRET = "xai-ABCDEFGHIJKLMNOPQRSTUVWX";
const fakeRun = (table) => async (bin, argv) => table[`${bin} ${argv.join(" ")}`] ?? { code: 127, out: "" };

test("Codex checks version and login in the saved home without exposing the saved auth", async () => {
  const b64 = Buffer.from('{"tokens":{"access_token":"saved-secret"}}').toString("base64");
  const env = { APEX_CODEX_HOME: "/saved/codex", APEX_CODEX_AUTH_JSON_B64: b64, CODEX_HOME: "/other/codex" };
  const calls = [];
  const row = await checkVendor("codex", {
    env, fetchImpl: null,
    run: async (bin, argv, options) => {
      calls.push([bin, argv, options.env.CODEX_HOME]);
      return { code: 0, out: argv[0] === "--version" ? "codex-cli 0.167.1" : "Logged in using ChatGPT" };
    },
  });
  assert.deepEqual(calls, [
    ["codex", ["--version"], "/saved/codex"],
    ["codex", ["login", "status"], "/saved/codex"],
  ]);
  assert.equal(row.login, true);
  assert.ok(!JSON.stringify(row).includes(b64), "the row never carries the saved auth value");
  assert.equal(env.CODEX_HOME, "/other/codex", "the caller's environment is unchanged");
});

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
  assert.equal(missing.next[0], "install: npm i -g @openai/codex");
  const out = await checkVendor("cursor", {
    env: {}, fetchImpl: null,
    run: fakeRun({ "cursor-agent --version": { code: 0, out: "2026.11.10-731fb78" }, "cursor-agent status": { code: 0, out: "Not logged in" } }),
  });
  assert.equal(out.login, false);
  assert.equal(out.next[0], "sign in: NO_OPEN_BROWSER=1 cursor-agent login");
  assert.equal(out.next.at(-1), "cloud: API-key cloud launches need a prepaid credit balance (cursor.com/dashboard); web, app and Automation launches use the weekly pool");
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
  const s = scrub(`\x1b[32m✓\x1b[0m bryce@example.com ${SECRET} Bearer abc.def account 00000000-1111-4222-8333-444444444444`);
  assert.equal(s, "✓ <email> <key> Bearer <key> account <id>");
});

test("scrub masks JWTs, GitHub tokens and secret assignments without masking placeholders again", () => {
  const jwt = "eyJ" + "a".repeat(12) + "." + "b_".repeat(8) + "." + "c-".repeat(8);
  const value = "dummy" + "x".repeat(12);
  const samples = [
    [jwt, "<jwt>"],
    [`Bearer ${jwt}`, "Bearer <key>"],
    ...["ghp_", "gho_", "ghu_", "ghs_", "ghr_", "github_pat_"].map((prefix) =>
      [prefix + "a_".repeat(10), "<key>"]),
    [`"access_token": "${value}"`, '"access_token": "<redacted>"'],
    ...["client_secret", "PASSWORD", "db_passwd", "service_api_key", "apiKey", "api-key"].map((key) =>
      [`${key}=${value}`, `${key}=<redacted>`]),
    [`secret : '${value}'`, "secret : '<redacted>'"],
    [`token=${jwt}`, "token=<jwt>"],
    ["An ordinary sentence containing token has no assignment.", "An ordinary sentence containing token has no assignment."],
    ["password=" + "x".repeat(7), "password=" + "x".repeat(7)],
    ["access_token=<key>", "access_token=<key>"],
    ...["<jwt>", "<email>", "<id>"].map((placeholder) => [`secret='${placeholder}'`, `secret='${placeholder}'`]),
  ];
  for (const [input, expected] of samples) assert.equal(scrub(input), expected);
});

test("scrub is linear on long runs with no match", () => {
  for (const input of ["x".repeat(300000), "x".repeat(300000) + "=", "a.".repeat(150000), "eyJ" + "a".repeat(300000)]) {
    const t0 = Date.now();
    const out = scrub(input);
    assert.ok(Date.now() - t0 < 1500, `scrub took ${Date.now() - t0} ms on ${input.length} characters`);
    assert.equal(out, input);
  }
});

test("every argv is a read: no launch, send, exec, followup, cancel or delete", () => {
  for (const [name, v] of Object.entries(VENDORS)) {
    for (const argv of [v.version, v.login]) {
      assert.ok(!argv.some((a) => /launch|send|exec|followup|cancel|delete|archive|-p|--print|cloud/.test(a)), `${name}: ${argv.join(" ")}`);
    }
    if (v.api) assert.equal(new Set(["https://api.cursor.com/v1/me", "https://api.openai.com/v1/models", "https://api.x.ai/v1/models"]).has(v.api), true, `${name}: the API probe is a GET of identity or models`);
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

test("checkSecondClaude runs `claude auth status` as the second account and reports the variable name, never the token", async () => {
  const calls = [];
  const none = await checkSecondClaude({ env: { PATH: "/bin" }, run: async (...a) => { calls.push(a); return { code: 0, out: "" }; } });
  assert.equal(calls.length, 0, "no saved sign-in runs nothing");
  assert.deepEqual(none, { vendor: "claude-b", via: null, login: false,
    next: ["save a `claude setup-token` token as APEX_CLAUDE_B_OAUTH_TOKEN in the cloud environment"] });
  const host = { PATH: "/bin", CLAUDE_CODE_REMOTE: "1", CLAUDE_CODE_OAUTH_TOKEN: "host-token", ANTHROPIC_BASE_URL: "https://x", APEX_CLAUDE_B_OAUTH_TOKEN: SECRET };
  const ok = await checkSecondClaude({ env: host, run: async (bin, argv, o) => {
    calls.push([bin, argv, o.env, fs.existsSync(path.dirname(o.env.CLAUDE_CONFIG_DIR))]);
    return { code: 0, out: JSON.stringify({ loggedIn: true, email: "b@example.com" }) };
  } });
  const [bin, argv, child, tmpExisted] = calls[0];
  assert.deepEqual([bin, argv, ok.via, ok.login, ok.next], ["claude", ["auth", "status"], "APEX_CLAUDE_B_OAUTH_TOKEN", true, []]);
  assert.equal(child.CLAUDE_CODE_OAUTH_TOKEN, SECRET);
  assert.deepEqual(Object.keys(child).filter((k) => /^(CLAUDE_CODE_|ANTHROPIC_)/.test(k)), ["CLAUDE_CODE_OAUTH_TOKEN"], "none of the host's CLAUDE_CODE_* / ANTHROPIC_*");
  assert.ok(tmpExisted && child.CLAUDE_CONFIG_DIR.startsWith(os.tmpdir()), "the config dir lives in a temp dir during the run");
  assert.ok(!fs.existsSync(path.dirname(child.CLAUDE_CONFIG_DIR)), "the temp dir is removed afterwards");
  assert.ok(!JSON.stringify(ok).includes(SECRET) && !JSON.stringify(ok).includes("b@example.com"));
  const bad = await checkSecondClaude({ env: host, run: async () => ({ code: 1, out: "Not logged in" }) });
  assert.equal(bad.login, false);
  assert.equal(bad.next[0], "sign in: APEX_CLAUDE_B_OAUTH_TOKEN did not sign in; save a fresh `claude setup-token` token of the second account as APEX_CLAUDE_B_OAUTH_TOKEN");
  let both;
  const bothOk = await checkSecondClaude({ env: { ...host, APEX_CLAUDE_CONFIG_DIR: "/b" }, run: async (_b, _a, o) => { both = o.env; return { code: 1, out: "Not logged in" }; } });
  assert.deepEqual([bothOk.via, both.CLAUDE_CODE_OAUTH_TOKEN, both.CLAUDE_CONFIG_DIR], ["APEX_CLAUDE_CONFIG_DIR", undefined, "/b"], "both set: the config dir wins, no token reaches the child");
  assert.equal(bothOk.next[0], 'sign in: run `CLAUDE_CONFIG_DIR="$APEX_CLAUDE_CONFIG_DIR" claude auth login` once as the second account');
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
