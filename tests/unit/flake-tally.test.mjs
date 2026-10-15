/* flake-tally.test.mjs — nightly flake tally parsers and aggregation.
 *
 * The tool reads scheduled CI runs for deflake / quarantine targets. The
 * load-bearing pure bits (no network): Playwright report.json outcomes,
 * live-reporter FLAKY / x FAIL log lines, junit retry pairs, markdown table,
 * and exact-name artifact URL shaping (never a repo-wide page scan).
 *
 * Run: node --test tests/unit/flake-tally.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import {
  normaliseSpec,
  reportTitle,
  parseReportJson,
  parseLiveLogFlakes,
  parseJunitAttempts,
  extractReportJsonFromHtml,
  readZipEntry,
  tallyEvents,
  formatMarkdownTable,
  isPlaywrightArtifactName,
  artifactNamePath,
  pickArtifactForRun,
  DEPLOY_BRANCH,
  ARTIFACT_PREFIX,
} from "../../tools/ci/flake-tally.mjs";

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "flake-tally");

test("normaliseSpec restores the tests/ prefix junit and reports drop", () => {
  assert.equal(normaliseSpec("specs/agent-view.spec.js"), "tests/specs/agent-view.spec.js");
  assert.equal(normaliseSpec("tests/specs/smoke.spec.js"), "tests/specs/smoke.spec.js");
  assert.equal(normaliseSpec("./specs/smoke.spec.js"), "tests/specs/smoke.spec.js");
});

test("reportTitle joins path + title like live-reporter key()", () => {
  assert.equal(reportTitle(["atmosphere()"], "night is dark"), "atmosphere() › night is dark");
  assert.equal(reportTitle([], "solo"), "solo");
});

test("parseReportJson: flaky → flaky-pass, unexpected → fail", () => {
  const report = JSON.parse(fs.readFileSync(path.join(FIX, "report-flaky.json"), "utf8"));
  const ev = parseReportJson(report, 38392542652);
  assert.deepEqual(ev, [
    {
      spec: "tests/specs/agent-view.spec.js",
      title: "atmosphere() › night is dark, floodlit, and names the moon — not a high sun",
      kind: "flaky",
      runId: 38392542652,
    },
    {
      spec: "tests/specs/agent-view.spec.js",
      title: "frame() › driving on track, the road dominates the lower frame",
      kind: "flaky",
      runId: 38392542652,
    },
    {
      spec: "tests/specs/parts-persistence.spec.js",
      title: "Parts persistence — localStorage writes › selecting a gearbox part saves it to localStorage",
      kind: "fail",
      runId: 38392542652,
    },
  ]);
});

test("parseLiveLogFlakes reads = FLAKY BLOCKING rows and x FAIL lines", () => {
  const log = fs.readFileSync(path.join(FIX, "live-reporter-flaky.log"), "utf8");
  const ev = parseLiveLogFlakes(log, 99);
  assert.equal(ev.filter((e) => e.kind === "flaky").length, 2);
  assert.equal(ev.filter((e) => e.kind === "fail").length, 1);
  assert.ok(ev.some((e) => e.kind === "flaky" && /atmosphere/.test(e.title)));
  assert.ok(ev.some((e) => e.kind === "fail" && e.spec.endsWith("menu-keyboard.spec.js")));
});

test("parseJunitAttempts: fail-then-pass is flaky; lone failure is fail", () => {
  const xml = fs.readFileSync(path.join(FIX, "junit-retries.xml"), "utf8");
  const ev = parseJunitAttempts(xml, 7);
  assert.deepEqual(
    ev.map((e) => [e.kind, e.title]).sort(),
    [
      ["fail", "hard fail"],
      ["flaky", "flaky one"],
    ].sort(),
  );
});

test("extractReportJsonFromHtml reads embedded zip report.json", () => {
  const report = { files: [{ fileName: "specs/smoke.spec.js", tests: [{ title: "t", path: [], outcome: "flaky" }] }] };
  const raw = Buffer.from(JSON.stringify(report), "utf8");
  const compressed = deflateRawSync(raw);
  // Build a one-entry zip (local + central + EOCD) with deflated report.json
  const name = Buffer.from("report.json");
  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt32LE(0, 10);
  local.writeUInt32LE(0, 14); // crc ignored
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  name.copy(local, 30);
  const cd = Buffer.alloc(46 + name.length);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0, 8);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(0, 12);
  cd.writeUInt32LE(0, 16);
  cd.writeUInt32LE(compressed.length, 20);
  cd.writeUInt32LE(raw.length, 24);
  cd.writeUInt16LE(name.length, 28);
  cd.writeUInt16LE(0, 30);
  cd.writeUInt16LE(0, 32);
  cd.writeUInt16LE(0, 34);
  cd.writeUInt16LE(0, 36);
  cd.writeUInt32LE(0, 38);
  cd.writeUInt32LE(0, 42); // local offset
  name.copy(cd, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(local.length + compressed.length, 16);
  eocd.writeUInt16LE(0, 20);
  const zip = Buffer.concat([local, compressed, cd, eocd]);
  assert.equal(readZipEntry(zip, "report.json"), JSON.stringify(report));
  const html = `<html><script>x</script><a href="data:application/zip;base64,${zip.toString("base64")}"></a></html>`;
  const parsed = extractReportJsonFromHtml(html);
  assert.deepEqual(parseReportJson(parsed, 1), [{
    spec: "tests/specs/smoke.spec.js",
    title: "t",
    kind: "flaky",
    runId: 1,
  }]);
});

test("tallyEvents aggregates fails, flaky-passes, runs seen, last seen run id", () => {
  const rows = tallyEvents([
    { spec: "tests/specs/smoke.spec.js", title: "one", kind: "flaky", runId: 10 },
    { spec: "tests/specs/smoke.spec.js", title: "one", kind: "flaky", runId: 11 },
    { spec: "tests/specs/smoke.spec.js", title: "one", kind: "fail", runId: 12 },
    { spec: "tests/specs/agent-view.spec.js", title: "two", kind: "fail", runId: 10 },
  ]);
  assert.equal(rows[0].spec, "tests/specs/smoke.spec.js");
  assert.equal(rows[0].flakyPasses, 2);
  assert.equal(rows[0].fails, 1);
  assert.equal(rows[0].runsSeen, 3);
  assert.equal(rows[0].lastSeenRunId, 12);
  assert.equal(rows[1].fails, 1);
  assert.equal(rows[1].flakyPasses, 0);
});

test("formatMarkdownTable has the required columns and deploy branch", () => {
  const md = formatMarkdownTable([
    { test: "t", spec: "tests/specs/smoke.spec.js", fails: 1, flakyPasses: 2, runsSeen: 3, lastSeenRunId: 99 },
  ], { runsExamined: 14 });
  assert.match(md, /\| test \| spec \| fails \| flaky-passes \| runs seen \| last seen run id \|/);
  assert.match(md, /\| t \| tests\/specs\/smoke\.spec\.js \| 1 \| 2 \| 3 \| 99 \|/);
  assert.match(md, new RegExp(DEPLOY_BRANCH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(md, /Scheduled CI runs examined: \*\*14\*\*/);
});

