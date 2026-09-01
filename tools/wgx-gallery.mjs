#!/usr/bin/env node
// Forwarder → wgx-shot.mjs --gallery (kept for docs/skills that still name wgx-gallery).
// @doc Thin forwarder → `wgx-shot.mjs --gallery` (kept for docs/skills).
// @skill webgpu-debug / playwright-probe
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Build argv for wgx-shot --gallery; caller flags pass through. */
export function buildWgxGalleryArgs(userArgv) {
  const extra = userArgv.slice();
  if (!extra.includes("--gallery")) extra.unshift("--gallery");
  return extra;
}

function invokedAsCli() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === resolve(entry);
  } catch {
    return false;
  }
}

if (invokedAsCli()) {
  const dest = fileURLToPath(new URL("./wgx-shot.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [dest, ...buildWgxGalleryArgs(process.argv.slice(2))], {
    stdio: "inherit",
  });
  process.exit(r.status ?? 1);
}
