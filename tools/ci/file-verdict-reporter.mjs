// @doc A `node --test` reporter writing per-file event counts, so a group runner can refuse an exit 0 that verified nothing.
// @section runner
//
// EXIT 0 IS NOT A VERDICT (audit W6, 2026-11-10). `node --test a b c` exits 0
// when one of its files calls process.exit(0) before or between its tests, or
// registers none: the runner counts that file as ONE passing test named after
// the file, and whatever the file had not flushed is lost. tooling-fast.mjs
// runs one file per child and checks each child's TAP (emptyRunReason); the
// topical groups run many files per child (run-group.mjs, run-node-group.mjs)
// and trusted the exit code. This reporter sees every event WITH its file, and
// fileVerdicts() (run-node-group.mjs) turns the counts into a reason per file.
//
// Pure collector: it writes one JSON object to its --test-reporter-destination
// when the stream ends, and nothing else. The human-readable stream stays the
// default spec/tap reporter on stdout (run-node-group.mjs adds both).
import path from "node:path";

/** Fold reporter events into { "<abs file>": counts }. Exported for the unit test. */
export function collect(events, cwd = process.cwd()) {
  const files = {};
  const at = (file) => files[file] || (files[file] = {
    enqueued: 0, done: 0, pass: 0, fail: 0, skipped: 0, todo: 0, fileMarker: null,
  });
  for (const e of events) {
    const d = e && e.data;
    if (!d || !d.file) continue;
    const f = at(d.file);
    // The runner's own per-file entry: at nesting 0, named the file as it was
    // passed on the command line (relative to the runner's cwd). It is enqueued
    // for every file and finishes only when the file reported nothing of its
    // own (no tests, or exited before they were flushed).
    const marker = d.nesting === 0 && typeof d.name === "string"
      && (d.name === d.file || path.resolve(cwd, d.name) === d.file);
    if (e.type === "test:enqueue") { if (!marker) f.enqueued++; continue; }
    if (e.type !== "test:pass" && e.type !== "test:fail") continue;
    if (marker) { f.fileMarker = e.type === "test:pass" ? "pass" : "fail"; continue; }
    f.done++;
    if (d.details && d.details.type === "suite") continue;
    if (d.skip) f.skipped++;
    else if (d.todo) f.todo++;
    else if (e.type === "test:pass") f.pass++;
    else f.fail++;
  }
  return files;
}

export default async function* fileVerdictReporter(source) {
  const events = [];
  for await (const e of source) {
    if (e.type === "test:enqueue" || e.type === "test:pass" || e.type === "test:fail") {
      const d = e.data || {};
      events.push({ type: e.type, data: { file: d.file, name: d.name, nesting: d.nesting, skip: d.skip,
        todo: d.todo, details: d.details && { type: d.details.type } } });
    }
  }
  yield JSON.stringify(collect(events)) + "\n";
}
