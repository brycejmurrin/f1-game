#!/usr/bin/env python3
# @doc Build zero-spend Blender room drafts, mesh-derived plans and approval-gated glTF exports.
# @skill asset-pack
"""Run with Blender --background --factory-startup --python THIS -- ... .

Coordinates in manifests use the game's +Y up, metres. Blender maps [x,y,z] to
[x,-z,y]; its standard glTF exporter converts Blender Z-up back to glTF Y-up.
This project adapter does not fabricate Meshy records or approve room gates.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from xml.sax.saxutils import escape


def approved(brief, gate):
    review = brief.get("reviews", {}).get(gate, {})
    return review.get("status") == "approved" and bool(review.get("approvedBy")) and bool(review.get("approvedAt"))


def validate(brief, stage):
    if brief.get("schema") != "apex.procedural-room.v1":
        raise ValueError("Expected apex.procedural-room.v1")
    if brief.get("paidCredits") != 0 or brief.get("provider") != "procedural-local":
        raise ValueError("This adapter only accepts zero-spend local geometry")
    bounds = brief.get("boundsMeters", [])
    if len(bounds) != 3 or any(not isinstance(n, (int, float)) or not math.isfinite(n) or n <= 0 for n in bounds):
        raise ValueError("Positive finite room dimensions required")
    if stage in ("compose", "export") and not approved(brief, "function"):
        raise ValueError("Function approval required before final composition")
    if stage == "export" and not approved(brief, "form"):
        raise ValueError("Form approval required before export")
    seen = set()
    for prop in brief.get("props", []):
        if not prop.get("id") or prop["id"] in seen:
            raise ValueError("Unique prop IDs required")
        seen.add(prop["id"])
        for field in ("dimensionsMeters", "position"):
            v = prop.get(field, [])
            if len(v) != 3 or any(not isinstance(n, (int, float)) or not math.isfinite(n) or field == "dimensionsMeters" and n <= 0 for n in v):
                raise ValueError("Invalid prop geometry: " + prop["id"])
        if not prop.get("function") or not prop.get("source"):
            raise ValueError("Prop function and provenance required")
    for opening in brief.get("openings", []):
        if opening.get("wall") != "south" or opening.get("kind") != "door":
            raise ValueError("Initial adapter supports south-wall door openings only; other opening types must be implemented explicitly")
        for field in ("widthMeters", "heightMeters", "depthMeters"):
            value = opening.get(field)
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
                raise ValueError("Opening requires finite " + field)
        if opening.get("widthMeters", 0) < 2.4 or opening.get("heightMeters", 0) <= 0:
            raise ValueError("Arrival requires width >=2.4m and positive height")
        center = opening.get("centerX", 0)
        if not isinstance(center, (int, float)) or not math.isfinite(center) or abs(center) + opening["widthMeters"]/2 >= bounds[0]/2:
            raise ValueError("Opening must lie strictly within the south wall")
        if opening["widthMeters"] >= bounds[0] or opening["heightMeters"] >= bounds[1]:
            raise ValueError("Opening must fit within wall")
        if not opening.get("destination") or opening.get("depthMeters", 0) <= 0:
            raise ValueError("Opening requires destination and passage depth")
    return brief


def build(brief, out, stage):
    import bpy
    from mathutils import Vector
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    width, height, depth = brief["boundsMeters"]
    objects = []

    def box(name, dimensions, position, layer="lower-room"):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(position[0], -position[2], position[1]))
        obj = bpy.context.object
        obj.name = name
        obj.dimensions = (dimensions[0], dimensions[2], dimensions[1])
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj["reviewLayer"] = layer
        objects.append(obj)
        return obj

    box("floor", [width, .2, depth], [0, -.1, 0])
    box("ceiling", [width, .2, depth], [0, height + .1, 0], "reflected-ceiling")
    for side, x in (("west", -width/2), ("east", width/2)):
        box(side, [.2, height, depth], [x, height/2, 0])
    box("north", [width, height, .2], [0, height/2, -depth/2])
    wall = box("south", [width, height, .2], [0, height/2, depth/2])
    for index, opening in enumerate(brief.get("openings", [])):
        cutter = box("opening-cutter", [opening["widthMeters"], opening["heightMeters"], .6], [opening.get("centerX", 0), opening["heightMeters"]/2-.002, depth/2])
        modifier = wall.modifiers.new("arrival-" + str(index), "BOOLEAN")
        modifier.operation = "DIFFERENCE"
        modifier.solver = "EXACT"
        modifier.object = cutter
        bpy.context.view_layer.objects.active = wall
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        objects.remove(cutter)
        bpy.data.objects.remove(cutter, do_unlink=True)
        box("arrival-apron-" + str(index), [opening["widthMeters"], .2, opening["depthMeters"]], [opening.get("centerX", 0), -.1, depth/2 + opening["depthMeters"]/2])
    for prop in brief.get("props", []):
        obj = box(prop["id"], prop["dimensionsMeters"], prop["position"], prop.get("layer", "lower-room"))
        obj["provenance"] = prop["source"]
        obj["function"] = prop["function"]
    camera_spec = brief.get("productionCamera", {"position": [8, 6, 8], "target": [0, 1, 0]})
    camera_data = bpy.data.cameras.new("Production")
    camera = bpy.data.objects.new("Production", camera_data)
    scene.collection.objects.link(camera)
    p, t = camera_spec["position"], camera_spec["target"]
    camera.location = (p[0], -p[2], p[1])
    camera.rotation_euler = (Vector((t[0], -t[2], t[1])) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    camera_data.lens = 35
    scene.render.resolution_x, scene.render.resolution_y = 844, 390
    scene.render.resolution_percentage = 100

    # Plans project each actual evaluated face, including the Boolean wall aperture.
    depsgraph = bpy.context.evaluated_depsgraph_get()
    inventory = []
    for layer in ("lower-room", "reflected-ceiling"):
        polygons = []
        for obj in objects:
            if obj.get("reviewLayer") != layer or obj.name == "floor":
                continue
            evaluated = obj.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
            vertices = [evaluated.matrix_world @ v.co for v in mesh.vertices]
            inventory.append({"id": obj.name, "layer": layer, "vertices": len(vertices), "faces": len(mesh.polygons)})
            for face in mesh.polygons:
                points = " ".join(f"{v.x:.5f},{-v.y:.5f}" for v in (vertices[i] for i in face.vertices))
                polygons.append(f'<polygon points="{points}" fill="none" stroke="black" stroke-width="0.025"/>')
            evaluated.to_mesh_clear()
        view = f"{-width/2-1} {-depth/2-1} {width+2} {depth+6}"
        (out / (layer + ".svg")).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}"><title>{escape(layer)} mesh projection</title><rect x="{-width/2-1}" y="{-depth/2-1}" width="{width+2}" height="{depth+6}" fill="white"/>' + "".join(polygons) + "</svg>")
    blend = out / ("draft.blend" if stage == "plan" else "room.blend")
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    if stage == "export":
        bpy.ops.export_scene.gltf(filepath=str(out / "room.glb"), export_format="GLB", export_yup=True)
    report = {"stage": stage, "provider": "procedural-local", "paidCredits": 0, "geometry": inventory,
              "sourceSha256": hashlib.sha256(json.dumps(brief, sort_keys=True).encode()).hexdigest(),
              "approvals": brief.get("reviews", {}), "limitations": ["Draft primitive props are not final game assets", "No automatic Form or Runtime approval", "Support, clearances, lighting and runtime fit require review"]}
    (out / "provenance.json").write_text(json.dumps(report, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=("plan", "compose", "export", "validate"))
    parser.add_argument("brief", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else sys.argv[1:])
    brief = validate(json.loads(args.brief.read_text()), args.stage)
    if args.stage == "validate":
        print(json.dumps({"ok": True, "scope": "contract only", "approved": {g: approved(brief, g) for g in ("function", "form", "runtime")}}))
        return
    out = args.out.resolve()
    if out.exists() and any(out.iterdir()):
        raise ValueError("Output directory must be empty; preserve previous evidence")
    out.mkdir(parents=True, exist_ok=True)
    build(brief, out, args.stage)
    print(json.dumps({"ok": True, "stage": args.stage, "output": str(out)}))


if __name__ == "__main__":
    main()
