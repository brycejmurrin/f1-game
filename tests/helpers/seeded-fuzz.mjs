/* seeded-fuzz.mjs — Hash32-backed PRNG and mutation helpers for untrusted-input
 * fuzz harnesses. Same seed always yields the same mutation stream, so a red
 * prints the seed and is replayable without inventing a second RN.
 *
 * Built on js/core/hash32.js (FNV-1a + murmur-style mix): not simRnd(), and not
 * a dependency — the shipped IIFE is evaluated once into this module.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const HASH32_JS = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../js/core/hash32.js"),
  "utf8",
);
const _hashCtx = vm.createContext({});
vm.runInContext(HASH32_JS.replace(/^const\b/gm, "var"), _hashCtx, { filename: "js/core/hash32.js" });
export const Hash32 = _hashCtx.Hash32;

/** Seeded uint32 stream. `seed` may be a number or string; failures should print it. */
export function makeRng(seed) {
  let state = Hash32.fnv1a(String(seed)) >>> 0;
  const nextU32 = () => {
    state = Hash32.mix((state + 0x9e3779b9) >>> 0) >>> 0;
    return state;
  };
  return {
    seed,
    u32: nextU32,
    /** [0, 1) */
    unit() { return nextU32() / 4294967296; },
    /** integer in [0, n) */
    int(n) {
      const lim = n | 0;
      if (lim <= 0) return 0;
      return nextU32() % lim;
    },
    pick(arr) { return arr[nextU32() % arr.length]; },
    bool() { return (nextU32() & 1) === 1; },
  };
}

/** Hostile values for ONE field of an otherwise-valid upstream row (an OpenF1
 *  body): fractional, string-numeric, huge and negative counts beside the type
 *  swaps. `1e9` as a `lap_number` once sized a per-driver array and OOMed the
 *  process (R3-HOSTILE-1); `2.5` / `"57.5"` threw `Invalid array length`. */
export const HOSTILE_ROW_VALUES = Object.freeze([
  null, "", "x", -1, 0, 1.5, 2.5, "57.5", 101, 2e4, 3e6, 1e9, 5e9, -1e9, NaN, Infinity, "1e3",
  true, [], {}, "constructor", "__proto__", "2026-13-45T99:99:99Z",
]);

const TYPE_SWAPS = [
  null, undefined, true, false, 0, 1, -1, 0.5, NaN, Infinity, -Infinity,
  "", "0", "null", "undefined", "__proto__",
  [], {}, [0], { a: 1 },
];

/** ASCII / base64url / control / unicode leftovers that paste/hash paths see. */
function junkChar(rng) {
  const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.=+/ \t\n\r\0\u200B\uFEFF";
  return table[rng.int(table.length)];
}

function bitFlipString(s, rng) {
  const str = String(s);
  if (!str.length) return junkChar(rng);
  const i = rng.int(str.length);
  const code = str.charCodeAt(i) ^ (1 << rng.int(8));
  return str.slice(0, i) + String.fromCharCode(code & 0xff) + str.slice(i + 1);
}

function truncateString(s, rng) {
  const str = String(s);
  if (!str.length) return str;
  return str.slice(0, rng.int(str.length));
}

function hugeString(rng) {
  // Cap: enough to trip MAX_* gates without multi-MB allocations per trial.
  const n = 1024 + rng.int(48 * 1024);
  let out = "";
  const chunk = junkChar(rng).repeat(256);
  while (out.length < n) out += chunk;
  return out.slice(0, n);
}

function protoObject(rng) {
  const body = {
    __proto__: { polluted: true },
    constructor: { prototype: { polluted: true } },
    v: NaN,
    money: Infinity,
    team: undefined,
    nested: { __proto__: { x: 1 }, y: rng.int(9) },
  };
  if (rng.bool()) body["__proto__"] = { again: true };
  return body;
}

function mutateBytes(bytes, rng) {
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const kind = rng.int(6);
  if (kind === 0) return new Uint8Array(0);
  if (kind === 1) return src.slice(0, rng.int(Math.max(1, src.length)));
  if (kind === 2) {
    const out = new Uint8Array(src);
    if (out.length) out[rng.int(out.length)] ^= 1 << rng.int(8);
    return out;
  }
  if (kind === 3) {
    const n = 1 + rng.int(64);
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = rng.u32() & 0xff;
    return out;
  }
  if (kind === 4) return null;
  if (kind === 5) return undefined;
  return src;
}

/**
 * Mutate a corpus value. `corpus` is the "almost valid" seed; mutations cover
 * bit flips, truncation, type swaps, huge strings, __proto__ keys, NaN/Infinity.
 */
export function mutate(corpus, rng) {
  const kind = rng.int(10);
  if (kind === 0) return rng.pick(TYPE_SWAPS);
  if (kind === 1) return protoObject(rng);
  if (kind === 2) return hugeString(rng);
  if (kind === 3) return NaN;
  if (kind === 4) return Infinity;
  if (corpus == null) return rng.pick(TYPE_SWAPS);

  if (typeof corpus === "string") {
    if (kind === 5) return bitFlipString(corpus, rng);
    if (kind === 6) return truncateString(corpus, rng);
    if (kind === 7) return corpus + junkChar(rng);
    if (kind === 8) return "#" + corpus;
    return corpus.slice(rng.int(Math.max(1, corpus.length)));
  }

  if (corpus instanceof Uint8Array || ArrayBuffer.isView(corpus)) {
    return mutateBytes(corpus, rng);
  }

  if (typeof corpus === "object") {
    try {
      const clone = JSON.parse(JSON.stringify(corpus));
      if (kind === 5) {
        clone.__proto__ = { polluted: true };
        return clone;
      }
      if (kind === 6) {
        const keys = Object.keys(clone);
        if (keys.length) {
          const k = rng.pick(keys);
          clone[k] = rng.pick(TYPE_SWAPS);
        } else {
          clone.x = NaN;
        }
        return clone;
      }
      if (kind === 7) {
        clone[rng.pick(["__proto__", "constructor", "toString", "valueOf"])] = protoObject(rng);
        return clone;
      }
      if (kind === 8) return null;
      return clone;
    } catch (_) {
      return rng.pick(TYPE_SWAPS);
    }
  }

  return rng.pick(TYPE_SWAPS);
}

/** Walk a value tree; return paths whose values are NaN or undefined (own keys). */
export function findBadLiveValues(value, path = "") {
  const bad = [];
  if (value === undefined) {
    bad.push(path || "<root>");
    return bad;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    bad.push(path || "<root>");
    return bad;
  }
  if (!value || typeof value !== "object") return bad;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      bad.push(...findBadLiveValues(value[i], path + "[" + i + "]"));
    }
    return bad;
  }
  for (const k of Object.keys(value)) {
    // Prototype-pollution keys are refused by decoders; if they survive as own
    // keys with undefined, that is still a live-state leak.
    bad.push(...findBadLiveValues(value[k], path ? path + "." + k : k));
  }
  return bad;
}

/**
 * Run `N` seeded trials. On failure throws with the seed + trial index so the
 * case is replayable: `node --test --test-name-pattern=…` after fixing.
 */
export async function fuzz(name, seed, N, trial) {
  const rng = makeRng(seed);
  for (let i = 0; i < N; i++) {
    try {
      await trial(rng, i);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      const wrapped = new Error(
        `[fuzz ${name}] seed=${JSON.stringify(seed)} trial=${i}/${N}: ${msg}`,
      );
      wrapped.cause = err;
      throw wrapped;
    }
  }
}
