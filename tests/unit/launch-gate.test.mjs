/* launch-gate.test.mjs — the quota gate before create_session (audit 2026-10-26 #5, D7 + Q1).
 *
 * tools/ci/launch-gate.mjs reads rate_limit_info from a saved get_session and
 * writes artifacts/launch-gate/receipt.json; .claude/hooks/launch-gate.py
 * refuses create_session without an ok receipt under 120 s old, and fails OPEN
 * on its own errors (a broken hook must never stall a fleet).
 * Run: node --test tests/unit/launch-gate.test.mjs   (< 1 s)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extractSession, verdict, writeReceipt, MAX_AGE_S, pageVerdict, pageTimestamp, PAGE_SKEW_S } from "../../tools/ci/launch-gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = path.join(ROOT, ".claude/hooks/launch-gate.py");
const TOOL = path.join(ROOT, "tools/ci/launch-gate.mjs");
const page = (status, ts = new Date().toISOString()) => `<envelope>{"ccr":{"id":"session_X","updated_at":"${ts}","external_metadata":{"rate_limit_info":{"rateLimitType":"seven_day","resetsAt":1793250000,"status":"${status}"}}},"lineage":{"depth":1}}</envelope>`;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "launch-gate-"));
const hook = (root, payload) => spawnSync("python3", [HOOK], {
  input: typeof payload === "string" ? payload : JSON.stringify(payload), encoding: "utf8", timeout: 10000,
  env: { ...process.env, CLAUDE_PROJECT_DIR: root },
});
const call = { hook_event_name: "PreToolUse", tool_name: "mcp__claude-code-remote__create_session", tool_input: { prompt: "x" } };
const decision = (r) => (r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : "pass");
/** Write artifacts/launch/self.json as launch-page.py does; returns the receipt fields bound to it. */
const selfPage = (root, extra = {}) => {
  const text = JSON.stringify({ written_by: "launch-page.py", at: new Date().toISOString(), content_sha256: "0".repeat(64), response: { id: "session_X" }, ...extra }, null, 1);
  fs.mkdirSync(path.join(root, "artifacts/launch"), { recursive: true });
  fs.writeFileSync(path.join(root, "artifacts/launch/self.json"), text);
  return { page: { sha256: crypto.createHash("sha256").update(text).digest("hex"), timestamp: new Date().toISOString(), writtenBy: "launch-page.py" }, lane: null, pr: null };
};

test("verdict: allowed passes, a warning refuses, a typed override passes and keeps the quote", () => {
  assert.equal(verdict(extractSession(page("allowed"))).ok, true);
  const warn = verdict(extractSession(page("allowed_warning")));
  assert.equal(warn.ok, false);
  assert.equal(warn.status, "allowed_warning");
  const o = verdict(extractSession(page("allowed_warning")), { override: "Spawn a session to deeply read" });
  assert.equal(o.ok, true);
  assert.equal(o.override, "Spawn a session to deeply read");
  assert.equal(verdict({}).status, "unknown");
  assert.equal(verdict({}).ok, false);
  assert.throws(() => extractSession("no json here"));
});

test("CLI writes the receipt: exit 0 on allowed, 1 on a warning, 2 on a missing page or a bare --override", () => {
  const root = tmp();
  const f = path.join(root, "page.txt");
  const run = (...a) => spawnSync(process.execPath, [TOOL, ...a], { encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  fs.writeFileSync(f, page("allowed"));
  assert.equal(run(f).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "artifacts/launch-gate/receipt.json"), "utf8")).ok, true);
  fs.writeFileSync(f, page("allowed_warning"));
  assert.equal(run(f).status, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "artifacts/launch-gate/receipt.json"), "utf8")).ok, false);
  assert.equal(run(f, "--override", "Do all").status, 0);
  assert.equal(run("--override", "Do all", f).status, 0, "the override may come before the page");
  assert.equal(run(f, "--override").status, 2);
  assert.equal(run(path.join(root, "missing.txt")).status, 2);
  const old = new Date(Date.now() - 10 * 60000);
  fs.utimesSync(f, old, old);
  assert.equal(run(f, "--override", "Do all").status, 1, "a stale saved page is not evidence of the quota now");
});

