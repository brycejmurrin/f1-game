// @doc Line-by-line JSONL streamer for Grok transcript dumps — never loads the whole file.
import fs from "node:fs";
import readline from "node:readline";

/**
 * @typedef {{ file: string, line: number, record: object }} TranscriptHit
 */

/**
 * Stream parsed JSONL records from one file.
 * @param {string} file
 * @param {(hit: TranscriptHit) => void | Promise<void>} onRecord
 * @returns {Promise<{ lines: number, bad: number }>}
 */
export async function streamFile(file, onRecord) {
  await fs.promises.access(file, fs.constants.R_OK);
  const stream = fs.createReadStream(file, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let line = 0;
  let bad = 0;
  let lines = 0;
  try {
    for await (const raw of rl) {
      line++;
      const text = raw.trim();
      if (!text) continue;
      lines++;
      let record;
      try {
        record = JSON.parse(text);
      } catch {
        bad++;
        continue;
      }
      await onRecord({ file, line, record });
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  return { lines, bad };
}

/**
 * Stream many files in order.
 * @param {string[]} paths
 * @param {(hit: TranscriptHit) => void | Promise<void>} onRecord
 * @returns {Promise<{ files: number, lines: number, bad: number }>}
 */
export async function streamPaths(paths, onRecord) {
  let lines = 0;
  let bad = 0;
  for (const file of paths) {
    const r = await streamFile(file, onRecord);
    lines += r.lines;
    bad += r.bad;
  }
  return { files: paths.length, lines, bad };
}

/** Flatten content blocks from a record (tolerant of missing shape). */
export function contentBlocks(record) {
  const content = record && record.message && record.message.content;
  return Array.isArray(content) ? content : [];
}
