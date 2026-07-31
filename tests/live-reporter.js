// @ts-check
/**
 * Live progress reporter — every event is one timestamped, immediately-written
 * line, so `tail -f` on a piped log shows real-time state (the stock `line`
 * reporter animates with \r and only prints on COMPLETION, which makes a
 * slow/hung test look like a dead run).
 *
 *   [21:58:03] > start   w0 tests/smoke.spec.js › page loads without WebGL error
 *   [21:58:33] . running 1/16 done, 0 failed | w0 30s tests/smoke.spec.js › page loads…
 *   [21:58:41] + pass    3/16 tests/smoke.spec.js › page loads... (38.2s)
 *   [21:59:59] x FAIL    4/16 tests/foo.spec.js › bar (78.0s, retry 1 queued)
 *
 * Wired as the default reporter in playwright.config.js (alongside html+junit).
 *
 * THE HEARTBEAT is what makes a backgrounded run diagnosable. Without it a hung
 * test emits `> start` and then nothing at all, so a tailed log is
 * indistinguishable from a dead process — you had to grep `> start` against the
 * end lines to work out which spec was stuck, and only after giving up. The
 * `. running` line names every in-flight test and how long it has been in
 * flight, so the stuck one is on screen within one interval and its worker is
 * identified. Interval: APEX_HEARTBEAT seconds (default 30, `0` disables).
 */

const ts = () => new Date().toISOString().slice(11, 19);
const HEARTBEAT_S = (() => {
  const v = Number.parseInt(process.env.APEX_HEARTBEAT || "", 10);
  return Number.isFinite(v) && v >= 0 ? v : 30;
})();

class LiveReporter {
  onBegin(config, suite) {
    this.total = suite.allTests().length;
    this.done = 0;
    this.failed = 0;       // running failure count — lets you abort a tailed run early
    this.durations = [];   // {name, dur} per completed test — for the slowest-N summary
    this.flaky = 0;        // tests that FAILED then PASSED on retry (hidden flakiness)
    this.failures = [];    // names of tests that ended red — replayed as an end summary
    this.inflight = new Map();   // test -> {name, start, worker}
    this.write(`[${ts()}] = run start: ${this.total} tests, ${config.workers} worker(s)` +
               (HEARTBEAT_S ? `, heartbeat ${HEARTBEAT_S}s` : ", heartbeat off"));
    this.startHeartbeat();
  }

  startHeartbeat() {
    if (!HEARTBEAT_S) return;
    this.hb = setInterval(() => this.beat(), HEARTBEAT_S * 1000);
    // Never hold the process open on our account — the run's lifetime is
    // Playwright's to decide, not the reporter's.
    if (this.hb.unref) this.hb.unref();
  }

  stopHeartbeat() {
    if (this.hb) { clearInterval(this.hb); this.hb = null; }
  }

  beat() {
    if (!this.inflight.size) return;      // idle between tests — nothing useful to say
    const now = Date.now();
    const parts = [...this.inflight.values()]
      .sort((a, b) => a.start - b.start)   // longest-running first: the hang suspect
      .map((t) => `w${t.worker} ${Math.round((now - t.start) / 1000)}s ${t.name}`);
    this.write(`[${ts()}] . running ${this.done}/${this.total} done, ${this.failed} failed | ${parts.join(" | ")}`);
  }

  onTestBegin(test, result) {
    const w = result && result.workerIndex != null ? result.workerIndex : 0;
    const name = this.name(test);
    this.inflight.set(test, { name, start: Date.now(), worker: w });
    this.write(`[${ts()}] > start   w${w} ${name}${test.retries && test.results.length > 1 ? `  (retry ${test.results.length - 1})` : ""}`);
  }

  onTestEnd(test, result) {
    this.done++;
    this.inflight.delete(test);
    const dur = (result.duration / 1000).toFixed(1);
    const willRetry = result.status !== "passed" && result.status !== "skipped" &&
                      test.results.length <= test.retries;
    const mark = result.status === "passed" ? "+ pass  " :
                 result.status === "skipped" ? "~ skip  " :
                 willRetry ? "! retry " : "x FAIL  ";
    if (mark === "x FAIL  ") { this.failed++; this.failures.push(this.name(test)); }
    this.write(`[${ts()}] ${mark} ${this.done}/${this.total} ${this.name(test)} (${dur}s)`);
    if (result.status !== "passed" && result.status !== "skipped" && result.error) {
      const msg = (result.error.message || String(result.error)).split("\n").slice(0, 4).join("\n           ");
      this.write(`           ${msg}`);
    }
    // On the FINAL result for a test, record its wall time (for the slowest-N
    // summary) and flag it flaky if it only went green after a retry.
    if (result.status === "passed" || result.status === "skipped" ||
        test.results.length > test.retries) {
      this.durations.push({ name: this.name(test), dur: result.duration });
      if (test.outcome && test.outcome() === "flaky") this.flaky++;
    }
    // On-failure __apex state dump: any spec that attaches "apex-state" (see the
    // afterEach in tests/fixtures.js) has its telemetry echoed inline so a failure
    // shows WHY, not just the bare assertion.
    if (result.status !== "passed" && result.status !== "skipped") {
      const st = (result.attachments || []).find((a) => a.name === "apex-state");
      if (st && st.body) {
        this.write(`           apex-state: ${st.body.toString().slice(0, 400)}`);
      }
    }
  }

  onError(error) {
    this.write(`[${ts()}] x RUN ERROR: ${(error.message || error).toString().split("\n")[0]}`);
  }

  onEnd(result) {
    this.stopHeartbeat();
    // Anything still in flight when the run ends was cut off (timeout kill,
    // SIGINT, worker crash). Naming it here is the difference between "the run
    // died" and "the run died IN this spec".
    if (this.inflight.size) {
      this.write(`[${ts()}] = UNFINISHED ${this.inflight.size} (killed mid-test):`);
      for (const t of this.inflight.values()) {
        this.write(`             w${t.worker} ${Math.round((Date.now() - t.start) / 1000)}s  ${t.name}`);
      }
    }
    // Slowest 10 tests — the fastest way to spot the per-test reload/render hogs.
    const slow = this.durations.sort((a, b) => b.dur - a.dur).slice(0, 10);
    if (slow.length) {
      this.write(`[${ts()}] = slowest ${slow.length}:`);
      for (const s of slow) this.write(`             ${(s.dur / 1000).toFixed(1)}s  ${s.name}`);
    }
    // Failure roll-up. Inline `x FAIL` lines scroll off the top of a long
    // tailed run; this is the one block worth reading at the bottom.
    if (this.failures.length) {
      this.write(`[${ts()}] = FAILURES ${this.failures.length}:`);
      for (const f of this.failures) this.write(`             ${f}`);
    }
    if (this.flaky) this.write(`[${ts()}] = FLAKY: ${this.flaky} test(s) passed only on retry (deterministic suite — investigate)`);
    this.write(`[${ts()}] = run ${result.status}  (${this.done}/${this.total} done, ${this.failures.length} failed)`);
  }

  name(test) {
    // "tests/foo.spec.js › suite › title" — trim the leading project/file dirs
    const path = test.titlePath().filter(Boolean);
    const file = test.location?.file?.replace(/^.*\/(tests\/)/, "$1") || "";
    return `${file} › ${path.slice(-2).join(" › ")}`;
  }

  write(line) {
    process.stdout.write(line + "\n");
  }

  printsToStdio() { return true; }
}

export default LiveReporter;
