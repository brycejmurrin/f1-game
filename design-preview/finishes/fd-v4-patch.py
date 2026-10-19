# DESIGN PREVIEW v4 (apply AFTER fd-v3-patch.py): three finishes read off real 2024-26 F1 car photos.
# 68 carbonfade -> 20 (Williams FW47 / RB22 / AMR25: livery above, bare weave below the sidepod line)
# 69 silverfade -> 20 (Mercedes W17: silver nose dissolving through a halftone into black)
# 70 metalflop  -> 34 (AMR24/25 green, FW48 blue: bright face, dark flop at the edges)
def rep(p, pairs):
    s = open(p).read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, a[:70])
        s = s.replace(a, b)
    open(p, 'w').write(s)

rep('js/car/car-materials.js', [(
    "alubare: 65, rawcarbon: 66, flovis: 67,\n",
    "alubare: 65, rawcarbon: 66, flovis: 67,\n    carbonfade: 68, silverfade: 69, metalflop: 70,\n")])

rep('js/render/glx/shaders/glsl-lit.js', [
    ("previewId == 67 ? 20 : previewId;",
     "previewId == 67 ? 20\n    : previewId == 68 ? 20 : previewId == 69 ? 20 : previewId == 70 ? 34 : previewId;"),
    ("  if (previewId >= 60 && previewId <= 67) {\n    vec3 pvHue",
     "  if (previewId >= 60 && previewId <= 70) {\n    vec3 pvHue"),
    ("    } else {   // holo: a faint prism only",
     """    } else if (previewId == 68) {   // carbonfade: bare weave below the sidepod line, a ragged edge between
      vec2 cfW = vObjPos.xz * 190.0 + vObjPos.y * 190.0;
      float cfWv = 0.5 + 0.5 * sin(cfW.x) * sin(cfW.y) * clamp(1.0 - (vDist - 10.0) / 10.0, 0.0, 1.0);
      vec3 cfC = floor(vObjPos * 90.0);
      float cfM = smoothstep(0.30, 0.40, vObjPos.y + (hash21(cfC.xy + cfC.z * 7.1) - 0.5) * 0.10);
      float cfL = max(dot(albedo, vec3(0.299, 0.587, 0.114)), 0.05);
      color = mix(color * (0.06 / cfL) * (0.84 + 0.32 * cfWv) * vec3(0.95, 0.97, 1.05), color, cfM);
    } else if (previewId == 69) {   // silverfade: silver nose -> halftone dots -> black tail
      float sfT = clamp(0.5 - vObjPos.z * 0.28, 0.0, 1.0);
      vec2 sfCell = fract(vec2(vObjPos.z, vObjPos.y) * 26.0) - 0.5;
      float sfS = max(step(length(sfCell), 0.62 * (1.0 - smoothstep(0.25, 0.75, sfT))), 1.0 - smoothstep(0.15, 0.30, sfT));
      float sfL = max(dot(albedo, vec3(0.299, 0.587, 0.114)), 0.05);
      color = mix(color * 0.10, vec3(pvL / sfL) * vec3(0.70, 0.72, 0.76), sfS);
    } else if (previewId == 70) {   // metalflop: metallic face/flop lightness split
      color *= mix(1.30, 0.40, smoothstep(0.10, 0.75, pvG));
    } else {   // holo: a faint prism only"""),
])

