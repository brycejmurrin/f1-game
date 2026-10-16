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
const digest = (bytes, encoding = "base64") => createHash("sha256").update(bytes).digest(encoding);
const cleanBase = (base) => base.endsWith("/") ? base : `${base}/`;
const urlFor = (base, rel) => new URL(rel.replace(/^\//, ""), cleanBase(base)).href;

async function fetchBytes(url) {
  const signal = AbortSignal.timeout(timeoutMs);
  const response = await fetch(url, { cache: "no-store", signal });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return bytes;
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
export async function verifyLive({ baseUrl, root, files = ["index.html", "version.json", "sw.js", "controller.html", "cockpit-view.html"] }) {
  const cacheBust = `__verify=${Date.now()}`;
  const get = (rel) => fetchBytes(`${urlFor(baseUrl, rel)}${urlFor(baseUrl, rel).includes("?") ? "&" : "?"}${cacheBust}`);
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
