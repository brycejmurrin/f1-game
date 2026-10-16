#!/usr/bin/env node
/**
 * Raster adaptive launcher icons from icons/icon-512.png + icon-maskable-512.png.
 * Writes mipmap-* under android/app/src/main/res when that tree exists.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const RES = path.resolve(HERE, "../android/app/src/main/res");

const SIZES = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

const FG = {
  "mipmap-mdpi": 108,
  "mipmap-hdpi": 162,
  "mipmap-xhdpi": 216,
  "mipmap-xxhdpi": 324,
  "mipmap-xxxhdpi": 432,
};

async function loadSharp() {
  const candidates = [
    path.join(ROOT, "node_modules", "sharp"),
    path.join(HERE, "../node_modules", "sharp"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const { createRequire } = await import("node:module");
      return createRequire(import.meta.url)(p);
    }
  }
  throw new Error("gen-icons: sharp is not installed (root npm ci)");
}

function xmlAdaptive() {
  return `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
}

function colorsXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0c0c14</color>
</resources>
`;
}

async function main() {
  if (!fs.existsSync(RES)) {
    console.log(JSON.stringify({ ok: false, skipped: "no android/app/src/main/res yet" }));
    return;
  }
  const sharp = await loadSharp();
  const src512 = path.join(ROOT, "icons", "icon-512.png");
  const srcMask = path.join(ROOT, "icons", "icon-maskable-512.png");
  if (!fs.existsSync(src512) || !fs.existsSync(srcMask)) {
    throw new Error("gen-icons: missing icons/icon-512.png or icons/icon-maskable-512.png");
  }
  for (const [dir, px] of Object.entries(SIZES)) {
    const outDir = path.join(RES, dir);
    fs.mkdirSync(outDir, { recursive: true });
    await sharp(src512).resize(px, px).png().toFile(path.join(outDir, "ic_launcher.png"));
    await sharp(src512).resize(px, px).png().toFile(path.join(outDir, "ic_launcher_round.png"));
    const fg = FG[dir];
    await sharp(srcMask).resize(fg, fg).png().toFile(path.join(outDir, "ic_launcher_foreground.png"));
  }
  const any = path.join(RES, "mipmap-anydpi-v26");
  fs.mkdirSync(any, { recursive: true });
  fs.writeFileSync(path.join(any, "ic_launcher.xml"), xmlAdaptive());
  fs.writeFileSync(path.join(any, "ic_launcher_round.xml"), xmlAdaptive());
  const values = path.join(RES, "values");
  fs.mkdirSync(values, { recursive: true });
  const colorsPath = path.join(values, "ic_launcher_background.xml");
  fs.writeFileSync(colorsPath, colorsXml());
  console.log(JSON.stringify({ ok: true, res: RES, densities: Object.keys(SIZES) }));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e && e.message ? e.message : e);
    process.exit(1);
  });
}