test("artifact lookups are exact-name; never a bare repo-wide page scan", () => {
  assert.equal(isPlaywrightArtifactName(ARTIFACT_PREFIX + "smoke-2"), true);
  assert.equal(isPlaywrightArtifactName("spec-timings-junit-smoke-2"), false);
  const p = artifactNamePath("playwright-artifacts-smoke-2");
  assert.match(p, /^actions\/artifacts\?per_page=100&name=playwright-artifacts-smoke-2$/);
  assert.match(p, /[?&]name=/);
  // Source must not page repo-wide without name= (the garage-before 500 class).
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const src = fs.readFileSync(path.join(root, "tools/ci/flake-tally.mjs"), "utf8");
  assert.doesNotMatch(src, /actions\/artifacts\?per_page=\d+&page=/);
  assert.match(src, /name=\$\{encodeURIComponent\(name\)\}/);
});

test("pickArtifactForRun keeps the matching workflow_run id", () => {
  const arts = [
    { id: 1, name: "playwright-artifacts-smoke-2", expired: false, workflow_run: { id: 111 } },
    { id: 2, name: "playwright-artifacts-smoke-2", expired: false, workflow_run: { id: 38392542652 } },
  ];
  assert.equal(pickArtifactForRun(arts, 38392542652).id, 2);
  assert.equal(pickArtifactForRun(arts, 999), null);
});

