/* tools-runnable-report.test.mjs — tools/net/report-server and the in-page
 * apex-report: a POSTed bundle is collected, a hostile name cannot escape,
 * malformed bundles are refused without spending quota, and a report never
 * carries credentials or URL capabilities. Split out of tools-runnable.test.mjs
 * (#3043 T5-12), assertions unchanged.
 *
 * Run: node --test tests/unit/tools-runnable-report.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, tool } from "../helpers/tools-tree.mjs";

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
    [tool("report-server.mjs"), "--port", "0", "--host", "127.0.0.1", "--root", dir],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  const closed = new Promise((ok) => proc.once("close", (code, signal) => ok({ code, signal })));
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
    assert.equal(await help.text(), "apex-report collector. POST a JSON bundle from the authenticated report page.\n");

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
    // Exercise the CLI's actual stop path and allow V8 coverage to flush.
    proc.kill("SIGTERM");
    let timer;
    try {
      const outcome = await Promise.race([closed, new Promise((_, fail) => {
        timer = setTimeout(() => { proc.kill("SIGKILL"); fail(new Error("report-server did not stop in 5s")); }, 5000);
      })]);
      assert.deepEqual(outcome, { code: 0, signal: null });
    } finally { clearTimeout(timer); await closed; fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test("report-server: rejects malformed bundles without saving or consuming session quota", async () => {
  const { startReportServer, safeName } = await import("../../tools/mcp/report-server.mjs");
  fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch/report-validation-"));
  fs.writeFileSync(path.join(dir, "index.html"), "<body>fixture</body>");
  const body = JSON.stringify({ build: 1, verdict: ["ok"] });
  const srv = await startReportServer({ root: dir, host: "127.0.0.1", port: 0, maxTotalBytes: Buffer.byteLength(body) * 2 });
  const post = (name, text) => {
    const url = new URL("apex-report", srv.url);
    url.searchParams.set("token", srv.token); url.searchParams.set("file", name);
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: text });
  };
  try {
    assert.equal(safeName("../../report.json"), "report.json");
    const badCookie = await fetch(srv.url, { headers: { Cookie: "apex26_report_token=%ZZ" } });
    assert.equal(badCookie.status, 403);
    await badCookie.text();
    for (const text of ["{", "null", "[]", "1", "true", '"report"', '{"verdict":{}}', '{"verdict":[null]}']) {
      const res = await post("rejected.json", text);
      assert.equal(res.status, 400, text);
      await res.text();
      assert.equal(fs.existsSync(path.join(srv.out, "rejected.json")), false);
    }
    const good = await post("one.json", body);
    assert.equal(good.status, 200); assert.equal((await good.json()).bytes, Buffer.byteLength(body));
    const duplicate = await post("one.json", body);
    assert.equal(duplicate.status, 409); await duplicate.text();
    // Rejected uploads and EEXIST must both release their reservations.
    const next = await post("two.json", body);
    assert.equal(next.status, 200); await next.json();
    const over = await post("over-quota.json", body);
    assert.equal(over.status, 413); assert.equal(await over.text(), "report quota exceeded");
    assert.deepEqual(fs.readdirSync(srv.out).sort(), ["one.json", "two.json"]);
    assert.equal(fs.readFileSync(path.join(srv.out, "one.json"), "utf8"), body);
  } finally { await srv.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("report-server: unfamiliar metadata is retained without unsafe coercion", async () => {
  const { startReportServer } = await import("../../tools/mcp/report-server.mjs");
  fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch/report-metadata-"));
  fs.writeFileSync(path.join(dir, "index.html"), "<body>fixture</body>");
  const srv = await startReportServer({ root: dir, host: "127.0.0.1", port: 0 });
  try {
    const value = { toString: null };
    const report = { build: value, backend: value, state: value, agent: { ua: value }, canvasContext: { note: value } };
    const url = new URL("apex-report", srv.url);
    url.searchParams.set("token", srv.token); url.searchParams.set("file", "metadata.json");
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(report) });
    assert.equal(response.status, 200); await response.json();
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(srv.out, "metadata.json"), "utf8")), report);
  } finally { await srv.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("apex-report never serializes credentials or URL capabilities", () => {
  const src = fs.readFileSync(tool("apex-report.js"), "utf8");
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
