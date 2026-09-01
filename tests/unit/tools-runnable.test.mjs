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

test("no tool derives a path from import.meta.url.pathname (Windows-broken)", () => {
  // `new URL("..", import.meta.url).pathname` is `/D:/a/repo/` on Windows, and
  // path.resolve() then prefixes the cwd's drive to give a path that cannot
  // exist. tools/gpu-game-check.mjs is the one tool the GPU-census workflow runs
  // on windows-latest, and this cost it every request 404ing, the game never
  // booting, and a 5-minute timeout that reported nothing — twice, because the
  // first diagnosis blamed the machine and raised the timeout.
  // It also mishandles percent-encoding, so a checkout path containing a space
  // breaks the same way on Linux. fileURLToPath is correct everywhere.
  const bad = [];
  for (const f of FILES) {
    if (![".mjs", ".cjs", ".js"].includes(f.ext)) continue;
    if (/import\.meta\.url\s*\)\s*\.pathname/.test(fs.readFileSync(f.abs, "utf8"))) bad.push(f.rel);
  }
  assert.deepEqual(bad, [],
    `these tools derive a path from import.meta.url .pathname:\n  ${bad.join("\n  ")}\n\n` +
    `Use fileURLToPath instead:\n` +
    `  import { fileURLToPath } from "node:url";\n` +
    `  const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\\\/]$/, "");\n` +
    `Reason: docs/PERF-FINDINGS.md 2f.`);
});

