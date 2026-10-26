// @doc Human and JSON formatters for search hits.
import { blockSnippet } from "./match.mjs";

/**
 * @param {{ file: string, line: number, record: object, blocks: object[] }} hit
 * @param {{ json?: boolean, query?: string }} opts
 */
export function formatSearchHit(hit, opts = {}) {
  const block = hit.blocks[0] || {};
  const type = block.type || "?";
  const snippet = blockSnippet(block, 120, opts.query || null);
  if (opts.json) {
    return JSON.stringify({
      file: hit.file,
      line: hit.line,
      role: hit.record.role || null,
      type,
      tool: typeof block.name === "string" ? block.name : undefined,
      snippet,
    });
  }
  const role = hit.record.role || "?";
  return `${hit.file}:${hit.line}\t${role}\t${type}\t${snippet}`;
}

export function formatContextBanner(file, line, kind) {
  return `--- ${kind} ${file}:${line} ---`;
}
