// @ts-check
/**
 * Live progress reporter — every event is one timestamped, immediately-written
 * line, so `tail -f` on a piped log shows real-time state (the stock `line`
 * reporter animates with \r and only prints on COMPLETION, which makes a
 * slow/hung test look like a dead run).
 *
 *   [21:58:03] > start   tests/smoke.spec.js › page loads without WebGL error
 *   [21:58:41] + pass    3/16 tests/smoke.spec.js › page loads... (38.2s)
 *   [21:59:59] x FAIL    4/16 tests/foo.spec.js › bar (78.0s, retry 1 queued)
 *
 * Wired as the default reporter in playwright.config.js (alongside html+junit).
 * A hung test is the one with a `> start` line and no matching end line —
 * grep -c '> start' vs 'end lines' tells you exactly which spec is stuck.
 */

const ts = () => new Date().toISOString().slice(11, 19);

class LiveReporter {
  onBegin(config, suite) {
    this.total = suite.allTests().length;
    this.done = 0;
    this.durations = [];   // {name, dur} per completed test — for the slowest-N summary
    this.flaky = 0;        // tests that FAILED then PASSED on retry (hidden flakiness)
    this.write(`[${ts()}] = run start: ${this.total} tests, ${config.workers} worker(s)`);
  }

  onTestBegin(test) {
    this.write(`[${ts()}] > start   ${this.name(test)}${test.retries && test.results.length > 1 ? `  (retry ${test.results.length - 1})` : ""}`);
  }

  onTestEnd(test, result) {
    this.done++;
    const dur = (result.duration / 1000).toFixed(1);
    const willRetry = result.status !== "passed" && result.status !== "skipped" &&
                      test.results.length <= test.retries;
    const mark = result.status === "passed" ? "+ pass  " :
                 result.status === "skipped" ? "~ skip  " :
                 willRetry ? "! retry " : "x FAIL  ";
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
    // Slowest 10 tests — the fastest way to spot the per-test reload/render hogs.
    const slow = this.durations.sort((a, b) => b.dur - a.dur).slice(0, 10);
    if (slow.length) {
      this.write(`[${ts()}] = slowest ${slow.length}:`);
      for (const s of slow) this.write(`             ${(s.dur / 1000).toFixed(1)}s  ${s.name}`);
    }
    if (this.flaky) this.write(`[${ts()}] = FLAKY: ${this.flaky} test(s) passed only on retry (deterministic suite — investigate)`);
    this.write(`[${ts()}] = run ${result.status}`);
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
