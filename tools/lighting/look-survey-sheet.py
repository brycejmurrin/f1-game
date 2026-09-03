#!/usr/bin/env python3
# @doc 4×5 tod×weather contact sheet from `artifacts/lighting/shots/<id>/` → `docs/look-survey/<id>_grid.png`; `--ready`.
# @skill mcp-probe
"""Build a 4×5 tod×weather contact sheet from look-survey PNGs.

    python3 tools/lighting/look-survey-sheet.py bahrain
    python3 tools/lighting/look-survey-sheet.py --all
    python3 tools/lighting/look-survey-sheet.py --ready   # tracks with all 20 looks

Writes docs/look-survey/<id>_grid.png (tracked). Source frames live in
gitignored artifacts/lighting/shots/<id>/.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SHOTS = ROOT / "artifacts" / "lighting" / "shots"
OUT = ROOT / "docs" / "look-survey"
TODS = ("dawn", "day", "dusk", "night")
WXS = ("dry", "wet", "rain", "fog", "overcast")


def ready_combos(track: str) -> list[Path]:
    d = SHOTS / track
    return [d / f"{tod}-{wx}.png" for tod in TODS for wx in WXS]


def is_complete(track: str) -> bool:
    return all(p.is_file() for p in ready_combos(track))


def contact_sheet(track: str, dest: Path) -> Path:
    from PIL import Image, ImageDraw, ImageFont

    paths = ready_combos(track)
    sample = next((p for p in paths if p.is_file()), None)
    if sample is None:
        raise FileNotFoundError(f"no look-survey PNGs for {track}")
    with Image.open(sample) as im0:
        cw, ch = im0.size
    tw, th = max(1, cw // 2), max(1, ch // 2)
    label_h = 22
    sheet = Image.new("RGB", (5 * tw, 4 * (th + label_h)), (18, 18, 20))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None
    for r, tod in enumerate(TODS):
        for c, wx in enumerate(WXS):
            p = SHOTS / track / f"{tod}-{wx}.png"
            x, y = c * tw, r * (th + label_h)
            draw.rectangle((x, y, x + tw, y + label_h), fill=(28, 28, 32))
            draw.text((x + 6, y + 4), f"{track}  {tod}|{wx}", fill=(230, 230, 230), font=font)
            if not p.is_file():
                continue
            with Image.open(p) as im:
                tile = im.convert("RGB").resize((tw, th))
            sheet.paste(tile, (x, y + label_h))
    dest.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(dest, "PNG", optimize=True)
    return dest


def main() -> None:
    p = argparse.ArgumentParser(prog="look-survey-sheet")
    p.add_argument("tracks", nargs="*", help="circuit ids (default: --ready)")
    p.add_argument("--all", action="store_true", help="every shots/<id> directory")
    p.add_argument("--ready", action="store_true", help="only tracks with all 20 PNGs")
    p.add_argument("--out", default=str(OUT), help="output directory")
    args = p.parse_args()
    out = Path(args.out)
    if args.all:
        ids = sorted(d.name for d in SHOTS.iterdir() if d.is_dir()) if SHOTS.is_dir() else []
    elif args.tracks:
        ids = args.tracks
    else:
        ids = sorted(d.name for d in SHOTS.iterdir() if d.is_dir() and is_complete(d.name)) if SHOTS.is_dir() else []
    if not ids:
        print("no tracks", file=sys.stderr)
        sys.exit(2)
    wrote = []
    for track in ids:
        dest = out / f"{track}_grid.png"
        contact_sheet(track, dest)
        wrote.append(dest)
        print(f"wrote {dest} ({dest.stat().st_size} bytes)")
    print(f"= run passed ({len(wrote)} sheets)")


if __name__ == "__main__":
    main()
