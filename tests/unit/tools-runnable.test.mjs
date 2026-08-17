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
import { spawn, spawnSync } from "node:child_process";
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

test("report-server: collects a POSTed bundle, and a hostile name cannot escape", async () => {
  // The one tool here that is a SERVER and takes a filename from the network,
  // so parse-only is not enough: the name arrives from the page, and the whole
  // point of the collector is that a phone never has to hold a file. Two things
  // are asserted — a bundle lands under artifacts/reports, and a traversal name
  // lands there TOO rather than wherever it asked for.
  const tmpRoot = path.join(ROOT, "artifacts", "tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });          // gitignored: absent in a fresh clone
  const dir = fs.mkdtempSync(path.join(tmpRoot, "reportsrv-"));
  // The tool refuses a root without a shell, and the ?report=1 injection has to
  // land at a real </body>.
  fs.writeFileSync(path.join(dir, "index.html"), "<html><body>hi</body></html>\n");

  const proc = spawn(process.execPath,
    [path.join(TOOLS, "report-server.mjs"), "--port", "0", "--host", "127.0.0.1", "--root", dir],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  try {
    // Take the port from what it PRINTS: the URLs are the tool's actual output
    // contract (they are what you type into a phone), and --port 0 keeps
    // parallel suites from colliding on a fixed number.
    const port = await new Promise((ok, fail) => {
      let buf = "";
      const t = setTimeout(() => fail(new Error("no URL printed in 15s: " + buf)), 15000);
      proc.stdout.on("data", (d) => {
        buf += d;
        const m = buf.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
        if (m) { clearTimeout(t); ok(Number(m[1])); }
      });
      proc.on("exit", (c) => { clearTimeout(t); fail(new Error(`exited ${c}: ${buf}`)); });
    });
    const base = `http://127.0.0.1:${port}`;

    const help = await fetch(`${base}/apex-report`);
    assert.equal(help.status, 200);
    assert.match(await help.text(), /collector/);

    // ?report=1 is the console-free path for a phone (iOS Safari has no console
    // without a Mac and a cable). It must be opt-in: an injected button in every
    // local page would end up in a screenshot review or a golden.
    const plain = await fetch(`${base}/`);
    assert.equal(await plain.text(), "<html><body>hi</body></html>\n", "plain shell must be byte-identical");
    const injected = await fetch(`${base}/?report=1`);
    const html = await injected.text();
    assert.match(html, /id="apexReportBtn"/);
    assert.match(html, /apexReportBtn[\s\S]*<\/body>/, "the button belongs inside body");
    assert.equal(Number(injected.headers.get("content-length")), Buffer.byteLength(html),
      "a rewritten body needs its own Content-Length");

    const body = JSON.stringify({ build: 1, backend: "three", verdict: ["ok"] });
    const post = (name) => fetch(`${base}/apex-report?file=${encodeURIComponent(name)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body });

    const good = await post("apex-report-1-three-x.json");
    assert.equal(good.status, 200);
    assert.equal((await good.json()).saved, "artifacts/reports/apex-report-1-three-x.json");

    const evil = await post("../../../../etc/pwned.json");
    assert.equal((await evil.json()).saved, "artifacts/reports/pwned.json",
      "a traversal name must be reduced to its basename");

    // The collector writes under the SERVED root, so the files are in the temp dir.
    const landed = fs.readdirSync(path.join(dir, "artifacts", "reports")).sort();
    assert.deepEqual(landed, ["apex-report-1-three-x.json", "pwned.json"]);
    assert.equal(fs.existsSync(path.join(dir, "index.html")), true);
  } finally {
    proc.kill("SIGKILL");
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
