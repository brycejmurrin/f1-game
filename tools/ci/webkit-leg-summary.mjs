#!/usr/bin/env node
// @doc Markdown job summary for webkit-leg.yml from artifacts/webkit-leg/report.json.
// Kept out of the workflow `run:` block so shellcheck SC2016 never sees JS `$`.
import fs from "node:fs";

const reportPath = process.argv[2] || "artifacts/webkit-leg/report.json";
if (!fs.existsSync(reportPath)) {
  console.log("_No report.json — the boot step failed before writing artifacts/webkit-leg/report.json._");
  process.exit(0);
}

const r = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const cell = (v) => "`" + (v == null ? "" : v) + "`";
const boot = r.boot || {};
const frame = r.firstFrame || {};
const canvas = frame.canvas || {};
const ft = r.frameTimes || {};
const heap = r.heapAfterTwoRaceCycles || {};

const lines = [
  "| field | value |",
  "|---|---|",
  "| browser.version() | " + cell(r.browserVersion) + " |",
  "| track | " + cell(r.track) + " |",
  "| backend / bound | " + cell(boot.backend) + " / " + cell(boot.bound) + " |",
  "| first frame | " + cell(frame.presented) + " (" + cell(canvas.id) + " " +
    cell(canvas.w) + "x" + cell(canvas.h) + ") |",
  "| frame-time p50 / n | " + cell(ft.p50) + " ms / " + cell(ft.n) + " |",
  "| heap after 2 race cycles | " + cell(heap.usedJSHeapSize) +
    " (null = WebKit has no performance.memory) |",
  "| pass-census | blocked: harness is Chromium-only |",
];
console.log(lines.join("\n"));
