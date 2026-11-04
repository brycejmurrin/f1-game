// @doc Write a CLI --json document to stdout synchronously; a failed write exits non-zero, never a silent truncation.
// emitJsonAndExit — write a CLI's --json document to stdout synchronously, then exit.
// `console.log(x); process.exit(0)` truncates piped output above the kernel pipe
// buffer (~64-145 KB) and still exits 0 (#4943): pipe writes are async. Here the
// whole document is written with fs.writeSync (retrying EAGAIN on a full non-blocking
// pipe) and any other failure exits 1, so a consumer never parses a silent truncation.
import fs from "node:fs";

export function writeStdoutSync(text) {
  const buf = Buffer.from(text);
  let off = 0;
  while (off < buf.length) {
    try { off += fs.writeSync(1, buf, off, buf.length - off); }
    catch (e) {
      if (e.code === "EAGAIN") { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5); continue; }
      process.stderr.write(`emit-json: stdout write failed after ${off}/${buf.length} bytes: ${e.code || e.message}\n`);
      process.exit(1);
    }
  }
}

export function emitJsonAndExit(text, code = 0) {
  writeStdoutSync(text + "\n");
  process.exit(code);
}