rep('js/render/three/tsl-lit.js', [
    ("          .ElseIf(previewId.equal(67.0), () => { surfaceId.assign(20.0); });",
     """          .ElseIf(previewId.equal(67.0), () => { surfaceId.assign(20.0); })
          .ElseIf(previewId.equal(68.0), () => { surfaceId.assign(20.0); })
          .ElseIf(previewId.equal(69.0), () => { surfaceId.assign(20.0); })
          .ElseIf(previewId.equal(70.0), () => { surfaceId.assign(34.0); });"""),
    ("        If(previewId.greaterThanEqual(60.0).and(previewId.lessThanEqual(67.0)), () => {",
     "        If(previewId.greaterThanEqual(60.0).and(previewId.lessThanEqual(70.0)), () => {"),
    ("""          }).Else(() => {
            const pr = cos(""",
     """          }).ElseIf(previewId.equal(68.0), () => {
            const cfW = objP.xz.mul(190.0).add(objP.y.mul(190.0));
            const cfWv = sin(cfW.x).mul(sin(cfW.y)).mul(clamp(vd.sub(10.0).div(10.0).oneMinus(), 0.0, 1.0)).mul(0.5).add(0.5);
            const cfC = floor(objP.mul(90.0));
            const cfM = smoothstep(0.30, 0.40, objP.y.add(hash21(cfC.xy.add(cfC.z.mul(7.1))).sub(0.5).mul(0.10)));
            const cfL = max(dot(albedo, vec3(0.299, 0.587, 0.114)), 0.05);
            color.assign(mix(color.mul(float(0.06).div(cfL)).mul(cfWv.mul(0.32).add(0.84)).mul(vec3(0.95, 0.97, 1.05)), color, cfM));
          }).ElseIf(previewId.equal(69.0), () => {
            const sfT = clamp(float(0.5).sub(objP.z.mul(0.28)), 0.0, 1.0);
            const sfCell = fract(vec2(objP.z, objP.y).mul(26.0)).sub(0.5);
            const sfS = max(step(length(sfCell), smoothstep(0.25, 0.75, sfT).oneMinus().mul(0.62)), smoothstep(0.15, 0.30, sfT).oneMinus());
            const sfL = max(dot(albedo, vec3(0.299, 0.587, 0.114)), 0.05);
            color.assign(mix(color.mul(0.10), vec3(pvL.div(sfL)).mul(vec3(0.70, 0.72, 0.76)), sfS));
          }).ElseIf(previewId.equal(70.0), () => {
            color.mulAssign(mix(float(1.30), float(0.40), smoothstep(0.10, 0.75, pvG)));
          }).Else(() => {
            const pr = cos("""),
])

rep('js/render/webgpu/wgsl-chunks.js', [
    ("  else if (previewId == 66) { surfaceId = 31; } else if (previewId == 67) { surfaceId = 20; }\n",
     "  else if (previewId == 66) { surfaceId = 31; } else if (previewId == 67) { surfaceId = 20; }\n"
     "  else if (previewId == 68 || previewId == 69) { surfaceId = 20; } else if (previewId == 70) { surfaceId = 34; }\n"),
    ("  if (previewId >= 60 && previewId <= 67) {\n    let pvHue",
     "  if (previewId >= 60 && previewId <= 70) {\n    let pvHue"),
    ("""    } else {
      color = color * mix(vec3<f32>(1.0), 0.75 + 0.5 * cos(""",
     """    } else if (previewId == 68) {
      let cfW = in.objPos.xz * 190.0 + vec2<f32>(in.objPos.y * 190.0);
      let cfWv = 0.5 + 0.5 * sin(cfW.x) * sin(cfW.y) * clamp(1.0 - (vDist - 10.0) / 10.0, 0.0, 1.0);
      let cfC = floor(in.objPos * 90.0);
      let cfM = smoothstep(0.30, 0.40, in.objPos.y + (hash21(cfC.xy + cfC.z * 7.1) - 0.5) * 0.10);
      let cfL = max(dot(albedo, vec3<f32>(0.299, 0.587, 0.114)), 0.05);
      color = mix(color * (0.06 / cfL) * (0.84 + 0.32 * cfWv) * vec3<f32>(0.95, 0.97, 1.05), color, vec3<f32>(cfM));
    } else if (previewId == 69) {
      let sfT = clamp(0.5 - in.objPos.z * 0.28, 0.0, 1.0);
      let sfCell = fract(vec2<f32>(in.objPos.z, in.objPos.y) * 26.0) - 0.5;
      let sfS = max(step(length(sfCell), 0.62 * (1.0 - smoothstep(0.25, 0.75, sfT))), 1.0 - smoothstep(0.15, 0.30, sfT));
      let sfL = max(dot(albedo, vec3<f32>(0.299, 0.587, 0.114)), 0.05);
      color = mix(color * 0.10, vec3<f32>(pvL / sfL) * vec3<f32>(0.70, 0.72, 0.76), vec3<f32>(sfS));
    } else if (previewId == 70) {
      color = color * mix(1.30, 0.40, smoothstep(0.10, 0.75, pvG));
    } else {
      color = color * mix(vec3<f32>(1.0), 0.75 + 0.5 * cos("""),
])
print("v4 patch applied")
