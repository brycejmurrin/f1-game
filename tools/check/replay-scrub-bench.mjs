#!/usr/bin/env node
// @doc Benchmark wrapped replay-ring lookups with 4/24 cars and sequential/random seeks; emits JSON, no browser.
import fs from "node:fs";
import vm from "node:vm";
import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { exitIfHelp } from "../lib/cli-args.mjs";

exitIfHelp(process.argv.slice(2), "node tools/check/replay-scrub-bench.mjs — five warmed 10,000-lookup batches per workload; JSON microseconds per lookup");
const root = fileURLToPath(new URL("../../", import.meta.url));
const source = fs.readFileSync(new URL("../../js/camera/replay-buf.js", import.meta.url), "utf8");
const ctx = vm.createContext({ Log: { info() {} }, Float32Array, Float64Array, Uint8Array });
vm.runInContext(source + ";globalThis.R = ReplayBuf;", ctx);
const R = ctx.R, results = [], samples = 10000;
for (const n of [4, 24]) {
  const cars = Array.from({ length: n }, (_, i) => ({ s: i, x: 0, head: 0, speed: 60,
    px: i, py: 0, pz: 0, steer: 0, yawVis: 0 }));
  const api = R.create({ cars, track: { total: 6000 } });
  api.reset(cars);
  for (let i = 0; i < 1800; i++) {
    for (const c of cars) { c.s += 2; c.px += 2; }
    api.sample(i / 30, cars);
  }
  const w = api.window();
  for (const pattern of ["sequential", "random"]) {
    let seed = 42;
    const times = Array.from({ length: samples }, (_, i) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return w.t0 + (w.t1 - w.t0) * (pattern === "random" ? seed / 4294967296 : (i % 600) / 599);
    });
    for (let i = 0; i < 2000; i++) api.at(times[i]);
    const timings = [];
    let checksum = 0;
    for (let batch = 0; batch < 5; batch++) {
      const start = performance.now();
      for (const t of times) checksum += api.at(t).cars[0].s;
      timings.push((performance.now() - start) * 1000 / samples);
    }
    timings.sort((a, b) => a - b);
    results.push({ cars: n, frames: w.frames, pattern, samples,
      medianUsPerLookup: timings[2], minUsPerLookup: timings[0], maxUsPerLookup: timings[4], checksum });
  }
}
console.log(JSON.stringify({ revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  runtime: process.version, note: "Node VM microbenchmark on this machine; not player frame-time or GC evidence", results }, null, 2));
