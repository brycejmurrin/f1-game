/* tools-runnable.test.mjs — every tool must at least PARSE, and the tool
 * surface an agent reaches through MCP must answer.
 *
 * docs-integrity.test.mjs guards the tools/README index in both directions, so
 * a tool cannot be undocumented and a row cannot be a ghost. Neither direction
 * says the file RUNS. A tool with a syntax error is indexed, documented, and
 * completely inaccessible — and the failure surfaces only when someone reaches
 * for it mid-task, which is the worst moment to discover it. Measured
 * 2026-08-17: a backtick inside a comment in a WGSL template literal took a
 * whole module out, and only a hand-run `bash -n` caught a shell edit.
 *
 * PARSE ONLY for the general sweep — these tools launch browsers, write
 * captures and hit networks, so executing them here would be its own outage.
 * The few entry points with a side-effect-free help path are exercised for real.
 *
 * Run: node --test tests/unit/tools-runnable.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TOOLS = path.join(ROOT, "tools");

function toolFiles() {
  const out = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      // tools/_*.mjs is transient agent scratch by convention (.gitignore).
      if (e.name.startsWith("_") || e.name === "__pycache__") continue;
      const abs = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(abs, r);
      else out.push({ abs, rel: r, ext: path.extname(e.name) });
    }
  };
  walk(TOOLS, "");
  return out;
}

const FILES = toolFiles();

test("the sweep sees the whole tools tree (a silent empty list proves nothing)", () => {
  assert.ok(FILES.length >= 70, `expected the full tool set, walked ${FILES.length}`);
  for (const name of ["mcp-cli.mjs", "tinyfish-mcp.sh", "manifest.cjs"]) {
    assert.ok(FILES.some((f) => f.rel.endsWith(name)), `${name} missing from the walk`);
  }
});

test("every JS tool parses (node --check)", () => {
  const broken = [];
  for (const f of FILES) {
    if (![".mjs", ".cjs", ".js"].includes(f.ext)) continue;
    const r = spawnSync(process.execPath, ["--check", f.abs], { encoding: "utf8" });
    if (r.status !== 0) broken.push(`${f.rel}: ${(r.stderr || "").split("\n").find((l) => l.includes("Error")) || "exit " + r.status}`);
  }
  assert.deepEqual(broken, [], "a JS tool does not parse");
});

test("every shell tool parses (bash -n)", () => {
  const broken = [];
  for (const f of FILES) {
    if (f.ext !== ".sh") continue;
    const r = spawnSync("bash", ["-n", f.abs], { encoding: "utf8" });
    if (r.status !== 0) broken.push(`${f.rel}: ${(r.stderr || "").trim().split("\n")[0]}`);
  }
  assert.deepEqual(broken, [], "a shell tool does not parse");
});

test("every python tool parses (compile)", () => {
  const broken = [];
  for (const f of FILES) {
    if (f.ext !== ".py") continue;
    const r = spawnSync("python3", ["-c",
      "import ast,sys; ast.parse(open(sys.argv[1]).read(), sys.argv[1])", f.abs], { encoding: "utf8" });
    if (r.status !== 0) broken.push(`${f.rel}: ${(r.stderr || "").trim().split("\n").pop()}`);
  }
  assert.deepEqual(broken, [], "a python tool does not parse");
});

test("every JSON asset in tools/ parses", () => {
  const broken = [];
  for (const f of FILES) {
    if (f.ext !== ".json") continue;
    try { JSON.parse(fs.readFileSync(f.abs, "utf8")); }
    catch (e) { broken.push(`${f.rel}: ${e.message}`); }
  }
  assert.deepEqual(broken, [], "a JSON asset in tools/ does not parse");
});

test("the MCP-facing entry points answer without touching a browser or a network", () => {
  // These are what an agent reaches for first; a help path that throws reads as
  // "the tool is gone". Each is side-effect-free by construction.
  const cases = [
    { cmd: process.execPath, args: [path.join(TOOLS, "mcp-cli.mjs"), "--help"], want: /probe/ },
    { cmd: process.execPath, args: [path.join(TOOLS, "mcp-cli.mjs"), "probe", "--dry-run"], want: /new_page/ },
    { cmd: "bash", args: [path.join(TOOLS, "tinyfish-mcp.sh"), "help"], want: /deploy-check/ },
    { cmd: "python3", args: [path.join(TOOLS, "probe-mcp.py"), "help"], want: /chrome_/ },
    // Prefer an explicit path so the assertion is independent of a clean vs
    // dirty checkout. `--help` also answers without git (see pick-tests.mjs);
    // either shape is fine — the path form also exercises RULES → test:tlx.
    { cmd: process.execPath, args: [path.join(TOOLS, "pick-tests.mjs"), "js/render/three/tlx.js"],
      want: /test:tlx/ },
    { cmd: process.execPath, args: [path.join(TOOLS, "pick-tests.mjs"), "--help"],
      want: /group|test:/ },
    { cmd: process.execPath, args: [path.join(TOOLS, "wgx-validate.mjs"), "--static"],
      want: /"static": true/ },
  ];
  const failed = [];
  for (const c of cases) {
    const r = spawnSync(c.cmd, c.args, { encoding: "utf8", cwd: ROOT, timeout: 30000 });
    const text = `${r.stdout || ""}\n${r.stderr || ""}`;
    if (r.status !== 0) failed.push(`${path.basename(c.args[0])}: exit ${r.status}`);
    else if (!c.want.test(text)) failed.push(`${path.basename(c.args[0])}: output missing ${c.want}`);
  }
  assert.deepEqual(failed, [], "an MCP-facing entry point does not answer");
});

test("chrome-devtools-mcp.sh reports its state without launching Chrome", () => {
  // `status` is the one command that must work on a box where the local clone
  // was never built — it is how you find out that is the case.
  const r = spawnSync("bash", [path.join(TOOLS, "chrome-devtools-mcp.sh"), "status"],
    { encoding: "utf8", cwd: ROOT, timeout: 30000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Chrome:/);
  assert.match(r.stdout, /Bin:/);
});
