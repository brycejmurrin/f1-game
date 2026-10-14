// @doc Bounded Chromium GPU provenance and opt-in streamed capture tracing.
import { mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";

function bounded(task, ms, label) {
  let timer;
  return Promise.race([Promise.resolve(task), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`capture: ${label} timed out after ${ms}ms`)), ms);
  })]).finally(() => clearTimeout(timer));
}
const message = (error) => error?.message || String(error);
const softwareRenderer = (value) => /swiftshader|llvmpipe|lavapipe|softpipe|software|warp|basic render/i.test(value);
const shortCleanup = async (task) => { try { await bounded(task, 1000, "diagnostic cleanup"); } catch { /* keep the original failure */ } };

/** Diagnostics are best effort; explicitly requested GPU capabilities are checked separately. */
export async function captureBrowserDiagnostics(browser, { requested = {}, executable = null, timeoutMs = 3000 } = {}) {
  const result = { requested, executable, version: browser.version(), actual: null, error: null };
  let session, expired = false;
  const work = (async () => {
    session = await browser.newBrowserCDPSession();
    if (expired) { await shortCleanup(session.detach()); return; }
    const info = await session.send("SystemInfo.getInfo");
    if (expired) return;
    const gpu = info.gpu || {}, attrs = gpu.auxAttributes || {};
    const renderer = String(attrs.glRenderer || attrs.gl_renderer || "");
    result.actual = { renderer: renderer || null, vendor: attrs.glVendor || attrs.gl_vendor || null,
      software: renderer ? softwareRenderer(renderer) : null,
      devices: gpu.devices || [], featureStatus: gpu.featureStatus || {} };
  })();
  try { await bounded(work, timeoutMs, "GPU diagnostics"); }
  catch (error) { expired = true; result.error = message(error); }
  finally { if (session) await shortCleanup(session.detach()); }
  return result;
}

/** Fail explicit requests rather than silently accepting a software/hardware fallback. */
export function assertCaptureGpuCapability(diagnostics, options = {}) {
  if (!options.gpuExplicit) return;
  const actual = diagnostics.actual, renderer = actual?.renderer || "";
  if (!renderer) throw new Error(`capture: cannot verify requested GPU profile ${options.gpu}: ${diagnostics.error || "Chromium reported no renderer"}`);
  const matches = options.gpu === "hardware" ? actual.software === false
    : options.gpu === "swiftshader" ? /swiftshader/i.test(renderer)
    : options.gpu === "llvmpipe" ? /llvmpipe/i.test(renderer)
    : options.gpu === "lavapipe" ? /lavapipe|llvmpipe/i.test(renderer) : false;
  if (!matches) throw new Error(`capture: requested GPU profile ${options.gpu}, actual renderer is ${renderer}`);
}

/** Start before navigation. Caller MUST stop in finally before closing the browser. */
export async function startCaptureTrace(browser, { path: outputPath, timeoutMs = 5000,
  stopTimeoutMs = 15000, maxBytes = 64 * 1024 * 1024,
  categories = ["devtools", "cc", "viz", "gpu"] } = {}) {
  if (!outputPath) throw new Error("capture: trace output path is required");
  let session, expired = false;
  const starting = (async () => {
    session = await browser.newBrowserCDPSession();
    if (expired) { await shortCleanup(session.detach()); return; }
    await session.send("Tracing.start", { transferMode: "ReturnAsStream", streamFormat: "json",
      traceConfig: { recordMode: "recordUntilFull", includedCategories: categories } });
    if (expired) { await shortCleanup(session.send("Tracing.end")); await shortCleanup(session.detach()); }
  })();
  try { await bounded(starting, timeoutMs, "trace start"); }
  catch (error) {
    expired = true;
    if (session) { await shortCleanup(session.send("Tracing.end")); await shortCleanup(session.detach()); }
    throw error;
  }
  let stopped;
  return { path: outputPath, stop() {
    if (stopped) return stopped;
    stopped = (async () => {
      const deadline = Date.now() + stopTimeoutMs;
      const remaining = () => Math.max(1, deadline - Date.now());
      let stream, file, ownsFile = false, bytes = 0, onComplete;
      const completion = new Promise((resolve) => {
        onComplete = resolve;
        session.once("Tracing.tracingComplete", onComplete);
      });
      try {
        await bounded(session.send("Tracing.end"), remaining(), "trace stop");
        const completed = await bounded(completion, remaining(), "trace completion");
        stream = completed.stream;
        if (!stream) throw new Error("capture: Chromium trace completed without an IO stream");
        await mkdir(path.dirname(outputPath), { recursive: true });
        file = await open(outputPath, "wx"); ownsFile = true;
        for (;;) {
          if (Date.now() >= deadline) throw new Error("capture: trace stream exceeded its time budget");
          const chunk = await bounded(session.send("IO.read", { handle: stream, size: 256 * 1024 }), remaining(), "trace stream read");
          const buffer = Buffer.from(chunk.data || "", chunk.base64Encoded ? "base64" : "utf8");
          bytes += buffer.length;
          if (bytes > maxBytes) throw new Error(`capture: trace exceeded ${maxBytes} bytes`);
          if (buffer.length) await bounded(file.writeFile(buffer), remaining(), "trace file write");
          if (chunk.eof) break;
        }
        await file.close(); file = null;
        return { path: outputPath, bytes };
      } catch (error) {
        if (file) { await file.close().catch(() => {}); file = null; }
        if (ownsFile) await unlink(outputPath).catch(() => {});
        throw error;
      } finally {
        session.removeListener("Tracing.tracingComplete", onComplete);
        if (stream) await shortCleanup(session.send("IO.close", { handle: stream }));
        await shortCleanup(session.detach());
      }
    })();
    return stopped;
  } };
}