test("hook: denies with no receipt, a refused receipt or a stale one; passes a fresh ok receipt", () => {
  const root = tmp();
  assert.equal(decision(hook(root, call)), "deny");
  writeReceipt(root, { ok: false, status: "allowed_warning", why: "warn" });
  assert.equal(decision(hook(root, call)), "deny");
  // The receipt shape launch-gate.mjs writes (audit 4 G13): kind launch, the page's sha256 and timestamp, lane, pr —
  // and since WP-L4 that sha256 is the sha256 of artifacts/launch/self.json, the page launch-page.py recorded.
  const PG = selfPage(root);
  writeReceipt(root, { ok: true, status: "allowed", ...PG });
  assert.equal(decision(hook(root, call)), "pass");
  writeReceipt(root, { ok: true, status: "allowed_warning", override: "Do all", ...PG });
  assert.equal(decision(hook(root, call)), "pass", "override receipt passes");
  writeReceipt(root, { ok: true, status: "allowed" });
  assert.equal(decision(hook(root, call)), "deny", "no page.sha256: not a receipt launch-gate.mjs wrote");
  writeReceipt(root, { ok: true, status: "allowed", ...PG });
  assert.equal(decision(hook(root, { ...call, tool_input: { prompt: "x", outcome_branch: "claude/f1-game-project-26h3ng" } })), "deny",
    "a session that would push to the deploy branch");
  writeReceipt(root, { ok: true, status: "allowed", ...PG }, Date.now() - (MAX_AGE_S + 30) * 1000);
  assert.equal(decision(hook(root, call)), "deny");
  fs.writeFileSync(path.join(root, "artifacts/launch-gate/receipt.json"), "{not json");
  assert.equal(decision(hook(root, call)), "deny", "a corrupt receipt is unproven quota, re-run the gate");
});

test("WP-L4: the receipt is bound to artifacts/launch/self.json and spent on one create_session", () => {
  const root = tmp();
  const rp = path.join(root, "artifacts/launch-gate/receipt.json");
  // the hook's reason for each refusal (one pattern per case; a behaviour check, not a source pin)
  const deny = (re, why) => {
    const r = hook(root, call);
    assert.equal(decision(r), "deny", why);
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, re, why);
  };
  // a hand-made sha that only looks like one (the r2 probe) no longer passes
  writeReceipt(root, { ok: true, status: "allowed", page: { sha256: "0".repeat(64) } });
  deny(/no quota page artifacts\/launch\/self\.json/, "no self.json");
  selfPage(root);
  writeReceipt(root, { ok: true, status: "allowed", page: { sha256: "0".repeat(64) } });
  deny(/a page other than artifacts\/launch\/self\.json/, "sha of another page");
  const forged = selfPage(root, { written_by: "echo" });
  writeReceipt(root, { ok: true, status: "allowed", ...forged });
  deny(/not written by launch-page\.py/, "a page not written by the hook");
  writeReceipt(root, { ok: true, status: "allowed", ...selfPage(root) });
  const nonce = JSON.parse(fs.readFileSync(rp, "utf8")).nonce;
  assert.equal(String(nonce).length, 36, "the receipt carries a uuid nonce");
  assert.equal(decision(hook(root, call)), "pass", "first launch");
  assert.equal(fs.existsSync(rp), false, "spent: renamed");
  assert.equal(JSON.parse(fs.readFileSync(rp + ".used", "utf8")).nonce, nonce);
  deny(/no launch-gate receipt/, "second launch on the same receipt");
  fs.copyFileSync(rp + ".used", rp);
  deny(/already spent/, "a spent receipt copied back");
});

test("hook fails closed on its own errors and ignores other tools", () => {
  const root = tmp();
  const junk = hook(root, "not json");
  assert.equal(junk.status, 2);
  assert.equal(junk.stdout.trim(), "");
  assert.equal(decision(hook(root, { ...call, tool_name: "mcp__claude-code-remote__send_message" })), "pass");
  assert.equal(hook(root, []).status, 2);
});

test("settings.json wires the hook on create_session with onFailure block (fail closed)", () => {
  const pre = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8")).hooks.PreToolUse;
  const g = pre.find((x) => x.hooks.some((h) => h.command.includes("launch-gate.py")));
  assert.ok(g, "launch-gate.py is not wired");
  assert.equal(g.matcher, "^mcp__claude-code-remote__create_session$");
  assert.ok(g.hooks.every((h) => h.onFailure === "block"));
});

