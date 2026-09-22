// @ts-check
/**
 * Live progress reporter — every event is one timestamped, immediately-written
 * line, so `tail -f` on a piped log shows real-time state (the stock `line`
 * reporter animates with \r and only prints on COMPLETION, which makes a
 * slow/hung test look like a dead run).
 *
 *   [21:58:03] > start   w0 tests/specs/smoke.spec.js › page loads without WebGL error
 *   [21:58:33] . running 1/16 done, 0 failed | w0 30s tests/specs/smoke.spec.js › page loads…
 *   [21:58:41] + pass    3/16 tests/specs/smoke.spec.js › page loads... (38.2s)
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
    // The run's START, which is also what Playwright stamps on each junit
    // <testsuite>. tools/ci/spec-timings.mjs keys a sample by (bucket, run-start
    // second), so recording the same run from HERE and from its junit.xml
    // dedupes to one sample instead of two.
    this.startedAt = Date.now();
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
      .map((t) => {
        const step = [...t.steps].pop();
        return `w${t.worker} ${Math.round((now - t.start) / 1000)}s ${t.name}` +
          (step ? ` | in ${step.title}` : "");
      });
    this.write(`[${ts()}] . running ${this.done}/${this.total} done, ${this.failed} failed | ${parts.join(" | ")}`);
  }

  onTestBegin(test, result) {
    const w = result && result.workerIndex != null ? result.workerIndex : 0;
    const name = this.name(test);
    this.inflight.set(test, { name, start: Date.now(), worker: w, steps: new Set() });
    this.write(`[${ts()}] > start   w${w} ${name}${test.retries && test.results.length > 1 ? `  (retry ${test.results.length - 1})` : ""}`);
  }

  onStepBegin(test, result, step) {
    this.inflight.get(test)?.steps.add(step);
  }

  onStepEnd(test, result, step) {
    this.inflight.get(test)?.steps.delete(step);
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
      // Keep the first 4 NON-EMPTY lines. Playwright separates the custom
      // assertion message, the matcher line and the Expected/Received pair with
      // BLANK lines, so a raw 4-line cut silently drops the VALUES from every
      // assertion that carries a custom message — and keeps them for every
      // assertion that does not. That asymmetry is not cosmetic: it is how
      // monza:64's 0.294 vanished from a live log, how the next `Received:` in
      // the file (Spa's 0.525, a different test) got read in its place, and how
      // a bit-stable circuit came to be recorded as a nondeterministic build.
      // Same 4-line budget, strictly more information.
      const msg = (result.error.message || String(result.error))
        .split("\n").filter((l) => l.trim()).slice(0, 4).join("\n           ");
      this.write(`           ${msg}`);
    }
    // On the FINAL result for a test, record its wall time (for the slowest-N
    // summary) and flag it flaky if it only went green after a retry.
    if (result.status === "passed" || result.status === "skipped" ||
        test.results.length > test.retries) {
      this.durations.push({ name: this.name(test), dur: result.duration, ...this.key(test) });
      if (test.outcome && test.outcome() === "flaky") this.flaky++;
    }
    // On-failure diagnostics, echoed inline so a tailed log shows WHY without a
    // trip to the HTML report. tests/helpers/fixtures.js attaches all three (see its
    // afterEach); a spec on the base Playwright fixture attaches none and
    // simply prints nothing extra.
    if (result.status !== "passed" && result.status !== "skipped") {
      // Setup can consume the test budget before its body begins. Report the
      // deepest expensive steps so a context stall cannot masquerade as a
      // gameplay or assertion failure (Pages run 2215: Create context ~179 s).
      const expensive = [];
      const visit = (steps) => {
        for (const step of steps || []) {
          if (step.duration >= 1000 && !(step.steps || []).some(s => s.duration >= 1000))
            expensive.push(step);
          visit(step.steps);
        }
      };
      visit(result.steps);
      expensive.sort((a, b) => b.duration - a.duration);
      for (const step of expensive.slice(0, 3))
        this.write(`           slow step: ${(step.duration / 1000).toFixed(1)}s ${step.title}`);
      const att = (name) => (result.attachments || []).find((a) => a.name === name);
      const st = att("apex-state");
      if (st && st.body) {
        this.write(`           apex-state: ${st.body.toString().slice(0, 400)}`);
      }
      // The log ring and the console tail are the two things that say what the
      // PAGE was doing. Kept short on purpose — the full text is in the report.
      for (const [name, keep] of [["apex-logs", 8], ["page-console", 8]]) {
        const a = att(name);
        if (!a || !a.body) continue;
        const tail = a.body.toString().split("\n").filter(Boolean).slice(-keep);
        if (!tail.length) continue;
        this.write(`           ${name}:`);
        for (const line of tail) this.write(`             ${line.slice(0, 200)}`);
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
    // LAST, and only under the flag: the verdict line above is what every
    // `grep -E '= run (passed|failed…)'` anchors on (AGENTS.md rule 5) and must
    // not move behind an await.
    const after = [];
    if (process.env.APEX_SPEC_TIMINGS === "1") after.push(() => this.saveTimings());
    if (process.env.APEX_JS_COVERAGE === "1") after.push(() => this.mergeCoverage());
    if (after.length) return after.reduce((p, f) => p.then(f), Promise.resolve());
  }

  name(test) {
    // "tests/foo.spec.js › suite › title" — trim the leading project/file dirs
    const path = test.titlePath().filter(Boolean);
    const file = test.location?.file?.replace(/^.*\/(tests\/)/, "$1") || "";
    return `${file} › ${path.slice(-2).join(" › ")}`;
  }

  /** {spec, title} in JUNIT'S OWN SHAPE, so a duration recorded here and the
   *  same duration read back out of junit.xml land on one key.
   *  `titlePath()` is [project, file, ...describes, title]; junit's `name` is
   *  everything AFTER the file. The display `name()` above takes the last two
   *  instead, which for a test with no describe block would repeat the file. */
  key(test) {
    const parts = test.titlePath().filter(Boolean);
    const i = parts.findIndex((p) => /\.spec\.js$/.test(p));
    return {
      spec: test.location?.file?.replace(/^.*\/(tests\/)/, "$1") || "",
      title: (i >= 0 ? parts.slice(i + 1) : parts.slice(-1)).join(" › "),
    };
  }

  /** APEX_SPEC_TIMINGS=1 only: fold this run's durations into
   *  tests/data/spec-timings.json through the same merge the CLI uses.
   *
   *  OFF BY DEFAULT, and the import is dynamic, so an ordinary local run neither
   *  loads the tool nor writes a byte — a reporter that rewrote a tracked file
   *  on every `npm test` would make the working tree dirty behind the agent's
   *  back, which is exactly the surprise AGENTS.md rule 2 exists to prevent.
   *  Every failure here is REPORTED and swallowed: a bookkeeping file must
   *  never be able to turn a green run red.
   *
   *  APEX_SPEC_TIMINGS_FILE redirects the write, which is how a CI job merges
   *  into a scratch copy it then uploads, and how this is testable at all. */
  /** APEX_JS_COVERAGE=1 only: fold the raw V8 lists tests/helpers/js-coverage.js
   *  wrote this run (plus any NODE_V8_COVERAGE dump under artifacts/coverage-node)
   *  into artifacts/coverage-report/. Same contract as saveTimings(): dynamic
   *  import, off by default, every failure reported and swallowed. */
  async mergeCoverage() {
    const stamp = ts();
    try {
      const mod = await import("../../tools/ci/coverage-merge.mjs");
      const r = await mod.mergeCoverage();
      if (!r.ok) { this.write(`[${stamp}] = coverage: ${r.reason}`); return; }
      this.write(`[${stamp}] = coverage: ${r.sources} sources, lines ${r.lines}% functions ${r.functions}% ` +
        `branches ${r.branches}% -> ${r.outputDir.replace(/^.*\/(artifacts\/)/, "$1")}/index.html`);
    } catch (e) {
      this.write(`[${stamp}] = coverage: not merged (${(e && e.message) || e})`);
    }
  }

  async saveTimings() {
    const stamp = ts();
    try {
      const mod = await import("../../tools/ci/spec-timings.mjs");
      const target = process.env.APEX_SPEC_TIMINGS_FILE || undefined;
      const at = mod.isoSecond(this.startedAt);
      const rows = this.durations
        .filter((d) => d.spec && d.title && Number.isFinite(d.dur))
        .map((d) => ({ ts: at, spec: d.spec, title: d.title, sec: d.dur / 1000 }));
      const db = mod.loadDb(target);
      const r = mod.mergeRows(db, rows, { env: mod.envBucket() });
      mod.saveDb(db, target);
      this.write(`[${stamp}] = spec timings: ${r.added} new sample(s) across ${r.specs} spec(s) ` +
        `-> ${target || mod.TIMINGS_FILE} [${mod.envBucket()}]`);
    } catch (e) {
      this.write(`[${stamp}] = spec timings: not recorded (${(e && e.message) || e})`);
    }
  }

  write(line) {
    process.stdout.write(line + "\n");
  }

  printsToStdio() { return true; }
}

export default LiveReporter;
