#!/usr/bin/env node
// Verify the bytes published by Pages against the stamped runtime tree.
// @doc Post-deploy byte and SHA-256 verification for the shell, secondary pages, service worker, and lazy assets.
// This runs from a fresh checkout after deploy, so it catches CDN/artifact
// publication errors that version.json and the shell meta cannot see.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const timeoutMs = 15_000;
/** GitHub Pages / Fastly occasionally answers 502/503 for one lazy path while
 *  version.json and index.html are already live (pages.yml verify-live, Oct 18
 *  failures on fuji.js / spotter.js / tlx-shadow.js). Retry those, not 404. */
const TRANSIENT_HTTP = new Set([502, 503, 504, 429]);
const digest = (bytes, encoding = "base64") => createHash("sha256").update(bytes).digest(encoding);
const cleanBase = (base) => base.endsWith("/") ? base : `${base}/`;
const urlFor = (base, rel) => new URL(rel.replace(/^\//, ""), cleanBase(base)).href;

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cache-busted GET with bounded retries on transient CDN status codes.
 * @param {string} url
 * @param {{retries?: number, sleep?: (ms:number)=>Promise<void>, fetchImpl?: typeof fetch}} [opts]
 */
export async function fetchBytes(url, opts = {}) {
  const retries = opts.retries ?? 4;
  const sleep = opts.sleep ?? defaultSleep;
  const fetchImpl = opts.fetchImpl ?? fetch;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const signal = AbortSignal.timeout(timeoutMs);
      const response = await fetchImpl(url, { cache: "no-store", signal });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!response.ok) {
        const err = new Error(`${url}: HTTP ${response.status}`);
        if (TRANSIENT_HTTP.has(response.status) && attempt < retries) {
          lastError = err;
          await sleep(Math.min(8_000, 400 * 2 ** attempt));
          continue;
        }
        throw err;
      }
      return bytes;
    } catch (error) {
      lastError = error;
      const status = Number(/HTTP (\d+)/.exec(error?.message || "")?.[1] || 0);
      const transient = TRANSIENT_HTTP.has(status) || /ECONNRESET|ETIMEDOUT|abort/i.test(error?.message || "");
      if (transient && attempt < retries) {
        await sleep(Math.min(8_000, 400 * 2 ** attempt));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function readExpected(root, rel) {
  return fs.readFile(path.join(root, rel));
}

function jsonBlock(html, id) {
  const match = html.match(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`));
  if (!match) throw new Error(`index.html: missing ${id}`);
  try { return JSON.parse(match[1]); }
  catch { throw new Error(`index.html: invalid JSON in ${id}`); }
}

/**
 * Verify a stamped runtime tree against a live Pages base URL.
 * @param {{baseUrl:string, root:string, files?:string[]}} options
 */
export async function verifyLive({
  baseUrl,
  root,
  files = ["index.html", "version.json", "sw.js", "controller.html", "cockpit-view.html"],
  fetchOpts = {},
} = {}) {
  const cacheBust = `__verify=${Date.now()}`;
  const get = (rel) => fetchBytes(
    `${urlFor(baseUrl, rel)}${urlFor(baseUrl, rel).includes("?") ? "&" : "?"}${cacheBust}`,
    fetchOpts,
  );
  const errors = [];
  const checked = [];
  const compare = async (rel) => {
    try {
      const [actual, expected] = await Promise.all([get(rel), readExpected(root, rel)]);
      checked.push(rel);
      if (!actual.equals(expected)) {
        errors.push(`${rel}: live bytes differ (live sha256=${digest(actual, "hex")}, expected sha256=${digest(expected, "hex")})`);
      }
      return actual;
    } catch (error) {
      errors.push(error.message);
      return null;
    }
  };

  const index = await compare("index.html");
  await Promise.all(files.filter((rel) => rel !== "index.html").map(compare));
  if (index) {
    let integrity;
    try { integrity = jsonBlock(index.toString("utf8"), "apex-lazy-integrity"); }
    catch (error) { errors.push(error.message); integrity = {}; }
    const lazy = Object.entries(integrity || {});
    const results = await Promise.all(lazy.map(async ([rel, expectedSri]) => {
      try {
        const actual = await get(rel);
        const expected = await readExpected(root, rel);
        const sri = `sha256-${digest(actual)}`;
        const expectedFileSri = `sha256-${digest(expected)}`;
        checked.push(rel);
        if (sri !== expectedSri) errors.push(`${rel}: live hash ${sri} does not match shell ${expectedSri}`);
        if (sri !== expectedFileSri) errors.push(`${rel}: live bytes differ from checked-out commit`);
      } catch (error) { errors.push(error.message); }
    }));
    void results;
  }
  return { ok: errors.length === 0, checked, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [baseUrl, root = "."] = process.argv.slice(2);
  if (!baseUrl) { console.error("usage: node tools/ci/verify-live.mjs <base-url> [runtime-root]"); process.exit(2); }
  const result = await verifyLive({ baseUrl, root: path.resolve(root) });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
