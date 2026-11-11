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
 * `claude` runs the Claude CLI under ANOTHER account: APEX_CLAUDE_CONFIG_DIR names that account's config directory
 * (`CLAUDE_CONFIG_DIR=<dir> claude auth login` once), and every variable of the hosting session (CLAUDE_CODE_*,
 * CLAUDECODE, ANTHROPIC_*) is dropped so the child never inherits the host's identity. Without it `claude` is refused.
 */
import fs from "node:fs";
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

/** The child env for a second Claude account: its own config dir, none of the hosting session's identity. */
export function secondAccountEnv(env) {
  const dir = env.APEX_CLAUDE_CONFIG_DIR;
  if (!dir) throw new Error("claude needs APEX_CLAUDE_CONFIG_DIR (the second account's config directory)");
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (/^(CLAUDE_CODE_|CLAUDECODE$|CLAUDE_|ANTHROPIC_|CCR_|APEX_CLAUDE_)/.test(k)) continue;
    out[k] = v;
  }
  out.CLAUDE_CONFIG_DIR = dir;
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
    const childEnv = r.env ? r.env(env) : env;
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
  const names = which === "all" ? Object.keys(RUNNERS).filter((n) => n !== "claude" || env.APEX_CLAUDE_CONFIG_DIR) : [which];
  const rows = [];
  for (const n of names) { const row = await runVendor(n, opts); rows.push(row); if (deps.onRow) deps.onRow(row); }
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2), { onRow: (r) => console.log(JSON.stringify(r)) })
    .then((rows) => process.exit(rows.every((r) => r.ok) ? 0 : 1))
    .catch((e) => { console.error(scrub(e.message)); process.exit(2); });
}
