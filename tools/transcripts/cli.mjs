#!/usr/bin/env node
// @doc Stream Grok Bot ReadTranscript JSONL dumps: search / export / digest.
// Spec: docs/superpowers/specs/2026-10-25-grok-transcripts-cli-design.md
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, USAGE } from "./lib/args.mjs";
import { streamPaths, contentBlocks } from "./lib/stream.mjs";
import { matchRecord } from "./lib/match.mjs";
import { formatSearchHit } from "./lib/format.mjs";
import { createDigest, digestRecord, formatDigest } from "./lib/digest.mjs";

export { parseArgs, USAGE, matchRecord, createDigest, digestRecord, formatDigest, streamPaths };

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

/**
 * @param {string[]} argv
 * @param {{ stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream }} io
 */
export async function run(argv, io = {}) {
  const out = io.stdout || process.stdout;
  const err = io.stderr || process.stderr;
  const write = (s) => { out.write(s.endsWith("\n") ? s : s + "\n"); };
  const writeErr = (s) => { err.write(s.endsWith("\n") ? s : s + "\n"); };

  const args = parseArgs(argv);
  if (args.help) {
    write(USAGE);
    return 0;
  }
  if (args.error) {
    writeErr(args.error);
    writeErr(USAGE);
    return 2;
  }

  for (const p of args.paths) {
    try {
      await fs.promises.access(p, fs.constants.R_OK);
    } catch {
      writeErr(`unreadable path: ${p}`);
      return 1;
    }
  }

  const filters = {
    role: args.role,
    type: args.type,
    tool: args.tool,
    query: args.query,
  };

  try {
    if (args.cmd === "digest") {
      const state = createDigest();
      const stats = await streamPaths(args.paths, ({ record }) => {
        digestRecord(state, record);
      });
      state.files = stats.files;
      state.lines = stats.lines;
      state.bad = stats.bad;
      write(formatDigest(state));
      if (stats.bad) writeErr(`bad_json_lines=${stats.bad}`);
      return 0;
    }

    if (args.cmd === "export") {
      let dest = out;
      let closeDest = null;
      if (args.out && args.out !== "-") {
        dest = fs.createWriteStream(args.out, { encoding: "utf8" });
        closeDest = () => new Promise((resolve, reject) => {
          dest.end(() => resolve());
          dest.on("error", reject);
        });
      }
      const stats = await streamPaths(args.paths, ({ record }) => {
        const m = matchRecord(record, filters);
        if (!m.ok) return;
        dest.write(JSON.stringify(record) + "\n");
      });
      if (closeDest) await closeDest();
      if (stats.bad) writeErr(`bad_json_lines=${stats.bad}`);
      return 0;
    }

    if (args.cmd === "search") {
      const ctxN = args.context || 0;
      /** @type {{ file: string, line: number, record: object }[]} */
      const ring = [];
      let pendingAfter = 0;
      let lastHitLine = -1;

      const emitHit = (hit, blocks) => {
        write(formatSearchHit({ ...hit, blocks }, { json: args.json, query: args.query }));
      };

      const stats = await streamPaths(args.paths, async (hit) => {
        // Reset ring on file change
        if (ring.length && ring[0].file !== hit.file) {
          ring.length = 0;
          pendingAfter = 0;
          lastHitLine = -1;
        }
        const m = matchRecord(hit.record, filters);
        if (m.ok) {
          if (ctxN > 0 && !args.json) {
            for (const prev of ring.slice(-ctxN)) {
              if (prev.line === hit.line) continue;
              write(formatSearchHit({
                ...prev,
                blocks: contentBlocks(prev.record).slice(0, 1),
              }, { json: false }));
            }
          }
          emitHit(hit, m.blocks);
          lastHitLine = hit.line;
          pendingAfter = ctxN;
        } else if (pendingAfter > 0 && !args.json) {
          write(formatSearchHit({
            ...hit,
            blocks: contentBlocks(hit.record).slice(0, 1),
          }, { json: false }));
          pendingAfter--;
        }
        ring.push(hit);
        if (ring.length > ctxN + 1) ring.shift();
        void lastHitLine;
      });
      if (stats.bad) writeErr(`bad_json_lines=${stats.bad}`);
      return 0;
    }

    writeErr(`unknown command ${args.cmd}`);
    return 2;
  } catch (e) {
    writeErr(e && e.message ? e.message : String(e));
    return 1;
  }
}

if (isMain) {
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }).catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
