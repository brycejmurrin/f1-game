/* devicefarm-syslog.test.mjs — the iOS syslog reader behind docs/notes/IPHONE-MEMORY-2026-10-24.md.
 *
 * The fixture is a trimmed copy of a real Device Farm `auto` syslog (iPhone 18 Pro Max, 2026-10-23): the format is
 * WebKit's own "Memory usage info dump" plus runningboardd's per-extension memory limits. Lines are interleaved
 * with unrelated daemons exactly as the device prints them. A dump is split over lines and other processes' lines
 * land in between, so the reader must key fields by the WebContent pid.
 *
 * Run: node --test tests/unit/devicefarm-syslog.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, feed, summarise, table } from "../../tools/perf/devicefarm-syslog.mjs";

const H = "Oct 22 19:57:3";
const FIXTURE = [
  `Oct 22 19:53:49 G074GP9N3T runningboardd(RunningBoard)[36] <Notice>: [extension<com.apple.WebKit.WebContent[config:6E69CA09]((null):606)>[uuid:A1]:608] Memory Limits: active 2048 inactive 2048`,
  `Oct 22 19:53:49 G074GP9N3T runningboardd(RunningBoard)[36] <Notice>: [extension<com.apple.WebKit.WebContent[config:6E69CA09]((null):606)>[uuid:A1]:608] set Memory Limits to Hard Active (2048)`,
  `Oct 22 19:53:49 G074GP9N3T runningboardd(RunningBoard)[36] <Notice>: [extension<com.apple.WebKit.GPU[config:6E69CA09]((null):606)>[uuid:B2]:609] Memory Limits: active 600 inactive 400`,
  `Oct 22 19:53:49 G074GP9N3T runningboardd(RunningBoard)[36] <Notice>: [extension<com.apple.WebKit.GPU[config:6E69CA09]((null):606)>[uuid:B2]:609] set Memory Limits to Soft Active (600)`,
  `Oct 22 19:53:49 G074GP9N3T runningboardd(RunningBoard)[36] <Notice>: [app<com.apple.mobilesafari(FEEDEEEE-DDDD)>:597] Memory Limits: active 3376 inactive 3376`,
  // a blank page: under the 100 MB game-page cut
  `Oct 22 19:53:49 G074GP9N3T MobileSafari(WebKit)[606] <Notice>: WebContent[611]: Memory usage info dump at MainFrameLoadCompleted:`,
  `Oct 22 19:53:49 G074GP9N3T MobileSafari(WebKit)[606] <Notice>: WebContent[611]:   phys_footprint_mb: 11`,
  `Oct 22 19:53:49 G074GP9N3T MobileSafari(WebKit)[606] <Notice>: WebContent[611]:   resident_size_mb: 42`,
  // the game page: other daemons print between the dump's lines
  `${H}2 G074GP9N3T MobileSafari(WebKit)[606] <Notice>: WebContent[608]: Memory usage info dump at MainFrameLoadStarted:`,
  `${H}2 G074GP9N3T MobileSafari(WebKit)[606] <Notice>: WebContent[608]:   document_count: 5`,
  `${H}2 G074GP9N3T cfprefsd(CoreFoundation)[113] <Error>: Couldn't open <private> due to No such file or directory`,
  `${H}2 G074GP9N3T MobileSafari(WebKit)[606] <Notice>: WebContent[608]:   javascript_gc_heap_capacity_mb: 365`,
  `${H}2 G074GP9N3T MobileSafari(WebKit)[606] <Notice>: WebContent[608]:   internal_mb: 444`,
  `${H}2 G074GP9N3T MobileSafari(WebKit)[606] <Notice>: WebContent[608]:   compressed_mb: 0`,
  `${H}2 G074GP9N3T MobileSafari(WebKit)[606] <Notice>: WebContent[608]:   phys_footprint_mb: 682`,
  `${H}2 G074GP9N3T MobileSafari(WebKit)[606] <Notice>: WebContent[608]:   resident_size_mb: 1050`,
  `${H}2 G074GP9N3T MobileSafari(WebKit)[606] <Notice>: WebContent[608]:   virtual_size_mb: 472634`,
  // not a memory kill: the idle-demotion notice, a priority update and a clean exit
  `${H}3 G074GP9N3T kernel[0] <Notice>: memorystatus: memorystatus_perform_idle_demotion() timed out stuck process 627 [crash_mover], moving to idle band`,
  `${H}3 G074GP9N3T runningboardd(RunningBoard)[36] <Notice>: [extension<com.apple.WebKit.WebContent[config:6E69CA09]((null):606)>[uuid:A1]:608] termination reported by launchd (0, 0, 0)`,
  // a memory kill, a harness SIGKILL of Safari and a buffer failure
  `${H}4 G074GP9N3T kernel[0] <Notice>: memorystatus: killing_top_process pid 608 [com.apple.WebKit.WebContent] jetsam reason per-process-limit`,
  `${H}4 G074GP9N3T runningboardd(RunningBoard)[36] <Notice>: [extension<com.apple.WebKit.GPU[config:6E69CA09]((null):606)>[uuid:B2]:609] termination reported by launchd (2, 9, 9)`,
  `${H}5 G074GP9N3T SpringBoard(FrontBoard)[37] <Notice>: [app<com.apple.mobilesafari>:597] Process exited: <RBSProcessExitContext| specific, status:<RBSProcessExitStatus| domain:signal(2) code:SIGKILL(9)>>.`,
  `${H}6 G074GP9N3T MobileSafari(WebKit)[606] <Notice>: WebContent[608]: GPUDevice.createBuffer: Unable to create buffer`,
  `${H}6 G074GP9N3T runningboardd(RunningBoard)[36] <Notice>: Ignoring jetsam update because this process is not memory-managed`,
];

function run(lines, opts) { const st = newState(opts); for (const l of lines) feed(st, l); return st; }

test("a dump split across lines is assembled by pid and ends at resident_size_mb", () => {
  const st = run(FIXTURE);
  assert.equal(st.dumps.length, 2);
  const d = st.dumps[1];
  assert.deepEqual([d.pid, d.at, d.document_count, d.javascript_gc_heap_capacity_mb, d.internal_mb, d.phys_footprint_mb, d.resident_size_mb],
    [608, "MainFrameLoadStarted", 5, 365, 444, 682, 1050]);
});

test("device local time becomes UTC (default PDT, UTC-7)", () => {
  const st = run(FIXTURE);
  assert.equal(st.dumps[1].t, "2026-10-23T02:57:32Z");
  assert.equal(run(FIXTURE, { utcOffset: -8 }).dumps[1].t, "2026-10-23T03:57:32Z");
});

test("limits carry hard/soft and the Safari app limit is kept apart", () => {
  const s = summarise(run(FIXTURE));
  assert.deepEqual(s.limits.webContent, { activeMb: 2048, inactiveMb: 2048, kind: "hard" });
  assert.deepEqual(s.limits.gpu, { activeMb: 600, inactiveMb: 400, kind: "soft" });
  assert.equal(s.limits.safariApp.activeMb, 3376);
});

test("peak is taken over game-page processes only and is read against the WebContent limit", () => {
  const s = summarise(run(FIXTURE));
  assert.equal(s.dumps, 1);
  assert.equal(s.peakDump.phys_footprint_mb, 682);
  assert.equal(s.headroomMb, 2048 - 682);
  assert.equal(s.peakPctOfWebContentLimit, 33.3);
});

test("only a named memory kill counts as one; idle demotion, priority updates and a Safari SIGKILL do not", () => {
  const s = summarise(run(FIXTURE));
  assert.equal(s.kills.length, 1);
  assert.match(s.kills[0].text, /killing_top_process/);
  assert.equal(s.sigkillExits.length, 1);
  assert.deepEqual(s.abnormalTerminations.map((e) => [e.proc, e.status]), [["GPU", [2, 9, 9]]]);
});

test("buffer failures are collected and the table prints the peak line", () => {
  const st = run(FIXTURE);
  assert.equal(summarise(st).bufferFailures.length, 1);
  assert.match(table(st), /peak sampled footprint 682 MB .* 33\.3% of the WebContent limit, headroom 1366 MB/);
});

test("a stream with no dumps still summarises", () => {
  const s = summarise(run(["Oct 22 19:53:49 G074GP9N3T kernel[0] <Notice>: hello"]));
  assert.equal(s.peakDump, null);
  assert.equal(s.limits.webContent, null);
});
