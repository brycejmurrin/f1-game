#!/usr/bin/env node
/**
 * @doc Vendor runner: one headless turn of the Codex, Cursor, Grok or a second-account Claude CLI, read-only by default.
 * A LOCAL run on whichever machine holds that CLI's sign-in: it starts no vendor cloud agent and opens no tunnel.
 * The same prompt, the same result shape for every vendor: `{ vendor, ok, code, ms, text }` with the text scrubbed.
 * Flags measured against codex-cli 0.167.1, cursor-agent 2026.11.10 and grok 1.0.77 (2026-11-11).
 * Grok Build skips AGENTS.md in a folder it has not been told to trust, so the file is passed through `--rules`.
 *
 *   node tools/ci/vendor-run.mjs <codex|cursor|grok> --cwd DIR --prompt "…" [--write] [--timeout 600] [--model M]
 *   node tools/ci/vendor-run.mjs all --cwd DIR --prompt-file FILE        (each in turn, one JSON line each)
 * `claude` runs the Claude CLI under ANOTHER account, never the hosting session's. Give it one of:
 *   APEX_CLAUDE_B_OAUTH_TOKEN  a `claude setup-token` token of that account, saved by Bryce in the cloud environment
 *   APEX_CLAUDE_CONFIG_DIR     that account's config directory (`CLAUDE_CONFIG_DIR=<dir> claude auth login` once)
 * Every variable of the hosting session (CLAUDE_*, ANTHROPIC_*, CCR_*) is dropped from the child. Codex reads its
 * sign-in from APEX_CODEX_HOME (default ~/.codex-apex once a saved sign-in exists); APEX_CODEX_AUTH_JSON_B64 (base64
 * of auth.json, saved the same way) seeds that directory once when it holds no auth.json. No value of any of these is ever printed.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scrub } from "./vendor-doctor.mjs";

export const RUNNERS = Object.freeze({
  codex: {
    bins: ["codex"],
    argv: ({ cwd, write, model, lastFile }) => ["exec", "--skip-git-repo-check", "--sandbox", write ? "workspace-write" : "read-only",
      "-C", cwd, "-o", lastFile, ...(model ? ["-m", model] : []), "-"],
    stdin: true,
    text: ({ lastFile }) => fs.existsSync(lastFile) ? fs.readFileSync(lastFile, "utf8") : "",
    env: codexEnv,
  },
  cursor: {
    bins: ["cursor-agent", "agent"],
    argv: ({ cwd, write, model, prompt }) => ["-p", "--output-format", "json", "--trust", "--workspace", cwd,
      ...(write ? ["--force"] : ["--mode", "ask"]), ...(model ? ["--model", model] : []), prompt],
    text: ({ out }) => lastJson(out)?.result ?? "",
  },
  grok: {
    bins: ["grok"],
    argv: ({ cwd, write, model, promptFile, rules }) => ["--prompt-file", promptFile, "--cwd", cwd, "--output-format", "json",
      "--permission-mode", write ? "acceptEdits" : "plan", ...(rules ? ["--rules", rules] : []), ...(model ? ["-m", model] : [])],
    text: ({ out }) => { const j = wholeJson(out); return j?.result ?? j?.text ?? lastText(j) ?? ""; },
  },
  claude: {
    bins: ["claude"],
    argv: ({ write, model, prompt }) => ["-p", prompt, "--output-format", "json", "--permission-mode", write ? "acceptEdits" : "plan",
      ...(model ? ["--model", model] : [])],
    text: ({ out }) => lastJson(out)?.result ?? "",
    env: secondAccountEnv,
  },
});

/** The child env for a second Claude account: its own token or config dir, none of the hosting session's identity. */
export function secondAccountEnv(env, { tmpDir } = {}) {
  const token = env.APEX_CLAUDE_B_OAUTH_TOKEN, dir = env.APEX_CLAUDE_CONFIG_DIR;
  if (!token && !dir) throw new Error("claude needs APEX_CLAUDE_B_OAUTH_TOKEN or APEX_CLAUDE_CONFIG_DIR (the second account)");
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (/^(CLAUDE_|CLAUDECODE$|ANTHROPIC_|CCR_|APEX_CLAUDE_|APEX_CODEX_)/.test(k)) continue;
    out[k] = v;
  }
  if (dir) out.CLAUDE_CONFIG_DIR = dir;
  else { out.CLAUDE_CONFIG_DIR = path.join(tmpDir, "claude-b-config"); out.CLAUDE_CODE_OAUTH_TOKEN = token; }
  return out;
}

/** Codex child env: APEX_CODEX_HOME selects the sign-in directory; a saved auth.json seeds it once, mode 0600. */
export function codexEnv(env) {
  const home = env.APEX_CODEX_HOME || (env.APEX_CODEX_AUTH_JSON_B64 ? path.join(env.HOME || os.homedir(), ".codex-apex") : null);
  if (!home) return env;
  const auth = path.join(home, "auth.json");
  if (env.APEX_CODEX_AUTH_JSON_B64 && !fs.existsSync(auth)) {
    fs.mkdirSync(home, { recursive: true, mode: 0o700 });
    fs.writeFileSync(auth, Buffer.from(env.APEX_CODEX_AUTH_JSON_B64, "base64"), { mode: 0o600 });
  }
  const out = { ...env, CODEX_HOME: home };
  delete out.APEX_CODEX_AUTH_JSON_B64; delete out.APEX_CLAUDE_B_OAUTH_TOKEN;
  return out;
}

