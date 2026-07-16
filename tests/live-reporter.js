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
  }

  onError(error) {
    this.write(`[${ts()}] x RUN ERROR: ${(error.message || error).toString().split("\n")[0]}`);
  }

  onEnd(result) {
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
