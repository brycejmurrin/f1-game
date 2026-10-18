#!/usr/bin/env node
// @doc Regenerate locales/en.json and manifest hashes from I18n.t / data-i18n call sites.
/**
 * gen-locales — build locales/en.json and refresh locales/manifest.json hashes.
 *
 *   node tools/gen/gen-locales.mjs
 *   node tools/gen/gen-locales.mjs --check
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EN_REL = "locales/en.json";
const MANIFEST_REL = "locales/manifest.json";
const INDEX = path.join(ROOT, "index.html");

const USAGE = "usage: node tools/gen/gen-locales.mjs [--check]\n";

function sha8(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 8);
}

function walkJs(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) walkJs(abs, out);
    else if (name.endsWith(".js")) out.push(abs);
  }
  return out;
}

function scanCallSites() {
  const keys = new Map();
  const jsRoot = path.join(ROOT, "js");
  if (fs.existsSync(jsRoot)) {
    for (const file of walkJs(jsRoot)) {
      const text = fs.readFileSync(file, "utf8");
      const re = /I18n\.t\s*\(\s*["']([^"']+)["']\s*,\s*[^,]+,\s*["']([^"']*)["']\s*\)/g;
      let m;
      while ((m = re.exec(text))) keys.set(m[1], m[2]);
    }
  }
  if (fs.existsSync(INDEX)) {
    const html = fs.readFileSync(INDEX, "utf8");
    const re = /data-i18n=["']([^"']+)["'][^>]*>([^<]*)</g;
    let m;
    while ((m = re.exec(html))) {
      const k = m[1];
      const text = m[2].replace(/\s+/g, " ").trim();
      if (text) keys.set(k, text);
    }
  }
  return keys;
}

export function generate(root = ROOT) {
  const keys = scanCallSites();
  const sorted = [...keys.keys()].sort();
  const en = {};
  for (const k of sorted) en[k] = keys.get(k);
  const enText = JSON.stringify(en, null, 2) + "\n";
  const hash = sha8(enText);
  const manifest = { en: { name: "English", dir: "ltr", status: "reviewed", hash, keys: sorted.length } };
  const manifestPath = path.join(root, MANIFEST_REL);
  if (fs.existsSync(manifestPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      for (const id of Object.keys(prev)) {
        if (id === "en") continue;
        manifest[id] = prev[id];
      }
    } catch (_) { /* fresh */ }
  }
  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  return { [EN_REL]: enText, [MANIFEST_REL]: manifestText };
}

export function stale(root = ROOT) {
  const want = generate(root);
  const out = [];
  for (const [rel, content] of Object.entries(want)) {
    const abs = path.join(root, rel);
    const cur = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
    if (cur !== content) out.push(rel);
  }
  return out;
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE);
    return 0;
  }
  const check = argv.includes("--check");
  const drift = stale();
  if (check) {
    if (!drift.length) {
      process.stdout.write("gen-locales: up to date\n");
      return 0;
    }
    process.stderr.write(`gen-locales: STALE — ${drift.join(", ")}\n`);
    return 1;
  }
  const files = generate();
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    process.stdout.write(`${rel}: written\n`);
  }
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main();
}
