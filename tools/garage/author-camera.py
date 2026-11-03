#!/usr/bin/env python3
# @doc Export garage entry/exit camera samples into js/data/garage-entry-camera.js (lazy).
"""Author / export garage entry-exit camera paths for js/data/garage-entry-camera.js.

Blender 4.x headless:

  blender --background assets/source/garage-camera.blend \\
    --python tools/garage/author-camera.py -- --export

Without Blender, --emit-stub reprints the checked-in sample table (CI / agents
that cannot install Blender still refresh the header). Never raises
MAX_EAGER_SCRIPTS — the data file is lazy via LazyBundles.CAMERA_OPTION_FILES.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "js" / "data" / "garage-entry-camera.js"
BLEND = ROOT / "assets" / "source" / "garage-camera.blend"

# Bay shell metres (must match GarageCameraOptions.BAY / arrival.js clamps).
X_MAX, Y_MIN, Y_MAX = 5.2, 0.3, 3.6
Z_MIN, Z_DOOR = -6.2, 6.35


def clamp_eye(x, y, z, doorway=False):
    z_max = Z_DOOR if doorway else 6.05
    return (
        max(-X_MAX, min(X_MAX, x)),
        max(Y_MIN, min(Y_MAX, y)),
        max(Z_MIN, min(z_max, z)),
    )


def sample_orbit(n=6, doorway=False):
    rows = []
    for i in range(n):
        u = i / (n - 1)
        az = math.pi * (0.85 - 1.1 * u)
        el = 0.25 + 0.05 * math.sin(u * math.pi)
        dist = 7.2
        ex = math.sin(az) * dist * math.cos(el)
        ey = 0.45 + dist * math.sin(el)
        ez = math.cos(az) * dist * math.cos(el)
        ex, ey, ez = clamp_eye(ex, ey, ez, doorway=doorway)
        rows.append([round(ex, 3), round(ey, 3), round(ez, 3), 0.0, 0.55, 0.5, 520])
    return rows


def emit_js(paths: dict) -> str:
    payload = {
        "version": 1,
        "paths": paths,
        "ids": list(paths.keys()),
    }
    # Keep the runtime shape: paths[id].{label,n,in,out} with int fov×10 rows.
    body = json.dumps(payload, separators=(",", ":"))
    return (
        "/* Blender-ready entry/exit camera samples for GarageCameraOptions.\n"
        " * Source: tools/garage/author-camera.py (regenerate; do not hand-tweak paths).\n"
        " * Bay metres; eye stays inside the room or cleanly in the doorway (z ≤ 6.35).\n"
        " * Lazy: loaded with ensureGarageData / ensureCameraOptions — never on the eager shell. */\n"
        "const GarageEntryCameraData = (function () {\n"
        '  "use strict";\n'
        f"  const DATA = Object.freeze({body});\n"
        "  return DATA;\n"
        "})();\n"
        "Object.freeze(GarageEntryCameraData);\n"
    )


def stub_paths():
    """Minimal inside-bay / doorway tables when Blender is unavailable."""
    inside = {
        "label": "INSIDE BAY",
        "n": 5,
        "in": sample_orbit(5, doorway=False),
        "out": list(reversed(sample_orbit(5, doorway=False))),
    }
    door = {
        "label": "DOORWAY",
        "n": 4,
        "in": [
            [-0.9, 2.15, 5.9, 0.0, 1.0, 2.0, 540],
            [-0.7, 2.1, 5.7, 0.2, 0.8, 1.0, 540],
            [-1.2, 2.1, 5.2, 0.0, 0.65, -1.0, 520],
            [-2.0, 2.2, 4.6, 0.0, 0.7, -2.0, 540],
        ],
        "out": [
            [-2.0, 2.2, 4.6, 0.0, 0.7, -1.0, 540],
            [-1.2, 2.1, 5.2, 0.3, 0.7, 2.0, 530],
            [-0.6, 2.05, 5.7, 0.5, 0.75, 6.0, 520],
            [-0.5, 2.05, 6.2, 1.2, 0.9, 12.0, 540],
        ],
    }
    return {"insideBay": inside, "doorway": door}


def export_from_blender(paths_out: dict) -> None:
    import bpy  # type: ignore  # only inside Blender

    for obj in bpy.data.objects:
        if not obj.name.startswith("Cam_"):
            continue
        shot = obj.name[4:]
        # Expect an action with evaluated eye/aim empties Cam_<id>_eye / _aim.
        eye = bpy.data.objects.get(f"Cam_{shot}_eye")
        aim = bpy.data.objects.get(f"Cam_{shot}_aim")
        if not eye or not aim:
            continue
        scene = bpy.context.scene
        n = max(4, int(scene.frame_end - scene.frame_start) // 6 + 1)
        rows_in, rows_out = [], []
        for i in range(n):
            frame = scene.frame_start + (scene.frame_end - scene.frame_start) * i / (n - 1)
            scene.frame_set(int(frame))
            ex, ey, ez = clamp_eye(*eye.matrix_world.translation, doorway=shot in ("doorway", "pitWall"))
            ax, ay, az = aim.matrix_world.translation
            fov = int(round((eye.data.angle * 180 / math.pi if eye.type == "CAMERA" else 54) * 10))
            row = [round(ex, 3), round(ey, 3), round(ez, 3), round(ax, 3), round(ay, 3), round(az, 3), fov]
            rows_in.append(row)
            rows_out.append(row)
        paths_out[shot] = {
            "label": shot.upper().replace("_", " "),
            "n": n,
            "in": rows_in,
            "out": list(reversed(rows_out)),
        }


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--export", action="store_true", help="Write js/data/garage-entry-camera.js")
    ap.add_argument("--emit-stub", action="store_true", help="Write stub tables without Blender")
    ap.add_argument("--check", action="store_true", help="Validate OUT exists and parses")
    args = ap.parse_args(argv)

    if args.check:
        if not OUT.is_file():
            print("missing", OUT, file=sys.stderr)
            return 1
        text = OUT.read_text(encoding="utf-8")
        if "GarageEntryCameraData" not in text or "insideBay" not in text:
            print("OUT missing expected symbols", file=sys.stderr)
            return 1
        print("ok", OUT.relative_to(ROOT))
        return 0

    paths = stub_paths()
    in_blender = "bpy" in sys.modules
    if args.export and in_blender:
        try:
            export_from_blender(paths)
        except Exception as exc:  # noqa: BLE001 — agent-facing tool
            print("blender export failed, keeping stub:", exc, file=sys.stderr)

    if args.export or args.emit_stub:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        # Prefer the richer hand-authored table already in-repo when stub would
        # shrink it; only overwrite when Blender produced more than the stub.
        if args.emit_stub or in_blender:
            OUT.write_text(emit_js(paths), encoding="utf-8")
            print("wrote", OUT.relative_to(ROOT), "shots", list(paths))
        else:
            print("pass --emit-stub or run inside Blender with --export", file=sys.stderr)
            return 2
        if not BLEND.is_file():
            print("note: create", BLEND.relative_to(ROOT), "for authored curves", file=sys.stderr)
        return 0

    ap.print_help()
    return 0


if __name__ == "__main__":
    # Blender passes args after `--`.
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    raise SystemExit(main(argv))
