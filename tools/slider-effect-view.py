#!/usr/bin/env python3
"""Isolate what a lighting-slider A/B actually moved.

Given two same-size PNGs (A = slider at one level, B at another), write:
  filter.png  B, but unchanged pixels crushed to a dim grey — the visual filter
  heat.png    |A−B| magnitude (black → yellow)
  sheet.png   A | filter | B contact
  view.json   MAD / p99 / changedPct / threshold

The HUD clock and CHASE chip are excluded via --hud-crop (top fraction).
Pixel mean-abs-diff is corroboration only; this tool exists so you can SEE
the pools / fog / grade the knob moved.

--ramp PNG [PNG ...] writes a labeled contact of N levels (ramp.png).
--stats-only prints MAD/p99 JSON and writes no files (step-to-step deltas).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="slider-effect-view")
    p.add_argument("a", nargs="?", type=Path, help="PNG at the first slider level")
    p.add_argument("b", nargs="?", type=Path, help="PNG at the second slider level")
    p.add_argument("--out", type=Path, help="output directory")
    p.add_argument("--hud-crop", type=float, default=0.10,
                    help="top fraction excluded from the mask (default 0.10)")
    p.add_argument("--label-a", default="A")
    p.add_argument("--label-b", default="B")
    p.add_argument("--min-delta", type=float, default=10.0,
                    help="floor on per-pixel max(|dR|,|dG|,|dB|) to count as changed")
    p.add_argument("--ramp", nargs="+", type=Path,
                    help="N frames → labeled contact sheet (ramp.png)")
    p.add_argument("--labels", default="",
                    help="comma-separated ramp labels (same count as --ramp frames)")
    p.add_argument("--stats-only", action="store_true",
                    help="print pair stats JSON; write no images")
    return p.parse_args(argv)


def load_rgb(path: Path) -> np.ndarray:
    return np.array(Image.open(path).convert("RGB"), dtype=np.int16)


def visual_filter(a: np.ndarray, b: np.ndarray, hud_crop: float, min_delta: float):
    if a.shape != b.shape:
        raise SystemExit(f"size mismatch: A {a.shape} vs B {b.shape}")
    h, w, _ = a.shape
    hud = max(0, min(h - 1, int(h * hud_crop)))
    delta = np.max(np.abs(a.astype(np.int16) - b.astype(np.int16)), axis=2)
    scene = delta[hud:]
    p99 = float(np.percentile(scene, 99)) if scene.size else 0.0
    mad = float(np.abs(a[hud:].astype(np.int16) - b[hud:].astype(np.int16)).mean())
    thresh = max(float(min_delta), p99 * 0.25)
    mask = delta >= thresh
    mask[:hud] = False
    changed = int(mask.sum())
    usable = int(mask.size - hud * w)
    changed_pct = 100.0 * changed / max(usable, 1)

    grey = (0.22 * b[:, :, 0] + 0.43 * b[:, :, 1] + 0.07 * b[:, :, 2]).astype(np.float32)
    dim = np.clip(grey * 0.18, 0, 255).astype(np.uint8)
    filt = np.stack([dim, dim, dim], axis=2)
    filt[mask] = b.astype(np.uint8)[mask]

    heat = np.zeros((h, w, 3), dtype=np.uint8)
    mag = np.clip(delta.astype(np.float32) / max(float(delta.max()), 1.0), 0, 1)
    heat[:, :, 0] = (mag * 255).astype(np.uint8)
    heat[:, :, 1] = (mag * mag * 220).astype(np.uint8)
    heat[:hud] = 0

    stats = {
        "width": w, "height": h, "hudRows": hud,
        "threshold": thresh, "mad": mad, "p99": p99,
        "max": int(delta.max()), "changedPct": changed_pct, "changedPx": changed,
    }
    return filt, heat, stats


def _label(im: Image.Image, text: str) -> Image.Image:
    out = im.copy()
    draw = ImageDraw.Draw(out)
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None
    draw.rectangle((0, 0, min(out.size[0], 8 * len(text) + 16), 18), fill=(0, 0, 0))
    draw.text((6, 3), text, fill=(255, 255, 255), font=font)
    return out


def sheet(a_path: Path, filt: Image.Image, b_path: Path, label_a: str, label_b: str) -> Image.Image:
    a = _label(Image.open(a_path).convert("RGB"), label_a)
    b = _label(Image.open(b_path).convert("RGB"), label_b)
    f = _label(filt, "filter (what changed)")
    h = max(a.height, f.height, b.height)
    gap = 8
    w = a.width + f.width + b.width + gap * 2
    out = Image.new("RGB", (w, h), (8, 8, 8))
    x = 0
    for im in (a, f, b):
        out.paste(im, (x, 0))
        x += im.width + gap
    return out


def write_ramp(paths: list[Path], labels: list[str], dest: Path, max_h: int = 400) -> dict:
    imgs = []
    for path, lab in zip(paths, labels):
        im = Image.open(path).convert("RGB")
        if im.height > max_h:
            w = max(1, int(im.width * max_h / im.height))
            im = im.resize((w, max_h), Image.BILINEAR)
        imgs.append(_label(im, lab))
    h = max(im.height for im in imgs)
    gap = 8
    w = sum(im.width for im in imgs) + gap * (len(imgs) - 1)
    out = Image.new("RGB", (w, h), (8, 8, 8))
    x = 0
    for im in imgs:
        out.paste(im, (x, 0))
        x += im.width + gap
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest)
    return {"frames": len(paths), "ramp": str(dest), "width": w, "height": h}


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.ramp:
        if len(args.ramp) < 2:
            print("--ramp needs at least two PNGs", file=sys.stderr)
            return 2
        if not args.out:
            print("--ramp needs --out DIR", file=sys.stderr)
            return 2
        labels = [s.strip() for s in args.labels.split(",") if s.strip()] if args.labels else []
        if len(labels) != len(args.ramp):
            labels = [p.stem for p in args.ramp]
        args.out.mkdir(parents=True, exist_ok=True)
        dest = args.out / "ramp.png"
        stats = write_ramp(args.ramp, labels, dest)
        print(json.dumps(stats))
        print(f"ramp:   {dest}")
        return 0

    if not args.a or not args.b:
        print("need A and B PNGs (or --ramp)", file=sys.stderr)
        return 2
    a = load_rgb(args.a)
    b = load_rgb(args.b)
    filt, heat, stats = visual_filter(a, b, args.hud_crop, args.min_delta)
    print(json.dumps(stats))
    if args.stats_only:
        return 0
    if not args.out:
        print("--out DIR is required unless --stats-only", file=sys.stderr)
        return 2
    args.out.mkdir(parents=True, exist_ok=True)
    filt_im = Image.fromarray(filt, "RGB")
    heat_im = Image.fromarray(heat, "RGB")
    filt_im.save(args.out / "filter.png")
    heat_im.save(args.out / "heat.png")
    sheet(args.a, filt_im, args.b, args.label_a, args.label_b).save(args.out / "sheet.png")
    (args.out / "view.json").write_text(json.dumps(stats, indent=2) + "\n")
    print(f"filter: {args.out / 'filter.png'}")
    print(f"heat:   {args.out / 'heat.png'}")
    print(f"sheet:  {args.out / 'sheet.png'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
