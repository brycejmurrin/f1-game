# DESIGN PREVIEW v5 (apply AFTER fd-v3-patch.py and fd-v4-patch.py).
# Improvements: fluoro keeps its shading (less flat glow), frozen gets the broad satin sun sheen (Bugatti refs).
# New, ids 71-75: truematte -> 28, pearlwhite -> 34, raceworn -> 20, jpsgold -> 34, testcamo -> 20.
def rep(p, pairs):
    s = open(p).read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, a[:70])
        s = s.replace(a, b)
    open(p, 'w').write(s)

rep('js/car/car-materials.js', [(
    "    carbonfade: 68, silverfade: 69, metalflop: 70,\n",
    "    carbonfade: 68, silverfade: 69, metalflop: 70,\n    truematte: 71, pearlwhite: 72, raceworn: 73, jpsgold: 74, testcamo: 75,\n")])

rep('js/render/glx/shaders/glsl-lit.js', [
    ("previewId == 69 ? 20 : previewId == 70 ? 34 : previewId;",
     "previewId == 69 ? 20 : previewId == 70 ? 34\n    : previewId == 71 ? 28 : previewId == 72 ? 34 : previewId == 73 ? 20 : previewId == 74 ? 34 : previewId == 75 ? 20 : previewId;"),
    ("  if (previewId >= 60 && previewId <= 70) {\n    vec3 pvHue",
     "  if (previewId >= 60 && previewId <= 75) {\n    vec3 pvHue"),
    ("      color += (uAmbSky + uSunColor * 0.20) * pvG * pvG * 0.06;",
     "      color += (uAmbSky + uSunColor * 0.20) * pvG * pvG * 0.06;\n"
     "      color += uSunColor * pvHue * 0.22 * pow(max(dot(N, normalize(uSunDir + V)), 0.0), 6.0);   // broad satin sheen"),
    ("uAmbSky * 3.0 + uSunColor * 0.80 * max(dot(N, uSunDir), 0.0) + vec3(0.18));",
     "uAmbSky * 2.0 + uSunColor * 0.90 * max(dot(N, uSunDir), 0.0) + vec3(0.10));"),
    ("    } else {   // holo: a faint prism only",
     """    } else if (previewId >= 71) {
      float aL = max(dot(albedo, vec3(0.299, 0.587, 0.114)), 0.05);
      float lit = pvL / aL;   // the lighting with the livery divided out
      if (previewId == 71) {   // truematte: chalky, lighter and greyer toward the edges (rough-surface back-scatter)
        color = mix(color, vec3(pvL) * 1.25, 0.35 * pvG * pvG) * 1.04;
      } else if (previewId == 72) {   // pearlwhite: tri-coat white, warm face, cool edge; livery ignored
        color = vec3(lit) * 0.92 * mix(vec3(1.0, 0.97, 0.92), vec3(0.86, 0.92, 1.0), smoothstep(0.2, 0.8, pvG));
      } else if (previewId == 73) {   // raceworn: brake dust and rubber streaked back along the low bodywork
        float rw = clamp((0.45 - vObjPos.y) / 0.35, 0.0, 1.0) * (0.55 + 0.45 * hash21(floor(vec2(vObjPos.z * 8.0, vObjPos.y * 60.0))));
        color = mix(color, vec3(0.07, 0.06, 0.05) * lit * 1.2, rw * 0.75);
      } else if (previewId == 74) {   // jpsgold: gloss black with gold flake
        vec3 jgC = floor(vObjPos * 140.0);
        float jg = smoothstep(0.96, 1.0, hash21(jgC.xy + jgC.z * 19.7)) * clamp(1.0 - (vDist - 10.0) / 16.0, 0.0, 1.0);
        color = color * (0.06 / aL) + vec3(0.95, 0.72, 0.28) * (jg * 1.4 + 0.08) * (uSunColor * max(dot(N, uSunDir), 0.0) + uAmbSky);
      } else {   // testcamo: black/white dazzle; livery ignored
        float tc = sin(vObjPos.z * 9.0 + sin(vObjPos.y * 7.0) * 2.5) * sin(vObjPos.y * 11.0 + vObjPos.x * 6.0 + sin(vObjPos.z * 5.0) * 2.0);
        color = vec3(lit) * mix(0.06, 0.85, step(0.0, tc));
      }
    } else {   // holo: a faint prism only"""),
])

