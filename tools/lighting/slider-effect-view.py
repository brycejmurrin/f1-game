#!/usr/bin/env python3
# @doc Visual filter for a slider A/B: `filter.png`, `heat.png`, `sheet.png`, MAD/p99/max stats.
# @skill lighting-tuner
"""Isolate what a lighting-slider A/B actually moved.

Given two same-size PNGs (A = slider at one level, B at another), write:
  filter.png  B, but unchanged pixels crushed to a dim grey — the visual filter
  heat.png    |A−B| magnitude (black → yellow)
  diff.png    signed (B−A) diverging map: red = B brighter, blue = B darker
  sheet.png   A | filter | diff | B contact
  view.json   MAD / p99 / changedPct / threshold

The HUD clock and CHASE chip are excluded via --hud-crop (top fraction).
Pixel mean-abs-diff is corroboration only; this tool exists so you can SEE
the pools / fog / grade the knob moved.

--ramp PNG [PNG ...] writes a labeled contact of N levels (ramp.png).
--stats-only prints MAD/p99 JSON and writes no files (step-to-step deltas).
--batch-summary JSON  reads a batch.json index and writes a multi-row
    summary.png — one row per knob: id label | A | diff | B | MAD bar.
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
    p.add_argument("--batch-summary", type=Path, metavar="BATCH_JSON",
                    help="read batch.json → write summary.png beside it")
    p.add_argument("--thumb-height", type=int, default=180,
                    help="row thumbnail height in --batch-summary (default 180)")
    return p.parse_args(argv)


def load_rgb(path: Path) -> np.ndarray:
    return np.array(Image.open(path).convert("RGB"), dtype=np.int16)


def visual_filter(a: np.ndarray, b: np.ndarray, hud_crop: float, min_delta: float):
    if a.shape != b.shape:
        raise SystemExit(f"size mismatch: A {a.shape} vs B {b.shape}")
    h, w, _ = a.shape
    hud = max(0, min(h - 1, int(h * hud_crop)))
    diff_raw = b.astype(np.int16) - a.astype(np.int16)          # signed, full colour
    delta = np.max(np.abs(diff_raw), axis=2)                     # unsigned magnitude
    scene = delta[hud:]
    p99 = float(np.percentile(scene, 99)) if scene.size else 0.0
    mad = float(np.abs(diff_raw[hud:]).mean())
    thresh = max(float(min_delta), p99 * 0.25)
    mask = delta >= thresh
    mask[:hud] = False
    changed = int(mask.sum())
    usable = int(mask.size - hud * w)
    changed_pct = 100.0 * changed / max(usable, 1)

    # filter: B colour where changed, dim grey elsewhere
    grey = (0.22 * b[:, :, 0] + 0.43 * b[:, :, 1] + 0.07 * b[:, :, 2]).astype(np.float32)
    dim = np.clip(grey * 0.18, 0, 255).astype(np.uint8)
    filt = np.stack([dim, dim, dim], axis=2)
    filt[mask] = b.astype(np.uint8)[mask]

    # heat: unsigned magnitude — black → yellow
    heat = np.zeros((h, w, 3), dtype=np.uint8)
    mag = np.clip(delta.astype(np.float32) / max(float(delta.max()), 1.0), 0, 1)
    heat[:, :, 0] = (mag * 255).astype(np.uint8)
    heat[:, :, 1] = (mag * mag * 220).astype(np.uint8)
    heat[:hud] = 0

    # signed diff: red = B brighter, blue = B darker, white = no change
    # Diverging: neutral grey → scale by the channel with max abs change per pixel
    signed = np.zeros((h, w, 3), dtype=np.uint8)
    signed[:] = 20  # near-black background for HUD rows
    if delta.max() > 0:
        scale = 255.0 / max(float(delta.max()), 1.0)
        # Luminance-weighted signed value for direction
        lum_diff = (0.299 * diff_raw[:, :, 0] + 0.587 * diff_raw[:, :, 1] + 0.114 * diff_raw[:, :, 2])
        pos = np.clip(lum_diff * scale, 0, 255).astype(np.uint8)   # B brighter → red channel
        neg = np.clip(-lum_diff * scale, 0, 255).astype(np.uint8)  # B darker  → blue channel
        signed[:, :, 0] = pos   # red
        signed[:, :, 1] = 0
        signed[:, :, 2] = neg   # blue
        # where barely changed, blend toward neutral dark grey
        neutral_mask = delta < max(thresh * 0.5, 2)
        signed[neutral_mask] = 20
    signed[:hud] = 20

    stats = {
        "width": w, "height": h, "hudRows": hud,
        "threshold": thresh, "mad": mad, "p99": p99,
        "max": int(delta.max()), "changedPct": changed_pct, "changedPx": changed,
    }
    return filt, heat, signed, stats


def _label(im: Image.Image, text: str, bg: tuple = (0, 0, 0),
           fg: tuple = (255, 255, 255)) -> Image.Image:
    out = im.copy()
    draw = ImageDraw.Draw(out)
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None
    box_w = min(out.size[0], 8 * len(text) + 16)
    draw.rectangle((0, 0, box_w, 18), fill=bg)
    draw.text((6, 3), text, fill=fg, font=font)
    return out


def sheet(a_path: Path, filt: Image.Image, diff_im: Image.Image,
          b_path: Path, label_a: str, label_b: str) -> Image.Image:
    a = _label(Image.open(a_path).convert("RGB"), label_a)
    b = _label(Image.open(b_path).convert("RGB"), label_b)
    f = _label(filt, "filter (changed pixels)")
    d = _label(diff_im, "diff (red=B↑  blue=B↓)")
    h = max(a.height, f.height, d.height, b.height)
    gap = 8
    w = a.width + f.width + d.width + b.width + gap * 3
    out = Image.new("RGB", (w, h), (8, 8, 8))
    x = 0
    for im in (a, f, d, b):
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


def _thumb(path: Path, h: int) -> Image.Image | None:
    """Load a PNG and scale to fixed height; return None if missing."""
    try:
        im = Image.open(path).convert("RGB")
        w = max(1, int(im.width * h / im.height))
        return im.resize((w, h), Image.BILINEAR)
    except Exception:
        return None


def _mad_bar(mad: float, mad_max: float, w: int, h: int) -> Image.Image:
    """Horizontal MAD bar: green→yellow→red scale."""
    bar = Image.new("RGB", (w, h), (30, 30, 30))
    draw = ImageDraw.Draw(bar)
    frac = min(1.0, mad / max(mad_max, 1.0))
    fill_w = max(1, int(frac * (w - 4)))
    # colour: green at low, yellow at mid, red at high
    r = int(min(255, frac * 2 * 255))
    g = int(min(255, (1 - frac) * 2 * 255))
    draw.rectangle((2, 2, 2 + fill_w, h - 2), fill=(r, g, 30))
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None
    label = f"MAD {mad:.1f}"
    draw.text((4, 2), label, fill=(255, 255, 255), font=font)
    return bar


def write_batch_summary(batch_path: Path, thumb_h: int = 180) -> Path:
    """Read a batch.json, build summary.png — one row per knob.

    Each row: id label | A thumb | diff thumb | B thumb | MAD bar
    """
    data = json.loads(batch_path.read_text())
    results = data.get("results", [])
    if not results:
        raise SystemExit("batch.json has no results")

    base = batch_path.parent
    ROW_H = thumb_h
    LABEL_W = 220
    BAR_W = 160
    GAP = 6

    # Measure thumb width from first available a.png
    thumb_w = 320
    for r in results:
        ap = Path(r.get("files", {}).get("a", ""))
        if ap.exists():
            im = Image.open(ap)
            thumb_w = max(1, int(im.width * ROW_H / im.height))
            break

    row_w = LABEL_W + (thumb_w + GAP) * 3 + BAR_W + GAP
    mad_values = [r.get("pixels", {}).get("mad", 0) for r in results]
    mad_max = max(mad_values) if mad_values else 1.0

    rows_imgs = []
    for r in results:
        row = Image.new("RGB", (row_w, ROW_H), (18, 18, 18))
        draw = ImageDraw.Draw(row)
        try:
            font = ImageFont.load_default()
        except Exception:
            font = None

        # label column
        draw.rectangle((0, 0, LABEL_W - 1, ROW_H - 1), fill=(28, 28, 28))
        knob_id = r.get("id", "?")
        tod = r.get("tod", "")
        wx = r.get("weather", "")
        from_v = r.get("from", "")
        to_v = r.get("to", "")
        draw.text((6, 6), knob_id, fill=(220, 220, 220), font=font)
        draw.text((6, 20), f"{tod} · {wx}", fill=(140, 140, 140), font=font)
        draw.text((6, 34), f"{from_v} → {to_v}", fill=(100, 180, 100), font=font)

        files = r.get("files", {})
        x = LABEL_W + GAP

        # A, diff, B thumbnails
        for key, label in [("a", "A"), ("diff", "diff"), ("b", "B")]:
            path = Path(files.get(key, ""))
            t = _thumb(path, ROW_H)
            if t is None:
                # placeholder
                t = Image.new("RGB", (thumb_w, ROW_H), (40, 40, 40))
                ImageDraw.Draw(t).text((4, 4), f"no {key}.png", fill=(120, 120, 120))
            t = t.resize((thumb_w, ROW_H), Image.BILINEAR)
            t = _label(t, label, bg=(0, 0, 0, 180) if False else (0, 0, 0))
            row.paste(t, (x, 0))
            x += thumb_w + GAP

        # MAD bar
        mad = r.get("pixels", {}).get("mad", 0)
        bar = _mad_bar(mad, mad_max, BAR_W, ROW_H)
        row.paste(bar, (x, 0))

        rows_imgs.append(row)

    total_h = ROW_H * len(rows_imgs) + GAP * (len(rows_imgs) - 1)
    summary = Image.new("RGB", (row_w, total_h), (8, 8, 8))
    y = 0
    for row in rows_imgs:
        summary.paste(row, (0, y))
        y += ROW_H + GAP

    dest = base / "summary.png"
    summary.save(dest)
    print(f"summary: {dest}  ({len(rows_imgs)} rows)")
    return dest


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if args.batch_summary:
        write_batch_summary(args.batch_summary, thumb_h=args.thumb_height)
        return 0

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
        print("need A and B PNGs (or --ramp or --batch-summary)", file=sys.stderr)
        return 2
    a = load_rgb(args.a)
    b = load_rgb(args.b)
    filt, heat, signed, stats = visual_filter(a, b, args.hud_crop, args.min_delta)
    print(json.dumps(stats))
    if args.stats_only:
        return 0
    if not args.out:
        print("--out DIR is required unless --stats-only", file=sys.stderr)
        return 2
    args.out.mkdir(parents=True, exist_ok=True)
    filt_im = Image.fromarray(filt, "RGB")
    heat_im = Image.fromarray(heat, "RGB")
    diff_im = Image.fromarray(signed, "RGB")
    filt_im.save(args.out / "filter.png")
    heat_im.save(args.out / "heat.png")
    diff_im.save(args.out / "diff.png")
    sheet(args.a, filt_im, diff_im, args.b, args.label_a, args.label_b).save(args.out / "sheet.png")
    (args.out / "view.json").write_text(json.dumps(stats, indent=2) + "\n")
    print(f"filter: {args.out / 'filter.png'}")
    print(f"heat:   {args.out / 'heat.png'}")
    print(f"diff:   {args.out / 'diff.png'}")
    print(f"sheet:  {args.out / 'sheet.png'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
