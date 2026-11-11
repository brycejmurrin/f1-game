/* vendor-doctor.test.mjs — tools/ci/vendor-doctor.mjs reports each vendor's CLI, sign-in and key state without
 * leaking a key, e-mail or account id, and without any argv that starts or messages an agent.
 * No CLI and no network: the process runner and fetch are injected. Run: node --test tests/unit/vendor-doctor.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { VENDORS, checkVendor, main, scrub } from "../../tools/ci/vendor-doctor.mjs";

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
