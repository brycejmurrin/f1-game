#!/usr/bin/env node
// @doc Sequential cold-scene benchmark across GPU/browser/profile combinations; records unsupported cells.
// @skill playwright-probe
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCaptureArgs, ROOT, invoked } from "./capture-contract.mjs";
import { parseCaptureOptions } from "./capture-options.mjs";
import { registerTeardownResource, shutdown } from "../lib/harness.mjs";

const DEFAULT_CASES = "swiftshader:auto:comparison,swiftshader:auto:preview,swiftshader:shell:preview,hardware:chromium:preview,llvmpipe:chromium:preview,lavapipe:chromium:preview";
export function parseBenchmarkArgs(argv) {
  let cases = DEFAULT_CASES, samples = 3;
  const remaining = [];
  for (let i = 0; i < argv.length; i++) {
    const [key, ...rhs] = argv[i].split("=");
    if (key !== "--cases" && key !== "--samples") { remaining.push(argv[i]); continue; }
    const value = rhs.length ? rhs.join("=") : argv[++i];
    if (value == null || value.startsWith("--")) throw new Error(`missing value: ${key}`);
    if (key === "--cases") cases = value; else samples = Number(value);
  }
  if (!Number.isInteger(samples) || samples < 1 || samples > 10) throw new Error("samples must be 1..10");
  const opts = parseCaptureArgs(remaining, "capture-benchmark");
  const matrix = cases.split(",").map((entry) => {
    const parts = entry.split(":");
    if (parts.length !== 3) throw new Error("cases must be gpu:browser:profile comma-separated triples");
    const [gpu, browser, profile] = parts;
    const parsed = parseCaptureOptions(["--gpu", gpu, "--browser", browser, "--profile", profile]);
    return { gpu: parsed.gpu, browser: parsed.browser, profile: parsed.profile, name: parts.join("-") };
  });
  if (!matrix.length || matrix.length > 12) throw new Error("benchmark must contain 1..12 cases");
  if (new Set(matrix.map((cell) => cell.name)).size !== matrix.length) throw new Error("benchmark cases must be unique");
  return { ...opts, matrix, samples };
}
export function summarizeBenchmarkSamples(samples) {
  const passed = samples.filter((sample) => sample.status === "passed");
  const median = (values) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const timings = passed.map((sample) => sample.manifest);
  return { attempted: samples.length, passed: passed.length,
    medianMs: median(timings.map((manifest) => manifest.ms)),
    medianPresentMs: median(timings.map((manifest) => manifest.shots[0]?.timings?.presentMs).filter(Number.isFinite)),
    medianBytes: median(timings.map((manifest) => manifest.shots[0]?.bytes).filter(Number.isFinite)) };
}
export function captureSample(args, timeoutMs = 300000, { spawnChild = spawn, graceMs = 5000, kill = process.kill.bind(process) } = {}) {
  return new Promise((resolveSample, reject) => {
    const child = spawnChild(process.execPath, args, { cwd: ROOT, env: { ...process.env, APEX_WORKERS: "1" }, stdio: ["ignore", "pipe", "pipe", "ipc"] });
    const browserOwners = new Set();
    let stderr = "", stdout = "", timer, graceTimer, timedOut = false, closed = false;
    let resolveClosed;
    const completion = new Promise((resolve) => { resolveClosed = resolve; });
    child.on("message", (message) => {
      if (!Number.isInteger(message?.pid) || message.pid < 2) return;
      if (message.type === "capture-browser-owned") browserOwners.add(message.pid);
      if (message.type === "capture-browser-closed") browserOwners.delete(message.pid);
    });
    const force = () => {
      // Only processes explicitly handed back by this IPC child are eligible.
      for (const pid of browserOwners) {
        try { kill(-pid, "SIGKILL"); } catch { try { kill(pid, "SIGKILL"); } catch {} }
      }
      browserOwners.clear();
      if (!closed) child.kill("SIGKILL");
    };
    const terminate = () => {
      if (closed) return;
      child.kill("SIGTERM");
      graceTimer ||= setTimeout(force, graceMs);
    };
    registerTeardownResource({ close: async () => { if (!closed) { terminate(); await completion; } }, force });
    timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-65536); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-65536); });
    child.once("error", (error) => { clearTimeout(timer); clearTimeout(graceTimer); closed = true; force(); resolveClosed(); reject(error); });
    child.once("close", (code, signal) => {
      clearTimeout(timer); clearTimeout(graceTimer); closed = true; force(); resolveClosed();
      resolveSample({ code, signal, stderr, stdout, timedOut });
    });
  });
}
async function main() {
  const opts = parseBenchmarkArgs(process.argv.slice(2));
  if (opts.help) { console.log("capture-benchmark --track ID --seed N --out DIR --samples 1..10 --cases gpu:browser:profile,... [--plan]\nRuns cold scene captures sequentially; comparison and preview have different resolutions/quality. GPU/browser capability failures are recorded, never counted as speed wins."); return; }
  if (opts.plan) { console.log(JSON.stringify(opts, null, 2)); return; }
  mkdirSync(opts.out, { recursive: true });
  const report = { track: opts.track, seed: opts.seed, samples: opts.samples, methodology: "cold Chromium + cold scene, serial cells, one worker; preview/comparison quality differs; traces off", cells: [] };
  // Alternate matrix cells by round to reduce drift from host load and temperature.
  for (let round = 0; round < opts.samples; round++) for (const cell of opts.matrix) {
    let record = report.cells.find((item) => item.name === cell.name);
    if (!record) { record = { ...cell, samples: [] }; report.cells.push(record); }
    if (record.unavailable) continue;
    const out = resolve(opts.out, cell.name, String(round + 1));
    const run = await captureSample(["tools/shot/apex-capture.mjs", "tracks", out, opts.track,
      "--seed", String(opts.seed), "--gpu", cell.gpu, "--browser", cell.browser, "--profile", cell.profile]);
    let manifest = null;
    try { manifest = JSON.parse(readFileSync(resolve(out, "manifest.json"), "utf8")); } catch { /* launch failures have no manifest */ }
    const status = run.timedOut ? "timedout" : run.code === 0 && manifest?.shots?.length === 1 && manifest.shots.every((shot) => !shot.blank && !shot.err) ? "passed" : "failed";
    const sample = { round: round + 1, status, code: run.code, signal: run.signal, manifest,
      ...(status !== "passed" ? { error: run.stderr.slice(-6000) } : {}) };
    record.samples.push(sample);
    if (status === "failed" && /requires an installed Mesa|requested GPU profile|cannot verify requested GPU|browserFlavor=.*not installed|requested .*not installed|no executable.*shell|no executable.*chromium/i.test(run.stderr)) record.unavailable = sample.error;
    record.summary = summarizeBenchmarkSamples(record.samples);
    writeFileSync(resolve(opts.out, "benchmark.json"), JSON.stringify(report, null, 2) + "\n");
    console.error(`[benchmark] ${cell.name} round ${round + 1}: ${status}${Number.isFinite(manifest?.ms) ? ` ${manifest.ms}ms` : ""}`);
  }
  console.log(JSON.stringify(report.cells.map(({ name, summary, unavailable }) => ({ name, ...summary, unavailable: unavailable || null })), null, 2));
  if (report.cells.some((cell) => cell.samples.some((sample) => sample.status !== "passed") && !cell.unavailable)) process.exitCode = 1;
}
if (invoked(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(shutdown);