// #2188: Node's built-in fetch ignores HTTPS_PROXY, so in a cloud container the
// GitHub callers got 401 / a rate-limited 403. They default to proxyFetch.
test("#2188: GitHub callers default to the proxy-aware fetch; curl carries headers on stdin and never disables TLS", async () => {
  const { fetchBypassesProxy, pickFetch, curlRequest, parseCurlStatus, curlFetch } = await import("../../tools/lib/proxy-fetch.mjs");
  assert.equal(fetchBypassesProxy({ HTTPS_PROXY: "http://p:1" }), true);
  assert.equal(fetchBypassesProxy({ https_proxy: "http://p:1" }), true);
  assert.equal(fetchBypassesProxy({ HTTPS_PROXY: "http://p:1", NODE_USE_ENV_PROXY: "1" }), false, "Node proxies itself");
  assert.equal(fetchBypassesProxy({}), false);
  assert.notEqual(pickFetch({ HTTPS_PROXY: "x" }).toString(), pickFetch({}).toString());
  const { args, config } = curlRequest("https://api.github.com/x", { headers: { Authorization: "Bearer SECRET", Accept: "a\"b" }, timeoutMs: 3000 });
  assert.ok(!args.join(" ").includes("SECRET"), "the token never reaches argv");
  assert.match(config, /^header = "Authorization: Bearer SECRET"$/m);
  assert.match(config, /^header = "Accept: a\\"b"$/m);
  assert.ok(args.includes("-L") && args.includes("-K") && args.includes("3"));
  assert.ok(!args.some((a) => /^(-k|--insecure|--proxy-insecure)$/.test(a)), "TLS verification is never disabled");
  assert.equal(parseCurlStatus("\n__APEX_HTTP_CODE__404"), 404);
  assert.equal(parseCurlStatus("curl: (6) could not resolve"), null);
  // curlFetch over a fake child: body bytes, status and the stdin config.
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  let stdin = "";
  const fakeSpawn = () => {
    const c = new EventEmitter();
    c.stdout = new PassThrough(); c.stderr = new PassThrough();
    c.stdin = { end: (s) => { stdin = s; setImmediate(() => { c.stdout.end(Buffer.from('{"ok":1}')); c.stderr.end("\n__APEX_HTTP_CODE__200"); setImmediate(() => c.emit("close", 0)); }); } };
    c.kill = () => {};
    return c;
  };
  const res = await curlFetch("https://api.github.com/y", { headers: { Authorization: "Bearer T" } }, fakeSpawn);
  assert.equal(res.status, 200);
  assert.equal(res.ok, true);
  assert.deepEqual(await res.json(), { ok: 1 });
  assert.match(stdin, /Authorization: Bearer T/);
  // The three callers import it instead of a bare fetch.
  for (const f of ["tools/ci/flake-tally.mjs", "tools/ci/verify-change.mjs", "tools/shot/garage-before.mjs"]) {
    const src = fs.readFileSync(fileURLToPath(new URL(`../../${f}`, import.meta.url)), "utf8");
    assert.match(src, /import \{ proxyFetch \} from "\.\.\/lib\/proxy-fetch\.mjs"/, f);
    assert.doesNotMatch(src.replace(/\/\/.*$/gm, ""), /(^|[^.\w])fetch\(|globalThis\.fetch/m, `${f} has no bare fetch left`);
  }
});
