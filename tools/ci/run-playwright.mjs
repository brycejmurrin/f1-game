#!/usr/bin/env node
// Launch Playwright on an automatically allocated port so independent npm test
// @doc The engine behind every `npm run test:*`: a free port + port-suffixed report paths so runs never share a server.
// @section runner
// commands can run concurrently without sharing a web server or artifact paths.

import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, createReadStream, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { extname, join, resolve as resolvePath, sep } from "node:path";
import { partitionArgs } from "./twinned-specs.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  // ES modules (vendor/rapier-0.19.3, vendor/three-0.185.1): Chromium enforces
  // a JavaScript MIME type for module scripts — octet-stream imports are
  // rejected outright, so .mjs must be mapped or dynamic import() fails.
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

function startStaticServer() {
  return new Promise((done, reject) => {
    const root = resolvePath(ROOT) + sep;
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url || "/", "http://127.0.0.1");
        const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
        const file = resolvePath(ROOT, `.${decodeURIComponent(pathname)}`);
        if (!file.startsWith(root)) {
          res.writeHead(403).end("forbidden");
          return;
        }
        const stat = statSync(file);
        if (!stat.isFile()) throw new Error("not a file");
        res.writeHead(200, {
          "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
          "Content-Length": stat.size,
          "Cache-Control": "no-store",
        });
        const stream = createReadStream(file);
        stream.on("error", () => res.destroy());
        res.on("error", () => stream.destroy());
        res.on("close", () => {
          if (!res.writableEnded) stream.destroy();
        });
        stream.pipe(res);
      } catch {
        res.writeHead(404).end("not found");
      }
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      done({ server, port: server.address().port });
    });
  });
}

// A spec with a VM twin does not run here unless asked (--with-twinned /
// APEX_WITH_TWINNED=1): tools/ci/twinned-specs.mjs partitionArgs, the local
// half of the substitution the selected gate has made since the twins landed.
const { args, dropped, nothingToRun } = partitionArgs(process.argv.slice(2));
for (const d of dropped) console.error(`[playwright] COVERED BY VM TWIN: ${d.spec} → ${d.twin}`);

// THE TWIN RUNS HERE, IN NODE. The first cut merely NAMED it and skipped it,
// and for a fully twinned group that printed `= run passed  (0/0 done, 0 failed)` —
// the exact line AGENTS.md rule 5 tells every agent and every tool to anchor
// on — for a run that had executed nothing at all. `collisions` is 32/32
// twinned, so `node tools/ci/test-bg.mjs collisions` reported a green gate
// while testing zero lines of the contact solver, and the twins are in
// test:game-vm rather than test:tooling-fast, so the cheap local gate did not
// cover them either. Both local gates said yes and neither had looked.
//
// Nothing was WRONG with the substitution: twinned-specs.verify() proves every
// twin sits in a group the Pages gate runs unconditionally, so CI never lost
// the coverage. What was wrong was the LOCAL verdict line, which claimed a
// pass it had not earned. So run the twins rather than name them: it is the
// same assertions in seconds instead of SwiftShader minutes, which is the
// trade the substitution was already making — just completed, so the group
// command means "these assertions ran" again.
//
// They go FIRST and they fail fast: a red twin ends the run before a browser
// starts, because paying 10-40 minutes of SwiftShader to confirm a failure
// node found in one second is the worst trade this repository can make.
if (dropped.length && !args.includes("--list")) {
  const twins = [...new Set(dropped.map((d) => d.twin))];
  console.error(`[playwright] running ${twins.length} VM twin(s) in node — same assertions, no browser`);
  // TAP by name, and NODE_TEST_CONTEXT out of the environment. Both are for
  // the nested case: when this runner is itself spawned from inside a
  // `node --test` process, node sees that variable and switches the CHILD to
  // the v8-serialized reporter, so the `# pass` summary parsed below is simply
  // absent — which is how the regression test for this block first failed, by
  // reproducing the very 0/0 it exists to forbid.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...twins],
    { cwd: ROOT, encoding: "utf8", env });
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  const num = (re) => { const m = re.exec(r.stdout || ""); return m ? +m[1] : null; };
  const failed = num(/^# fail (\d+)$/m), passed = num(/^# pass (\d+)$/m);
  // A PASS MUST HAVE RUN SOMETHING. If the summary could not be read, the
  // honest verdict is failure, not a zero-count green — an unparseable run and
  // an empty one are indistinguishable from here, and the empty one is the bug
  // this whole block exists to close.
  if (passed === null || failed === null) {
    console.error(`[playwright] could not read the twins' TAP summary — refusing to report a verdict for a run whose result is unknown`);
    console.error(`= run failed  (0/0 done, 1 failed)  [VM twins: no TAP summary]`);
    process.exit(1);
  }
  const ok = r.status === 0 && failed === 0 && passed > 0;
  if (!ok) {
    // A `= run failed` line, in the reporter's own shape, so every anchor that
    // reads a Playwright group reads this one too — and it is LAST, because
    // the browser half never starts.
    console.error(`[playwright] VM twin(s) FAILED — not starting a browser`);
    console.error(`= run failed  (${passed + failed}/${passed + failed} done, ${Math.max(failed, 1)} failed)  [VM twins, no browser]`);
    process.exit(1);
  }
  if (nothingToRun) {
    console.error(`= run passed  (${passed}/${passed} done, 0 failed)  [VM twins, no browser]`);
    process.exit(0);
  }
  // Something is still left for a browser. Do NOT emit a verdict line here:
  // the reporter's own is the group's, and two of them would let the parser's
  // last-match-wins rule report the twins' result as the group's.
  console.error(`[playwright] VM twin(s) passed (${passed}) — the browser half follows`);
}

