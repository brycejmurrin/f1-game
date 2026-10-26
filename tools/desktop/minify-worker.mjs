// @doc Bounded persistent Terser workers; write disposable results before the stage publishes them.
import fs from "node:fs";
import path from "node:path";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { minifySource } from "./minify.mjs";

if (!isMainThread && workerData?.stageMinify) {
  parentPort.on("message", async ({ index, rel, siteRoot, resultRoot }) => {
    try {
      const src = fs.readFileSync(path.join(siteRoot, rel), "utf8");
      const out = await minifySource(src, rel);
      fs.writeFileSync(path.join(resultRoot, `${index}.js`), out.code);
      fs.writeFileSync(path.join(resultRoot, `${index}.map`), out.map);
      parentPort.postMessage({ index, before: Buffer.byteLength(src), after: Buffer.byteLength(out.code) });
    } catch (error) {
      parentPort.postMessage({ index, error: error.message });
    }
  });
}

/** One outstanding file per worker, with no source/code/map payloads queued in memory.
 * WorkerClass is injectable so lifecycle tests can observe real thread termination.
 */
export async function minifyInWorkers({ siteRoot, targets, resultRoot, jobs, WorkerClass = Worker }) {
  const workers = [];
  let settled = false;
  try {
    return await new Promise((resolve, reject) => {
      let next = 0, complete = 0;
      const results = new Array(targets.length);
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const dispatch = (worker) => {
        if (settled || next === targets.length) return;
        const index = next++;
        worker.current = index;
        worker.postMessage({ index, rel: targets[index], siteRoot, resultRoot });
      };
      if (!targets.length) { settled = true; resolve(results); return; }
      for (let i = 0; i < Math.min(jobs, targets.length); i++) {
        const worker = new WorkerClass(new URL("./minify-worker.mjs", import.meta.url), {
          workerData: { stageMinify: true },
          resourceLimits: { maxOldGenerationSizeMb: 256 },
        });
        workers.push(worker);
        worker.on("error", (error) => fail(new Error(`minify: ${targets[worker.current]}: ${error.message}`)));
        worker.on("exit", (code) => fail(new Error(`minify: ${targets[worker.current]}: worker exited (${code})`)));
        worker.on("message", (result) => {
          if (settled) return;
          if (result.index !== worker.current) { fail(new Error("minify: unexpected worker result")); return; }
          if (result.error) { fail(new Error(`minify: ${targets[result.index]}: ${result.error}`)); return; }
          results[result.index] = result;
          if (++complete === targets.length) { settled = true; resolve(results); }
          else {
            try { dispatch(worker); } catch (error) { fail(error); }
          }
        });
        dispatch(worker);
      }
    });
  } finally {
    settled = true;
    // A parse error, crash, or constructor failure stops dispatch and joins EVERY
    // thread before rejecting. No caller can stamp while work is still running.
    await Promise.allSettled(workers.map((worker) => worker.terminate()));
  }
}
