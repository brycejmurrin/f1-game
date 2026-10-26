// @doc Filters + query match for transcript content blocks.
import { contentBlocks } from "./stream.mjs";

function stringify(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Haystack strings for a single content block (for substring search). */
export function blockHaystacks(block) {
  if (!block || typeof block !== "object") return [];
  const out = [];
  if (typeof block.text === "string") out.push(block.text);
  if (typeof block.thinking === "string") out.push(block.thinking);
  if (typeof block.name === "string") out.push(block.name);
  if (block.input !== undefined) out.push(stringify(block.input));
  if (block.result !== undefined) out.push(stringify(block.result));
  return out;
}

/** Short snippet for display; prefer a haystack that contains `prefer` (e.g. the query). */
export function blockSnippet(block, max = 120, prefer = null) {
  const parts = blockHaystacks(block);
  let raw = parts[0] || "";
  if (prefer) {
    const q = String(prefer).toLowerCase();
    const hit = parts.find((p) => p.toLowerCase().includes(q));
    if (hit) raw = hit;
  }
  const s = raw.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  // Keep the prefer term visible when truncating.
  if (prefer) {
    const idx = s.toLowerCase().indexOf(String(prefer).toLowerCase());
    if (idx > 20) {
      const start = Math.max(0, idx - 20);
      const slice = (start > 0 ? "…" : "") + s.slice(start, start + max - 1);
      return slice.length < s.length - start ? slice + "…" : slice;
    }
  }
  return s.slice(0, max - 1) + "…";
}

/**
 * @param {object} record
 * @param {{ role?: string, type?: string, tool?: string, query?: string }} filters
 * @returns {{ ok: boolean, blocks: object[] }} matching blocks (or all blocks if no query/type/tool)
 */
export function matchRecord(record, filters = {}) {
  if (filters.role && record.role !== filters.role) {
    return { ok: false, blocks: [] };
  }
  const blocks = contentBlocks(record);
  const q = filters.query ? String(filters.query).toLowerCase() : null;
  const toolWant = filters.tool ? String(filters.tool).toLowerCase() : null;
  const typeWant = filters.type || null;

  const matched = [];
  for (const block of blocks) {
    if (typeWant && block.type !== typeWant) continue;
    if (toolWant) {
      const name = typeof block.name === "string" ? block.name.toLowerCase() : "";
      if (name !== toolWant) continue;
    }
    if (q) {
      const hay = blockHaystacks(block).join("\n").toLowerCase();
      if (!hay.includes(q)) continue;
    }
    matched.push(block);
  }

  // No type/tool/query → whole record matches (role already checked).
  if (!typeWant && !toolWant && !q) {
    return { ok: true, blocks };
  }
  return { ok: matched.length > 0, blocks: matched };
}