function lastJson(out) {
  for (const line of String(out).trim().split("\n").reverse()) { try { return JSON.parse(line); } catch { /* next line */ } }
  return null;
}
function wholeJson(out) {
  const s = String(out); const i = s.indexOf("{");
  if (i < 0) return null;
  try { return JSON.parse(s.slice(i)); } catch { return lastJson(out); }
}
/** Grok's json output nests the answer in message content blocks; take the last text block found. */
function lastText(node) {
  let found = null;
  const walk = (x) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") { if (typeof x.text === "string") found = x.text; Object.values(x).forEach(walk); }
  };
  walk(node);
  return found;
}

function spawnBounded(bin, argv, { cwd, input, timeoutMs, env }) {
  return new Promise((resolve) => {
    let out = "";
    let child;
    try { child = spawn(bin, argv, { cwd, env, stdio: [input == null ? "ignore" : "pipe", "pipe", "pipe"] }); }
    catch { resolve({ code: 127, out: "" }); return; }
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    const take = (d) => { if (out.length < 4 * 1024 * 1024) out += d; };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", () => { clearTimeout(timer); resolve({ code: 127, out }); });
    child.on("close", (code, sig) => { clearTimeout(timer); resolve({ code: sig ? 124 : (code ?? 1), out }); });
    if (input != null) child.stdin.end(input);
  });
}

/** One turn. `spawnImpl` is injected by the unit test; `tmpDir` holds the prompt and last-message files. */
export async function runVendor(vendor, { cwd, prompt, write = false, model = null, timeoutMs = 600000, env = process.env,
  spawnImpl = spawnBounded, tmpDir } = {}) {
  const r = RUNNERS[vendor];
  if (!r) throw new Error(`unknown vendor: ${vendor} (one of ${Object.keys(RUNNERS).join(", ")})`);
  if (!cwd || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error("--cwd must be an existing directory");
  if (typeof prompt !== "string" || !prompt.trim()) throw new Error("a prompt is required (--prompt or --prompt-file)");
  const dir = tmpDir || fs.mkdtempSync(path.join(cwd, ".vendor-run-"));
  const promptFile = path.join(dir, "prompt.txt");
  const lastFile = path.join(dir, `${vendor}-last.txt`);
  fs.writeFileSync(promptFile, prompt);
  const agents = path.join(cwd, "AGENTS.md");
  const rules = fs.existsSync(agents) ? fs.readFileSync(agents, "utf8").slice(0, 32768) : null;
  const ctx = { cwd: path.resolve(cwd), write, model, prompt, promptFile, lastFile, rules };
  const t0 = Date.now();
  let res = { code: 127, out: "" };
  try {
    const childEnv = r.env ? r.env(env, { tmpDir: dir }) : env;
    for (const bin of r.bins) {
      res = await spawnImpl(bin, r.argv(ctx), { cwd: ctx.cwd, input: r.stdin ? prompt : null, timeoutMs, env: childEnv });
      if (res.code !== 127) break;
    }
    const text = res.code === 127 ? "" : scrub(r.text({ ...ctx, out: res.out })).trim();
    return { vendor, ok: res.code === 0 && text.length > 0, code: res.code, ms: Date.now() - t0, write,
      text: text.slice(0, 8000), ...(res.code === 0 ? {} : { error: res.code === 127 ? "cli_not_found" : res.code === 124 ? "timeout" : scrub(res.out).slice(-400) }) };
  } finally {
    if (!tmpDir) fs.rmSync(dir, { recursive: true, force: true });
  }
}

const flag = (argv, name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };

export async function main(argv = process.argv.slice(2), deps = {}) {
  const which = argv[0];
  const file = flag(argv, "--prompt-file");
  const opts = { cwd: flag(argv, "--cwd"), prompt: file ? fs.readFileSync(file, "utf8") : flag(argv, "--prompt"),
    write: argv.includes("--write"), model: flag(argv, "--model") || null,
    timeoutMs: Number(flag(argv, "--timeout") || 600) * 1000, ...deps };
  const env = opts.env || process.env;
  const names = which === "all" ? Object.keys(RUNNERS).filter((n) => n !== "claude" || env.APEX_CLAUDE_CONFIG_DIR || env.APEX_CLAUDE_B_OAUTH_TOKEN) : [which];
  const rows = [];
  for (const n of names) { const row = await runVendor(n, opts); rows.push(row); if (deps.onRow) deps.onRow(row); }
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2), { onRow: (r) => console.log(JSON.stringify(r)) })
    .then((rows) => process.exit(rows.every((r) => r.ok) ? 0 : 1))
    .catch((e) => { console.error(scrub(e.message)); process.exit(2); });
}