// Comments must NOT be scanned. Every ban below has to be explainable in prose
// beside the code that enforces it, and a scanner that matches its own
// documentation is useless twice over: it fires on the comment describing the
// bug, and — worse — a check written to confirm a fix was removed reports
// success because the fix's COMMENT still quotes it. That happened in this
// session, on this very idiom, while verifying the sabotage below.
function stripComments(src) {
  return src
    .replace(/\/\*[^]*?\*\//g, " ")   // block comments (JSDoc, banners)
    .replace(/^[ \t]*\/\/.*$/gm, " ") // whole-line // comments
    .replace(/([^:"'`\\])\/\/.*$/gm, "$1"); // trailing // comments
}

test("the comment stripper actually strips (or every ban below is vacuous)", () => {
  // The stripper is load-bearing for the ratchet that follows, so it gets its
  // own proof rather than being taken on trust.
  const src = [
    '// (a.b || 0) > 0',
    '/* (c.d || 0) > 0 */',
    'const x = 1; // (e.f || 0) > 0',
    'const keep = (g.h || 0) > 0;',
  ].join("\n");
  const out = stripComments(src);
  assert.equal((out.match(/\|\| 0\) > 0/g) || []).length, 1,
    `the stripper left commented code behind:\n${out}`);
  assert.match(out, /const keep = \(g\.h \|\| 0\) > 0;/, "the stripper ate real code");
});

// `(x || 0) > 0` cannot tell "measured zero" from "measured nothing", and in a
// TOOL or a WORKFLOW that comparison IS the verdict. Two shipped defects had
// exactly this shape: `(gfx.gpuErrors || 0) > 0` passed vacuously on the GLX
// leg from the day that leg was added, and `(env.fail || 0) > 0` sat twelve
// lines below the comment explaining the first one, on the same object.
// docs/PERF-FINDINGS.md 2e, 2j.
//
// Deliberately NOT applied to js/: `(ctx.speed || 0) > 0` in js/game/ai-drive.js
// is a gameplay predicate on a state object that genuinely defaults to zero, not
// a reading from an instrument. Banning it there would be noise, and a noisy ban
// gets widened or ignored — which is how this class survived in the first place.
const COERCED_VERDICT = /\(\s*[A-Za-z_$][A-Za-z0-9_$.]*(\([^()]*\))?\s*(\|\||\?\?)\s*0\s*\)\s*(>=|>|<=|<|!==|!=|===|==)\s*0/;

// Frozen count, the module-size ratchet idiom: existing entries are tolerated
// and named, new ones are the defect. Shrinking this is progress.
const COERCED_TOLERATED = {
  // `(d.cost || 0) > 0` over the parts CATALOG — product data this repo owns,
  // read from a loaded module, not a reading taken from a running system. A
  // part with no `cost` field costs nothing, so absent and zero are the same
  // fact and the coercion states it rather than hiding it. Nothing downstream
  // reports a verdict about whether the measurement happened.
  "parts-ladder.mjs": 1,
};

test("no tool decides a verdict by comparing a coerced measurement to zero", () => {
  const bad = [];
  for (const f of FILES) {
    if (![".mjs", ".cjs", ".js"].includes(f.ext)) continue;
    const lines = stripComments(fs.readFileSync(f.abs, "utf8")).split("\n");
    const hits = lines.map((l, i) => (COERCED_VERDICT.test(l) ? `${f.rel}:${i + 1}: ${l.trim()}` : null)).filter(Boolean);
    const allowed = COERCED_TOLERATED[f.rel] || 0;
    if (hits.length > allowed) bad.push(...hits.slice(allowed));
  }
  assert.deepEqual(bad, [],
    `these tools coerce a measurement and then compare it to zero:\n  ${bad.join("\n  ")}\n\n` +
    `An absent reading is not a zero reading. Test for absence first:\n` +
    `  if (x == null) fail("NO count reported — this check would pass vacuously");\n` +
    `  else if (x > 0) fail(...);\n` +
    `Reason: docs/PERF-FINDINGS.md 2e, 2j.`);
});

test("no workflow decides a gate by comparing a coerced measurement to zero", () => {
  // Hard zero, no tolerated list: a comparison in a workflow is always a gate.
  const dir = path.join(ROOT, ".github/workflows");
  const wfs = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  // Corpus floor, same reasoning as the tools walk above: a silent empty list
  // proves nothing, and this one reads a directory the tools walk never enters.
  assert.ok(wfs.length >= 3, `expected the workflow set, found ${wfs.length}`);
  assert.ok(wfs.includes("gpu-census.yml"), "gpu-census.yml missing from the walk");

  const bad = [];
  for (const w of wfs) {
    const lines = stripComments(fs.readFileSync(path.join(dir, w), "utf8")).split("\n");
    lines.forEach((l, i) => { if (COERCED_VERDICT.test(l)) bad.push(`.github/workflows/${w}:${i + 1}: ${l.trim()}`); });
  }
  assert.deepEqual(bad, [],
    `these workflow gates coerce a measurement and then compare it to zero:\n  ${bad.join("\n  ")}\n\n` +
    `Absence must fail, not read as clean. Reason: docs/PERF-FINDINGS.md 2e, 2j.`);
});

test("the coerced-verdict ceiling has not been left far above the real count", () => {
  // The other failure mode, copied from tests/unit/silent-catch.test.mjs: fix
  // the last instance, never lower the ceiling, and the ratchet silently stops
  // ratcheting. Every tolerated entry must still be earning its slot.
  const slack = [];
  for (const [rel, allowed] of Object.entries(COERCED_TOLERATED)) {
    // Keys are tools-relative, the same shape the walk above produces — resolve
    // through FILES so a renamed or deleted tool fails here instead of leaving
    // a permanent free pass behind.
    const f = FILES.find((x) => x.rel === rel);
    assert.ok(f, `${rel} is tolerated but the walk no longer sees it — drop the entry`);
    const lines = stripComments(fs.readFileSync(f.abs, "utf8")).split("\n");
    const n = lines.filter((l) => COERCED_VERDICT.test(l)).length;
    if (n < allowed) slack.push(`${rel}: ${n} left but ${allowed} tolerated — lower it to ${n}`);
  }
  assert.deepEqual(slack, [], "a tolerated count drifted above its file — lower it");
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

test("cloud-agent install is offline-tolerant (npm ECONNRESET must not fail a usable snapshot)", () => {
  const browsers = fs.readFileSync(path.join(TOOLS, "install-browsers.sh"), "utf8");
  const cloud = fs.readFileSync(path.join(TOOLS, "cloud-agent-install.sh"), "utf8");
  assert.match(browsers, /--no-audit/);
  assert.match(browsers, /--prefer-offline/);
  assert.match(browsers, /node_modules\/playwright\/package\.json/);
  assert.match(browsers, /node_modules\/playwright\/cli\.js/);
  assert.match(browsers, /Exit handler never called/);
  assert.doesNotMatch(browsers, /^set -e/m);
  assert.match(cloud, /mesa-vulkan-drivers/);
  assert.match(cloud, /install-browsers\.sh/);
  assert.match(cloud, /\/opt\/google\/chrome\/chrome/);
  assert.match(cloud, /node_modules\/playwright\/package\.json/);
  assert.doesNotMatch(cloud, /^set -e/m);
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
    { cmd: "bash", args: [path.join(TOOLS, "apex-tools-mcp.sh"), "help"], want: /apex_/ },
    { cmd: "bash", args: [path.join(TOOLS, "apex-tools-mcp.sh"), "help"], want: /smoke/ },
    { cmd: process.execPath, args: [path.join(TOOLS, "mcp-smoke.mjs"), "--help"], want: /Never wraps test-bg/ },
    { cmd: "bash", args: [path.join(TOOLS, "playwright-mcp.sh"), "help"], want: /browser_resize/ },
    { cmd: "bash", args: [path.join(TOOLS, "playwright-mcp.sh"), "help"], want: /css-play\.mjs/ },
    { cmd: process.execPath, args: [path.join(TOOLS, "css-play.mjs"), "--help"], want: /hot-swap|hot swap/i },
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

test("playwright-mcp.sh help and status exit 0 without launching Chromium", () => {
  const help = spawnSync("bash", [path.join(TOOLS, "playwright-mcp.sh"), "help"],
    { encoding: "utf8", cwd: ROOT, timeout: 15000 });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /@playwright\/mcp@0\.0\.79/);
  assert.match(help.stdout, /browser_evaluate/);
  assert.match(help.stdout, /css-play\.mjs/);
  assert.match(help.stdout, /\bdom\b/);
  const st = spawnSync("bash", [path.join(TOOLS, "playwright-mcp.sh"), "status"],
    { encoding: "utf8", cwd: ROOT, timeout: 15000 });
  assert.equal(st.status, 0, st.stderr);
  assert.match(st.stdout, /Package:/);
  assert.doesNotMatch(st.stdout, /0\.0\.0\.0/);
});

test("chrome-devtools-mcp.sh help exits 0 without requiring Chromium", () => {
  // help used to run after detect_chrome() at script load, so a Mac without
  // /opt/pw-browsers died before printing usage. Detect belongs in run/verify.
  const r = spawnSync("bash", [path.join(TOOLS, "chrome-devtools-mcp.sh"), "help"],
    { encoding: "utf8", cwd: ROOT, timeout: 30000 });
  const text = `${r.stdout}\n${r.stderr}`;
  assert.equal(r.status, 0, text);
  assert.match(text, /clone/);
  assert.match(text, /status/);
});

test("self-booting capture/physics tools use harness.mjs, not a subprocess server", () => {
  // These were the last holdouts: python -m http.server / npx serve + a
  // sleep, or a pinned /opt/pw-browsers path. harness.mjs is the
  // teardown-safe server+Chromium pair every other tool uses.
  const files = [
    "survey-track.mjs",
    "capture/shot.mjs",
    "measure-props-over-road.mjs",
    "car/carshot.mjs",
    "career-economy.mjs",
    "check-physics.mjs",
    "net/rtc-e2e.mjs",
    "net/rtc-e2e-3p.mjs",
    "net/rtc-e2e-room.mjs",
    "profile-gameloop.mjs",
    "capture/apex-capture.mjs",
    "capture/motion-capture.mjs",
    "lighting/ab-lighting.mjs",
    "quick-validate.mjs",
    "css-play.mjs",
  ];
  const bad = [];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(TOOLS, rel), "utf8");
    if (!/from ["']\.\.\/harness\.mjs["']|from ["']\.\/harness\.mjs["']/.test(src))
      bad.push(`${rel}: missing harness.mjs import`);
    if (/spawn\(\s*["']python3["']/.test(src) || /spawn\(\s*["']npx["']/.test(src))
      bad.push(`${rel}: still spawns a subprocess server`);
    if (/chromium-1194/.test(src))
      bad.push(`${rel}: pinned chromium-1194 path`);
  }
  assert.deepEqual(bad, []);
});

test("no tool pins a Linux-only Chromium path as executablePath", () => {
  // rtc-e2e used to die on a Mac with executablePath: "/opt/pw-browsers/chromium".
  // The ladder lives in harness.mjs; everyone else must go through it.
  const pinned = [];
  for (const f of FILES) {
    if (![".mjs", ".cjs", ".js"].includes(f.ext)) continue;
    if (f.rel === "harness.mjs") continue;
    const src = fs.readFileSync(f.abs, "utf8");
    if (/executablePath:\s*["']\/opt\/pw-browsers\/chromium/.test(src))
      pinned.push(f.rel);
  }
  assert.deepEqual(pinned, []);
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
    const printedURL = await new Promise((ok, fail) => {
      let buf = "";
      const t = setTimeout(() => fail(new Error("no URL printed in 15s: " + buf)), 15000);
      proc.stdout.on("data", (d) => {
        buf += d;
        const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\/\?report=1&token=[A-Za-z0-9_%.-]+/);
        if (m) { clearTimeout(t); ok(new URL(m[0])); }
      });
      proc.on("exit", (c) => { clearTimeout(t); fail(new Error(`exited ${c}: ${buf}`)); });
    });
    const base = printedURL.origin;
    const token = printedURL.searchParams.get("token");
    const authorised = (pathname) => {
      const url = new URL(pathname, base);
      url.searchParams.set("token", token);
      return url;
    };

    assert.equal((await fetch(`${base}/apex-report`)).status, 403,
      "the LAN collector must not accept unauthenticated reads");
    const help = await fetch(authorised("/apex-report"));
    assert.equal(help.status, 200);
    assert.match(await help.text(), /collector/);

    // ?report=1 is the console-free path for a phone (iOS Safari has no console
    // without a Mac and a cable). It must be opt-in: an injected button in every
    // local page would end up in a screenshot review or a golden.
    const plain = await fetch(authorised("/"));
    assert.equal(await plain.text(), "<html><body>hi</body></html>\n", "plain shell must be byte-identical");
    const injected = await fetch(authorised("/?report=1"));
    const html = await injected.text();
    assert.match(html, /id="apexReportBtn"/);
    assert.match(html, /apexReportBtn[\s\S]*<\/body>/, "the button belongs inside body");
    assert.equal(Number(injected.headers.get("content-length")), Buffer.byteLength(html),
      "a rewritten body needs its own Content-Length");

    const body = JSON.stringify({ build: 1, backend: "three", verdict: ["ok"] });
    const post = (name) => {
      const url = authorised("/apex-report");
      url.searchParams.set("file", name);
      return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    };

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

test("apex-report never serializes credentials or URL capabilities", () => {
  const src = fs.readFileSync(path.join(TOOLS, "apex-report.js"), "utf8");
  assert.doesNotMatch(src, /Object\.keys\(localStorage\)/,
    "new apex26.* keys must be excluded unless explicitly approved for diagnostics");
  const allowlist = /const STORAGE_KEYS = \[([\s\S]*?)\];/.exec(src);
  assert.ok(allowlist, "diagnostic storage must use an explicit allowlist");
  assert.doesNotMatch(allowlist[1], /spotify|turn|token|verifier|credential/i,
    "OAuth and relay credentials must never enter a report");
  assert.match(src, /location\.origin \+ location\.pathname/);
  assert.doesNotMatch(src, /href:\s*location\.href/,
    "query and fragment capabilities must not enter a report");
});

test("aerial-survey.mjs is folded into survey-track --oblique", async () => {
  assert.equal(fs.existsSync(path.join(TOOLS, "aerial-survey.mjs")), false,
    "aerial-survey.mjs must be gone — its N/E/S/W obliques live on survey-track --oblique");
  const src = fs.readFileSync(path.join(TOOLS, "survey-track.mjs"), "utf8");
  assert.match(src, /--oblique/);
  assert.match(src, /oblique\$\{name\}/);
  assert.match(src, /dirs = \{ N: 0, E:/);
  const { parseSurveyTrackArgs } = await import("../../tools/survey-track.mjs");
  const mid = parseSurveyTrackArgs(["monaco", "--oblique", "0.1,0.5"]);
  assert.equal(mid.id, "monaco");
  assert.equal(mid.label, "survey");
  assert.deepEqual(mid.fracs, [0.1, 0.5]);
  assert.equal(mid.oblique, true);
  const front = parseSurveyTrackArgs(["--oblique", "monaco", "0.1,0.5"]);
  assert.deepEqual(front.fracs, [0.1, 0.5]);
  const labeled = parseSurveyTrackArgs(["monaco", "before", "0.1,0.5", "--oblique"]);
  assert.equal(labeled.label, "before");
  assert.deepEqual(labeled.fracs, [0.1, 0.5]);
});

test("capture/shot.mjs clips the canvas instead of locator.screenshot", () => {
  // locator.screenshot waits for element stability; a continuously-animating
  // WebGL canvas never settles, so orbit/eye shots timed out (~30 s). survey-track
  // already uses page.screenshot({ clip: canvas box }) for the same reason.
  const src = fs.readFileSync(path.join(TOOLS, "capture", "shot.mjs"), "utf8");
  assert.match(src, /boundingBox\(\)/);
  assert.match(src, /timeout:\s*60000/);
  const callers = [...src.matchAll(/(\w+)\.screenshot\(/g)].map((m) => m[1]);
  assert.ok(callers.length && callers.every((n) => n === "page"),
    `screenshot callers must be page, got: ${callers.join(",")}`);
  assert.match(src, /from ["']\.\.\/harness\.mjs["']/);
});

test("ui-survey.mjs is a layout-audit recipe, not a second Playwright probe", async () => {
  const src = fs.readFileSync(path.join(TOOLS, "ui-survey.mjs"), "utf8");
  assert.match(src, /layout-audit\.mjs/);
  assert.match(src, /ios-iphone-landscape/);
  assert.doesNotMatch(src, /from ["']\.\/harness\.mjs["']/,
    "the alias must not boot its own Chromium — layout-audit already does");
  const { buildLayoutAuditArgs } = await import("../../tools/ui-survey.mjs");
  const def = buildLayoutAuditArgs([]);
  assert.ok(def.some((a) => a.startsWith("--screens=title,select,garage")));
  assert.ok(def.includes("--viewports=ios-iphone-landscape"));
  assert.ok(def.includes("--jobs=1"));
  const over = buildLayoutAuditArgs(["--screens=title", "--viewports=desktop-1280x800", "--jobs=4"]);
  assert.equal(over.filter((a) => a.startsWith("--screens=")).length, 1);
  assert.ok(over.includes("--screens=title"));
  assert.ok(over.includes("--viewports=desktop-1280x800"));
  assert.ok(over.includes("--jobs=4"));
  assert.ok(!over.includes("--jobs=1"));
});

test("wgx-gallery.mjs forwards to wgx-shot --gallery", () => {
  const src = fs.readFileSync(path.join(TOOLS, "wgx-gallery.mjs"), "utf8");
  assert.match(src, /wgx-shot\.mjs/);
  assert.match(src, /--gallery/);
  const shot = fs.readFileSync(path.join(TOOLS, "wgx-shot.mjs"), "utf8");
  assert.match(shot, /export async function runWgxShot/);
  assert.match(shot, /export async function runWgxGallery/);
  assert.match(shot, /export const WGX_GALLERY_SHOTS/);
  assert.doesNotMatch(shot, /locator\(["']#game["']\)\.screenshot/);
  assert.match(shot, /page\.screenshot\(\s*\{\s*path[^}]*clip/);
});
