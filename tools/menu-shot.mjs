#!/usr/bin/env node
// menu-shot.mjs — one menu screen × one viewport (wgx-shot shape).
//
//   node tools/menu-shot.mjs settings
//   node tools/menu-shot.mjs garage --viewport ios-iphone-portrait
//   node tools/menu-shot.mjs --list
//
// menu-dom-gallery.mjs imports the same engine for batch runs.
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  runMenuShot,
  printMenuCatalog,
  parseMenuGalleryArgv,
} from "./menu-capture.mjs";

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
  const argv = process.argv.slice(2);
  if (argv.includes("--list")) {
    printMenuCatalog();
    process.exit(0);
  }
  const opts = parseMenuGalleryArgv(argv);
  const screen = opts.screen || "title";
  runMenuShot({
    screen,
    viewport: opts.viewport,
    outDir: opts.outDir,
    force: argv.includes("--force"),
  }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }).catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
