#!/usr/bin/env node
/**
 * Concatenate third-party credits/licences into desktop/build/THIRD-PARTY-NOTICES.txt.
 * Output is generated (gitignored); do not commit it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.resolve(HERE, "../build/THIRD-PARTY-NOTICES.txt");

/** Repo-relative licence / credits files that must exist in git. */
export const NOTICE_SOURCES = [
  "assets/music/CREDITS.txt",
  "assets/sfx/CREDITS.txt",
  "assets/voice/CREDITS.txt",
  "assets/pack/CREDITS.md",
  "assets/icons/lucide-LICENSE.txt",
  "vendor/three-0.186.0/LICENSE.txt",
  "vendor/rapier-0.19.3/LICENSE",
  "vendor/jsqr-1.4.0/LICENSE",
  "vendor/trystero-0.25.4/LICENSE-trystero",
  "vendor/trystero-0.25.4/LICENSE-noble-secp256k1",
];

export function buildNoticesText(root = ROOT) {
  const parts = [
    "Apex 26 — third-party notices",
    "",
    "The game itself is UNLICENSED in the root package.json; the project owner's",
    "licence text is a human decision and is not invented here.",
    "",
  ];
  for (const rel of NOTICE_SOURCES) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`notices: missing ${rel} (expected at ${abs})`);
    }
    parts.push("=".repeat(72));
    parts.push(rel);
    parts.push("=".repeat(72));
    parts.push(fs.readFileSync(abs, "utf8").replace(/\s+$/, ""));
    parts.push("");
  }
  return parts.join("\n") + "\n";
}

export function writeNotices(root = ROOT, dest = OUT) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const text = buildNoticesText(root);
  fs.writeFileSync(dest, text);
  return dest;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const dest = writeNotices();
  console.log(JSON.stringify({ ok: true, dest, sources: NOTICE_SOURCES.length }));
}
