#!/usr/bin/env node
// menu-dom-gallery.mjs — batch menu PNG + DOM gallery (wgx-gallery + tuner-sweep shape).
//
// ONE boot per viewport, parallel --jobs, resumable (skip recorded cells).
//
//   npm run menu:gallery
//   node tools/menu-dom-gallery.mjs --list
//   node tools/menu-dom-gallery.mjs --report
//   node tools/menu-dom-gallery.mjs --screens=title,select,garage --viewports=ios-iphone-landscape --jobs=1
//   node tools/menu-dom-gallery.mjs --force
//
// Single cell: node tools/menu-shot.mjs settings
//
// Output: artifacts/menu-dom-gallery/{manifest.json,index.html,shots/,dom/}
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  runMenuGallery,
  reportMenuGallery,
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
  const opts = parseMenuGalleryArgv(process.argv.slice(2));
  if (opts.list) {
    printMenuCatalog();
    process.exit(0);
  }
  if (opts.report) {
    const r = reportMenuGallery(opts.outDir);
    process.exit(r.ok ? 0 : 1);
  }
  runMenuGallery({
    screens: opts.screens,
    viewports: opts.viewports,
    scales: opts.scales,
    circuits: opts.circuits,
    jobs: opts.jobs,
    force: opts.force,
    outDir: opts.outDir,
  }).then((r) => {
    console.log(`\n${r.rows.length} cells -> ${r.outDir} (${r.skipped} skipped)`);
    process.exit(r.ok ? 0 : 1);
  }).catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