// System audit 4 G13 (O1/O2 hand-wrote the page and `touch`ed it): the page must carry the harness's own timestamp,
// its mtime may trail that by at most PAGE_SKEW_S, and the receipt records the page's sha256 and the launch (lane, pr).
test("audit 4 G13: a page needs its own timestamp, no hand-written mtime skew; the receipt is tied to the page and the launch", () => {
  const now = Date.parse("2026-10-26T20:00:00Z");
  const iso = (ms) => new Date(ms).toISOString();
  assert.equal(PAGE_SKEW_S, 5);
  assert.equal(pageTimestamp(page("allowed", iso(now))), now);
  assert.equal(pageTimestamp('{"ccr":{"id":"s"}}'), 0);
  const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
  const good = page("allowed", iso(now - 2000));
  const ok = pageVerdict(good, { mtimeMs: now - 1000, now });
  assert.equal(ok.ok, true, ok.why);
  assert.equal(ok.sha256, sha(good));
  assert.equal(pageVerdict('{"ccr":{"id":"s","external_metadata":{"rate_limit_info":{"status":"allowed"}}}}', { mtimeMs: now, now }).why,
    "the page carries no harness timestamp/updated_at: save the get_session result as the tool returned it");
  assert.equal(pageVerdict(page("allowed", iso(now - 60_000)), { mtimeMs: now - 1000, now }).why,
    "the page file is 59 s newer than the timestamp inside it (max 5): a page written by hand is not the harness's; let the PostToolUse hook save get_session (artifacts/launch/self.json)");
  assert.equal(pageVerdict(page("allowed", iso(now + 3_600_000)), { mtimeMs: now, now }).why, "the page's timestamp is 3600 s in the future");
  // the PostToolUse hook's page: a wrapper around the tool result
  const wrapped = JSON.stringify({ written_by: "launch-page.py", content_sha256: "0".repeat(64), timestamp: iso(now - 1000), tool_response: page("allowed", iso(now - 1500)) });
  const w = pageVerdict(wrapped, { mtimeMs: now - 900, now });
  assert.equal(w.ok, true, w.why);
  assert.equal(w.writtenBy, "launch-page.py");
  assert.equal(verdict(extractSession(wrapped)).status, "allowed");
  // what launch-page.py actually writes (2026-10-26, ORCH A): `response` = the MCP content array, stamped `at`;
  // the session's updated_at trails the get_session call by a minute, so `at` is the page's timestamp
  const hookPage = JSON.stringify({ written_by: "launch-page.py", at: iso(now - 1000), content_sha256: "0".repeat(64),
    response: [{ type: "text", text: page("allowed_warning", iso(now - 60_000)).replace(/<\/?envelope>/g, "") }] });
  const hp = pageVerdict(hookPage, { mtimeMs: now - 900, now });
  assert.equal(hp.ok, true, hp.why);
  assert.equal(verdict(extractSession(hookPage)).status, "allowed_warning");
  // the CLI: receipt carries page.sha256 + timestamp, lane and pr; a hand-touched page refuses; unknown flags are usage
  const root = tmp();
  const f = path.join(root, "page.txt");
  const run = (...a) => spawnSync(process.execPath, [TOOL, ...a], { encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  const text = page("allowed");
  fs.writeFileSync(f, text);
  assert.equal(run(f, "--lane", "owner-3811", "--pr", "3811").status, 0);
  const rc = JSON.parse(fs.readFileSync(path.join(root, "artifacts/launch-gate/receipt.json"), "utf8"));
  assert.equal(rc.kind, "launch");
  assert.equal(rc.lane, "owner-3811");
  assert.equal(rc.pr, 3811);
  assert.equal(rc.page.sha256, sha(text));
  assert.equal(typeof rc.page.timestamp, "string");
  fs.writeFileSync(f, page("allowed", new Date(Date.now() - 60_000).toISOString()));
  assert.equal(run(f).status, 1, "written a minute after the harness timestamp: by hand");
  assert.equal(run(f, "--pr", "x").status, 2);
  assert.equal(run(f, "--bogus").status, 2);
});

test("verdict: a rejected quota tells the dispatcher to disable its hourly trigger; allowed_warning does not", () => {
  const rl = (status) => ({ external_metadata: { rate_limit_info: { status } } });
  assert.equal(verdict(rl("rejected")).why.includes("disable the hourly dispatcher trigger (update_trigger enabled=false)"), true);
  assert.equal(verdict(rl("allowed_warning")).why.includes("disable the hourly"), false);
});
