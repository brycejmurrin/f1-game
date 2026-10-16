#!/usr/bin/env node
/**
 * Resolve the electron-builder --dir unpacked binary for this host platform.
 *
 *   node scripts/unpacked-bin.mjs           # print path
 *   node scripts/unpacked-bin.mjs --json    # { path, platform, ... }
 *
 * Paths follow electron-builder conventions (confirm locally if a bump moves them):
 *   linux:  dist/linux-unpacked/{name}
 *   win:    dist/win-unpacked/{name}.exe
 *   mac:    dist/mac[-arm64|-x64]/{ProductName}.app/Contents/MacOS/{ProductName}
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, "..");
const DIST = path.join(DESKTOP, "dist");

/**
 * @param {{ desktopRoot?: string, platform?: NodeJS.Platform }} [opts]
 * @returns {{ path: string, platform: string, isPackagedLayout: true }}
 */
export function findUnpackedBinary(opts = {}) {
  const root = opts.desktopRoot || DESKTOP;
  const dist = path.join(root, "dist");
  const platform = opts.platform || process.platform;
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const name = pkg.name || "apex26-desktop";
  const product = pkg.productName || "Apex 26";

  let candidate;
  if (platform === "linux") {
    candidate = path.join(dist, "linux-unpacked", name);
  } else if (platform === "win32") {
    const winDir = path.join(dist, "win-unpacked");
    const candidates = [
      path.join(winDir, `${name}.exe`),
      path.join(winDir, `${product}.exe`),
      // electron-builder sometimes sanitizes spaces in the exe stem
      path.join(winDir, `${String(product).replace(/\s+/g, "")}.exe`),
      path.join(winDir, `${String(product).replace(/\s+/g, "-")}.exe`),
    ];
    candidate = candidates.find((p) => fs.existsSync(p));
    if (!candidate && fs.existsSync(winDir)) {
      const hit = fs.readdirSync(winDir).find((f) => f.toLowerCase().endsWith(".exe"));
      if (hit) candidate = path.join(winDir, hit);
    }
    if (!candidate) candidate = candidates[0];
  } else if (platform === "darwin") {
    // arm64 → mac-arm64 or mac; x64 → mac or mac-x64 depending on builder version
    const macDirs = fs.existsSync(dist)
      ? fs.readdirSync(dist).filter((d) => d.startsWith("mac")).map((d) => path.join(dist, d))
      : [];
    for (const dir of macDirs) {
      const app = path.join(dir, `${product}.app`, "Contents", "MacOS", product);
      if (fs.existsSync(app)) {
        candidate = app;
        break;
      }
    }
    if (!candidate) {
      candidate = path.join(dist, "mac", `${product}.app`, "Contents", "MacOS", product);
    }
  } else {
    throw new Error(`unpacked-bin: unsupported platform ${platform}`);
  }

  if (!candidate || !fs.existsSync(candidate)) {
    throw new Error(
      `unpacked-bin: no packaged binary at ${candidate || "(unknown)"}. ` +
      `Run: cd desktop && npm run pack`,
    );
  }
  return { path: candidate, platform, isPackagedLayout: true, productName: product, name };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const info = findUnpackedBinary();
  if (process.argv.includes("--json")) console.log(JSON.stringify(info));
  else console.log(info.path);
}
