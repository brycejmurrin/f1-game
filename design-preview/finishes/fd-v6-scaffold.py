# DESIGN PREVIEW v6 scaffold (apply AFTER v3/v4/v5): open preview ids up to 90 and give three parallel design lanes
# their own insertion markers so their patches never touch the same lines.
#   lane A ids 76-80, lane B ids 81-85, lane C ids 86-90.
# Markers (one per lane per backend):  PREVIEW-REMAP-<L>  (surface remap)   PREVIEW-TINT-<L>  (after-lighting tint body)
def rep(p, pairs):
    s = open(p).read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, a[:70])
        s = s.replace(a, b)
    open(p, 'w').write(s)

rep('js/render/glx/shaders/glsl-lit.js', [
    ("previewId == 74 ? 34 : previewId == 75 ? 20 : previewId;\n",
     "previewId == 74 ? 34 : previewId == 75 ? 20 : previewId;\n"
     "  // PREVIEW-REMAP-A\n  // PREVIEW-REMAP-B\n  // PREVIEW-REMAP-C\n"),
    ("  if (previewId >= 60 && previewId <= 75) {\n    vec3 pvHue",
     "  if (previewId >= 60 && previewId <= 90) {\n    vec3 pvHue"),
    ("    } else if (previewId >= 71) {\n      float aL",
     "    } else if (previewId >= 76 && previewId <= 80) {\n      // PREVIEW-TINT-A\n"
     "    } else if (previewId >= 81 && previewId <= 85) {\n      // PREVIEW-TINT-B\n"
     "    } else if (previewId >= 86 && previewId <= 90) {\n      // PREVIEW-TINT-C\n"
     "    } else if (previewId >= 71) {\n      float aL"),
])

rep('js/render/three/tsl-lit.js', [
    ("          .ElseIf(previewId.equal(75.0), () => { surfaceId.assign(20.0); });\n",
     "          .ElseIf(previewId.equal(75.0), () => { surfaceId.assign(20.0); });\n"
     "        // PREVIEW-REMAP-A\n        // PREVIEW-REMAP-B\n        // PREVIEW-REMAP-C\n"),
    ("        If(previewId.greaterThanEqual(60.0).and(previewId.lessThanEqual(75.0)), () => {",
     "        If(previewId.greaterThanEqual(60.0).and(previewId.lessThanEqual(90.0)), () => {"),
    ("          }).ElseIf(previewId.greaterThanEqual(71.0), () => {\n            const aL",
     "          }).ElseIf(previewId.greaterThanEqual(76.0).and(previewId.lessThanEqual(80.0)), () => {\n            // PREVIEW-TINT-A\n"
     "          }).ElseIf(previewId.greaterThanEqual(81.0).and(previewId.lessThanEqual(85.0)), () => {\n            // PREVIEW-TINT-B\n"
     "          }).ElseIf(previewId.greaterThanEqual(86.0).and(previewId.lessThanEqual(90.0)), () => {\n            // PREVIEW-TINT-C\n"
     "          }).ElseIf(previewId.greaterThanEqual(71.0), () => {\n            const aL"),
])

rep('js/render/webgpu/wgsl-chunks.js', [
    ("  else if (previewId == 73 || previewId == 75) { surfaceId = 20; }\n",
     "  else if (previewId == 73 || previewId == 75) { surfaceId = 20; }\n"
     "  // PREVIEW-REMAP-A\n  // PREVIEW-REMAP-B\n  // PREVIEW-REMAP-C\n"),
    ("  if (previewId >= 60 && previewId <= 75) {\n    let pvHue",
     "  if (previewId >= 60 && previewId <= 90) {\n    let pvHue"),
    ("    } else if (previewId >= 71) {\n      let aL",
     "    } else if (previewId >= 76 && previewId <= 80) {\n      // PREVIEW-TINT-A\n"
     "    } else if (previewId >= 81 && previewId <= 85) {\n      // PREVIEW-TINT-B\n"
     "    } else if (previewId >= 86 && previewId <= 90) {\n      // PREVIEW-TINT-C\n"
     "    } else if (previewId >= 71) {\n      let aL"),
])

rep('js/car/car-materials.js', [(
    "    truematte: 71, pearlwhite: 72, raceworn: 73, jpsgold: 74, testcamo: 75,\n",
    "    truematte: 71, pearlwhite: 72, raceworn: 73, jpsgold: 74, testcamo: 75,\n"
    "    // PREVIEW-IDS-A\n    // PREVIEW-IDS-B\n    // PREVIEW-IDS-C\n")])
print("v6 scaffold applied")