rep('js/render/three/tsl-lit.js', [
    ("          .ElseIf(previewId.equal(70.0), () => { surfaceId.assign(34.0); });",
     """          .ElseIf(previewId.equal(70.0), () => { surfaceId.assign(34.0); })
          .ElseIf(previewId.equal(71.0), () => { surfaceId.assign(28.0); })
          .ElseIf(previewId.equal(72.0), () => { surfaceId.assign(34.0); })
          .ElseIf(previewId.equal(73.0), () => { surfaceId.assign(20.0); })
          .ElseIf(previewId.equal(74.0), () => { surfaceId.assign(34.0); })
          .ElseIf(previewId.equal(75.0), () => { surfaceId.assign(20.0); });"""),
    ("        If(previewId.greaterThanEqual(60.0).and(previewId.lessThanEqual(70.0)), () => {",
     "        If(previewId.greaterThanEqual(60.0).and(previewId.lessThanEqual(75.0)), () => {"),
    ("            color.addAssign(vec3(U.ambSky).add(vec3(U.sunColor).mul(0.20)).mul(pvG2.mul(0.06)));",
     "            color.addAssign(vec3(U.ambSky).add(vec3(U.sunColor).mul(0.20)).mul(pvG2.mul(0.06)));\n"
     "            color.addAssign(vec3(U.sunColor).mul(pvHue).mul(pow(max(dot(N, normalize(U.sunDir.add(V))), 0.0), 6.0).mul(0.22)));"),
    ("""mul(vec3(U.ambSky).mul(3.0)
              .add(vec3(U.sunColor).mul(max(dot(N, U.sunDir), 0.0).mul(0.80))).add(0.18)));""",
     """mul(vec3(U.ambSky).mul(2.0)
              .add(vec3(U.sunColor).mul(max(dot(N, U.sunDir), 0.0).mul(0.90))).add(0.10)));"""),
    ("""          }).Else(() => {
            const pr = cos(""",
     """          }).ElseIf(previewId.greaterThanEqual(71.0), () => {
            const aL = max(dot(albedo, vec3(0.299, 0.587, 0.114)), 0.05);
            const lit = pvL.div(aL);
            If(previewId.equal(71.0), () => {
              color.assign(mix(color, vec3(pvL).mul(1.25), pvG2.mul(0.35)).mul(1.04));
            }).ElseIf(previewId.equal(72.0), () => {
              color.assign(vec3(lit).mul(0.92).mul(mix(vec3(1.0, 0.97, 0.92), vec3(0.86, 0.92, 1.0), smoothstep(0.2, 0.8, pvG))));
            }).ElseIf(previewId.equal(73.0), () => {
              const rw = clamp(float(0.45).sub(objP.y).div(0.35), 0.0, 1.0)
                .mul(hash21(floor(vec2(objP.z.mul(8.0), objP.y.mul(60.0)))).mul(0.45).add(0.55));
              color.assign(mix(color, vec3(0.07, 0.06, 0.05).mul(lit).mul(1.2), rw.mul(0.75)));
            }).ElseIf(previewId.equal(74.0), () => {
              const jgC = floor(objP.mul(140.0));
              const jg = smoothstep(0.96, 1.0, hash21(jgC.xy.add(jgC.z.mul(19.7)))).mul(clamp(vd.sub(10.0).div(16.0).oneMinus(), 0.0, 1.0));
              color.assign(color.mul(float(0.06).div(aL)).add(vec3(0.95, 0.72, 0.28).mul(jg.mul(1.4).add(0.08))
                .mul(vec3(U.sunColor).mul(max(dot(N, U.sunDir), 0.0)).add(vec3(U.ambSky)))));
            }).Else(() => {
              const tc = sin(objP.z.mul(9.0).add(sin(objP.y.mul(7.0)).mul(2.5)))
                .mul(sin(objP.y.mul(11.0).add(objP.x.mul(6.0)).add(sin(objP.z.mul(5.0)).mul(2.0))));
              color.assign(vec3(lit).mul(mix(float(0.06), float(0.85), step(0.0, tc))));
            });
          }).Else(() => {
            const pr = cos("""),
])

