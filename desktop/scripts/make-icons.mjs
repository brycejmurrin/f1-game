#!/usr/bin/env node
/**
 * Generate desktop icons from icons/icon-512.png.
 *
 * There is no 1024 master in the repo. The 1024 PNG is an upscale labelled
 * PLACEHOLDER — replace with a human-supplied master before store art.
 *
 * Uses the repo-root `sharp` devDependency (not added to desktop/).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const BUILD = path.resolve(HERE, "../build");
const ICONS_DIR = path.join(BUILD, "icons");
const SRC = path.join(ROOT, "icons", "icon-512.png");

async function loadSharp() {
  const { createRequire } = await import("node:module");
  const req = createRequire(path.join(ROOT, "package.json"));
  try {
    return req("sharp");
  } catch (err) {
    throw new Error(`make-icons: sharp not found (install root npm deps): ${err.message}`);
  }
}

function placeholderSvg(width) {
  const font = Math.max(18, Math.round(width / 18));
  return Buffer.from(
    `<svg width="${width}" height="${width}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${width - font * 2.4}" width="${width}" height="${font * 2.4}" fill="#000000" fill-opacity="0.55"/>
      <text x="50%" y="${width - font * 0.7}" text-anchor="middle" fill="#ffcc00"
        font-family="sans-serif" font-size="${font}" font-weight="700">PLACEHOLDER 512→${width}</text>
    </svg>`,
  );
}

export async function makeIcons() {
  if (!fs.existsSync(SRC)) {
    throw new Error(`make-icons: missing ${SRC}`);
  }
  const sharp = await loadSharp();
  fs.mkdirSync(ICONS_DIR, { recursive: true });

  const src512 = await sharp(SRC).resize(512, 512).png().toBuffer();
  await sharp(src512).toFile(path.join(BUILD, "icon.png"));
  await sharp(src512).toFile(path.join(ICONS_DIR, "512x512.png"));

  for (const size of [16, 32, 48, 64, 128, 256]) {
    await sharp(src512)
      .resize(size, size)
      .png()
      .toFile(path.join(ICONS_DIR, `${size}x${size}.png`));
  }

  const up = await sharp(SRC).resize(1024, 1024, { kernel: "lanczos3" }).png().toBuffer();
  await sharp(up)
    .composite([{ input: placeholderSvg(1024), top: 0, left: 0 }])
    .png()
    .toFile(path.join(BUILD, "icon-1024-PLACEHOLDER.png"));

  return {
    source: SRC,
    icon: path.join(BUILD, "icon.png"),
    placeholder1024: path.join(BUILD, "icon-1024-PLACEHOLDER.png"),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = await makeIcons();
  console.log(JSON.stringify({ ok: true, ...out }));
}