/* --list AND NOTHING LEFT TO LIST. `--list` deliberately skips RUNNING the
   twins above, but the twinned specs were still REMOVED from args — so for a
   fully twinned group (collisions is 32/32) Playwright is handed a bare
   `test --list` with no spec paths and lists the ENTIRE suite. The answer is
   not "every spec in the repo"; it is "this group's specs are covered in node".
   No in-repo consumer passes --list through here, so the cost is a wrong
   answer at the CLI rather than a wrong gate — but a listing tool that reports
   119 specs for a group of 32 is the kind of wrong answer the next reader
   builds on. */
if (nothingToRun && args.includes("--list")) {
  for (const d of dropped) console.error(`[playwright] ${d.spec} → ${d.twin} (node)`);
  console.error(`[playwright] --list: every spec in this group has a VM twin; nothing runs in a browser`);
  process.exit(0);
}

const managed = process.env.APEX_PORT ? null : await startStaticServer();
const port = process.env.APEX_PORT || String(managed.port);
// `--last-failed` reads <outputDir>/.last-run.json, and outputDir is suffixed
// by THIS run's port (playwright.config.js) — so a previous run's record has to
// be carried across: test-bg --last-failed names it in APEX_LAST_RUN_FILE.
if (args.includes("--last-failed") && process.env.APEX_LAST_RUN_FILE) {
  const dir = join(ROOT, "artifacts", `test-results-${port}`);
  try {
    mkdirSync(dir, { recursive: true });
    copyFileSync(process.env.APEX_LAST_RUN_FILE, join(dir, ".last-run.json"));
    console.error(`[playwright] --last-failed: re-running the failures recorded in ${process.env.APEX_LAST_RUN_FILE}`);
  } catch (e) {
    console.error(`[playwright] --last-failed: could not stage ${process.env.APEX_LAST_RUN_FILE} (${e.message}); running everything named`);
  }
}
// A pass that needed a retry is a red, not a green (AGENTS.md §Verification 9,
// 2026-09-22): `retries: 1` in CI turns an intermittent failure into a silent
// pass, and the live reporter's "flaky" line is easy to skim past. Opt in with
// APEX_FAIL_ON_FLAKY=1 and Playwright exits non-zero on any flaky test; the
// gate flips it on once the known flakes are fixed or quarantined by name.
if (process.env.APEX_FAIL_ON_FLAKY === "1" && !args.includes("--fail-on-flaky-tests")) {
  args.push("--fail-on-flaky-tests");
}
const cli = join(ROOT, "node_modules", ".bin", "playwright");
const child = spawn(cli, ["test", ...args], {
  cwd: ROOT,
  env: {
    ...process.env,
    APEX_PORT: port,
    ...(managed ? { APEX_MANAGED_SERVER: "1" } : {}),
  },
  stdio: "inherit",
});

console.error(`[playwright] port=${port} pid=${child.pid}`);

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    try { child.kill(signal); } catch {}
  });
}

child.on("error", (error) => {
  console.error(`[playwright] failed to start: ${error.message}`);
  managed?.server.close();
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) console.error(`[playwright] child exited on ${signal}`);
  managed?.server.close();
  process.exitCode = code ?? 1;
});