rep('js/render/webgpu/wgsl-chunks.js', [
    ("  else if (previewId == 68 || previewId == 69) { surfaceId = 20; } else if (previewId == 70) { surfaceId = 34; }\n",
     "  else if (previewId == 68 || previewId == 69) { surfaceId = 20; } else if (previewId == 70) { surfaceId = 34; }\n"
     "  else if (previewId == 71) { surfaceId = 28; } else if (previewId == 72 || previewId == 74) { surfaceId = 34; }\n"
     "  else if (previewId == 73 || previewId == 75) { surfaceId = 20; }\n"),
    ("  if (previewId >= 60 && previewId <= 70) {\n    let pvHue",
     "  if (previewId >= 60 && previewId <= 75) {\n    let pvHue"),
    ("      color = color + (F.ambSky.xyz + F.sunColor.xyz * 0.20) * pvG * pvG * 0.06;",
     "      color = color + (F.ambSky.xyz + F.sunColor.xyz * 0.20) * pvG * pvG * 0.06;\n"
     "      color = color + F.sunColor.xyz * pvHue * 0.22 * pow(max(dot(N, normalize(F.sunDir.xyz + V)), 0.0), 6.0);"),
    ("(F.ambSky.xyz * 3.0 + F.sunColor.xyz * 0.80 * max(dot(N, F.sunDir.xyz), 0.0) + vec3<f32>(0.18))",
     "(F.ambSky.xyz * 2.0 + F.sunColor.xyz * 0.90 * max(dot(N, F.sunDir.xyz), 0.0) + vec3<f32>(0.10))"),
    ("""    } else {
      color = color * mix(vec3<f32>(1.0), 0.75 + 0.5 * cos(""",
     """    } else if (previewId >= 71) {
      let aL = max(dot(albedo, vec3<f32>(0.299, 0.587, 0.114)), 0.05);
      let lit = pvL / aL;
      if (previewId == 71) {
        color = mix(color, vec3<f32>(pvL) * 1.25, vec3<f32>(0.35 * pvG * pvG)) * 1.04;
      } else if (previewId == 72) {
        color = vec3<f32>(lit) * 0.92 * mix(vec3<f32>(1.0, 0.97, 0.92), vec3<f32>(0.86, 0.92, 1.0), vec3<f32>(smoothstep(0.2, 0.8, pvG)));
      } else if (previewId == 73) {
        let rw = clamp((0.45 - in.objPos.y) / 0.35, 0.0, 1.0) * (0.55 + 0.45 * hash21(floor(vec2<f32>(in.objPos.z * 8.0, in.objPos.y * 60.0))));
        color = mix(color, vec3<f32>(0.07, 0.06, 0.05) * lit * 1.2, vec3<f32>(rw * 0.75));
      } else if (previewId == 74) {
        let jgC = floor(in.objPos * 140.0);
        let jg = smoothstep(0.96, 1.0, hash21(jgC.xy + jgC.z * 19.7)) * clamp(1.0 - (vDist - 10.0) / 16.0, 0.0, 1.0);
        color = color * (0.06 / aL) + vec3<f32>(0.95, 0.72, 0.28) * (jg * 1.4 + 0.08) * (F.sunColor.xyz * max(dot(N, F.sunDir.xyz), 0.0) + F.ambSky.xyz);
      } else {
        let tc = sin(in.objPos.z * 9.0 + sin(in.objPos.y * 7.0) * 2.5) * sin(in.objPos.y * 11.0 + in.objPos.x * 6.0 + sin(in.objPos.z * 5.0) * 2.0);
        color = vec3<f32>(lit) * mix(0.06, 0.85, step(0.0, tc));
      }
    } else {
      color = color * mix(vec3<f32>(1.0), 0.75 + 0.5 * cos("""),
])
print("v5 patch applied")
