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
 *   Add --parallel to all to start every vendor at once, printing as each finishes; incompatible with --write.
 *   node tools/ci/vendor-run.mjs <vendor> --cwd DIR --prompt "…" --write --verify "node --test t.mjs"
 * `--verify CMD` runs `bash -c CMD` in DIR after a turn that exited 0 and adds `verify: { code, tail }`; ok then
 * decides ok (exit 0 and verify 0), so the runner proves the work instead of trusting the agent. A runner's optional
 * `note({out})` adds `note` to the row; without verify, ok needs exit 0, non-empty text and no note. A `--write` run adds `changed`:
 * the count of `git status --porcelain` lines in DIR (null when git fails).
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
import { codexHome, scrub } from "./vendor-doctor.mjs";

const GROK_GUARD = "Never describe a file, symbol or result you have not read in this run. If something the task names does not exist, say so and stop.";

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
      ...(write ? ["--sandbox", "enabled"] : ["--mode", "ask"]), ...(model ? ["--model", model] : []), prompt],
    text: ({ out }) => lastJson(out)?.result ?? "",
  },
  grok: {
    bins: ["grok"],
    argv: ({ cwd, write, model, promptFile, rules }) => ["--prompt-file", promptFile, "--cwd", cwd, "--output-format", "json",
      "--permission-mode", write ? "acceptEdits" : "plan", ...(write ? ["--allow", "Edit", "--allow", "Write"] : []),
      "--rules", `${GROK_GUARD}\n\n${rules ?? ""}`, ...(model ? ["-m", model] : [])],
    // The text is kept even when the run ended `cancelled` (an approval a headless run cannot give); `note` flags it.
    text: ({ out }) => { const j = wholeJson(out); return j?.result ?? j?.text ?? lastText(j) ?? ""; },
    note: ({ out }) => wholeJson(out)?.stopReason === "cancelled" ? "cancelled: a step needed an approval a headless run cannot give" : null,
    // Grok Build reads XAI_API_KEY; the cloud environment stores the same key as GROK_API_KEY.
    env: (env) => (env.XAI_API_KEY || !env.GROK_API_KEY ? env : { ...env, XAI_API_KEY: env.GROK_API_KEY }),
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
  const home = codexHome(env);
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
  const s = String(out); const i = s.indexOf("{"), k = s.lastIndexOf("}");
  if (i < 0 || k < i) return null;
  try { return JSON.parse(s.slice(i, k + 1)); } catch { return lastJson(out); }
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
  spawnImpl = spawnBounded, tmpDir, verify = null } = {}) {
  const r = RUNNERS[vendor];
  if (!r) throw new Error(`unknown vendor: ${vendor} (one of ${Object.keys(RUNNERS).join(", ")})`);
  if (!cwd || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error("--cwd must be an existing directory");
  if (typeof prompt !== "string" || !prompt.trim()) throw new Error("a prompt is required (--prompt or --prompt-file)");
  const dir = tmpDir || fs.mkdtempSync(path.join(os.tmpdir(), "vendor-run-"));
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
    const ms = Date.now() - t0;
    const extra = {};
    if (write) {
      const st = await spawnImpl("git", ["status", "--porcelain"], { cwd: ctx.cwd, input: null, timeoutMs: 30000, env });
      extra.changed = st.code === 0 ? String(st.out).split("\n").filter((l) => l.trim()).length : null;
    }
    if (verify && res.code === 0) {
      const v = await spawnImpl("bash", ["-c", verify], { cwd: ctx.cwd, input: null, timeoutMs: 300000, env });
      extra.verify = { code: v.code, tail: scrub(v.out).slice(-300) };
    }
    const note = res.code === 127 || !r.note ? null : r.note({ ...ctx, out: res.out });
    const ok = res.code === 0 && (extra.verify ? extra.verify.code === 0 : text.length > 0 && !note);
    return { vendor, ok, code: res.code, ms, write, text: text.slice(0, 8000), ...extra, ...(note ? { note } : {}),
      ...(res.code === 0 ? {} : { error: res.code === 127 ? "cli_not_found" : res.code === 124 ? "timeout" : scrub(res.out).slice(-400) }) };
  } finally {
    if (!tmpDir) fs.rmSync(dir, { recursive: true, force: true });
  }
}

const flag = (argv, name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };

export async function main(argv = process.argv.slice(2), deps = {}) {
  const which = argv[0];
  const parallel = argv.includes("--parallel");
  if (parallel && argv.includes("--write")) throw new Error("--parallel cannot be combined with --write: agents would edit the same directory");
  const file = flag(argv, "--prompt-file");
  const opts = { cwd: flag(argv, "--cwd"), prompt: file ? fs.readFileSync(file, "utf8") : flag(argv, "--prompt"),
    write: argv.includes("--write"), model: flag(argv, "--model") || null, verify: flag(argv, "--verify") || null,
    timeoutMs: Number(flag(argv, "--timeout") || 600) * 1000, ...deps };
  const env = opts.env || process.env;
  const names = which === "all" ? Object.keys(RUNNERS).filter((n) => n !== "claude" || env.APEX_CLAUDE_CONFIG_DIR || env.APEX_CLAUDE_B_OAUTH_TOKEN) : [which];
  if (which === "all" && parallel) return Promise.all(names.map(async (n) => {
    const row = await runVendor(n, opts); if (deps.onRow) deps.onRow(row); return row;
  }));
  const rows = [];
  for (const n of names) { const row = await runVendor(n, opts); rows.push(row); if (deps.onRow) deps.onRow(row); }
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2), { onRow: (r) => console.log(JSON.stringify(r)) })
    .then((rows) => process.exit(rows.every((r) => r.ok) ? 0 : 1))
    .catch((e) => { console.error(scrub(e.message)); process.exit(2); });
}
