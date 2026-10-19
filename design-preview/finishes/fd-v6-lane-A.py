# DESIGN PREVIEW v6, lane A (metals & motorsport hardware), ids 76-80. Apply to scratch/lane-A (markers PREVIEW-*-A).
# 76 goldfoil  -> 27 chrome: crinkled gold heat-shield foil (McLaren F1 engine bay; F1 exhaust/floor shielding)
# 77 anodblue  -> 29 satin metal: dyed electric-blue anodised aluminium (highlights stay blue)
# 78 cerabronze-> 26 satin panel: Cerakote H-148 Burnt Bronze ceramic coating (satin, fine speckle)
# 79 engineturn-> 27 chrome: engine-turned / jewelled aluminium (pre-war GP dash panels, Spirit of St. Louis cowl)
# 80 magchrom  -> 29 satin metal: Dow 7 chromated magnesium casting (blotchy brown / olive-gold / green-grey)
def rep(p, pairs):
    s = open(p).read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, a[:70])
        s = s.replace(a, b)
    open(p, 'w').write(s)

rep('js/car/car-materials.js', [(
    "    // PREVIEW-IDS-A\n",
    "    // PREVIEW-IDS-A\n    goldfoil: 76, anodblue: 77, cerabronze: 78, engineturn: 79, magchrom: 80,\n")])

rep('js/render/glx/shaders/glsl-lit.js', [
    ("  // PREVIEW-REMAP-A\n",
     "  // PREVIEW-REMAP-A\n"
     "  if (previewId == 76 || previewId == 79) surfaceId = 27;\n"
     "  if (previewId == 77 || previewId == 80) surfaceId = 29;\n"
     "  if (previewId == 78) surfaceId = 26;\n"),
    ("      // PREVIEW-TINT-A\n",
     """      // PREVIEW-TINT-A
      float aA = max(dot(albedo, vec3(0.299, 0.587, 0.114)), 0.18);
      float litA = min(pvL / aA, 3.0);   // the lighting with the livery divided out
      float fdA = clamp(1.0 - (vDist - 10.0) / 16.0, 0.0, 1.0);   // fine-detail fade (moire)
      if (previewId == 76) {   // goldfoil: crinkled gold heat-shield foil -- two skewed facet lattices, glints move with the view
        vec3 gc1 = floor(vObjPos * 16.0);
        vec3 gc2 = floor(vec3(vObjPos.x + vObjPos.z, vObjPos.y - vObjPos.z, vObjPos.x - vObjPos.y) * 11.0);
        float gf = fract(hash21(gc1.xy + gc1.z * 19.7) + hash21(gc2.xy + gc2.z * 7.3) * 0.7 + dot(V, vec3(0.7, 0.3, 0.5)) * 1.5);
        color = vec3(litA) * vec3(1.0, 0.74, 0.28) * 1.3 * mix(0.85, 0.30 + 1.9 * gf * gf * gf, fdA);
      } else if (previewId == 77) {   // anodblue: dyed anodised aluminium -- saturated blue, highlights blue too, pale grazing sheen
        color = vec3(litA) * mix(vec3(0.06, 0.28, 1.10), vec3(0.55, 0.70, 1.00), 0.55 * pvG * pvG) * 1.1;
      } else if (previewId == 78) {   // cerabronze: Cerakote Burnt Bronze -- warm satin brown, ceramic speckle, broad soft sheen
        vec3 cbC = floor(vObjPos * 220.0);
        color = vec3(litA) * vec3(0.46, 0.32, 0.19) * (1.0 + (hash21(cbC.xy + cbC.z * 19.7) - 0.5) * 0.16 * fdA);
        color += uSunColor * vec3(0.9, 0.7, 0.5) * 0.16 * pow(max(dot(N, normalize(uSunDir + V)), 0.0), 8.0);
      } else if (previewId == 79) {   // engineturn: jewelled aluminium -- offset rows of polished discs, each a bright bow-tie
        vec2 etP = vec2(vObjPos.z, vObjPos.y + vObjPos.x * 0.7) * 9.0;
        etP.x += fract(floor(etP.y) * 0.5);
        vec2 etD = fract(etP) - 0.5;
        float etR = length(etD);
        float etB = pow(abs(dot(etD / max(etR, 0.001), normalize(vec2(V.x - V.z, 0.6)))), 3.0);
        color = vec3(litA) * vec3(0.95, 0.96, 0.98) * 1.2 * mix(0.9, mix(0.45, 0.40 + 1.3 * etB, step(etR, 0.5)), fdA);
      } else {   // magchrom: Dow 7 chromated magnesium -- blotchy brown / olive-gold / green-grey, cast grain
        float mgB = 0.5 + 0.5 * sin(vObjPos.z * 4.0 + sin(vObjPos.y * 9.0 + vObjPos.x * 5.0) * 1.8) * cos(vObjPos.y * 7.0 - vObjPos.z * 2.5 + sin(vObjPos.x * 6.0));
        vec3 mgC = floor(vObjPos * 120.0);
        vec3 mgK = mix(mix(vec3(0.34, 0.24, 0.13), vec3(0.62, 0.54, 0.24), smoothstep(0.2, 0.6, mgB)), vec3(0.38, 0.43, 0.29), smoothstep(0.65, 0.95, mgB));
        color = vec3(litA) * mgK * 1.15 * (1.0 + (hash21(mgC.xy + mgC.z * 7.1) - 0.5) * 0.20 * fdA);
      }
"""),
])

rep('js/render/three/tsl-lit.js', [
    ("        // PREVIEW-REMAP-A\n",
     "        // PREVIEW-REMAP-A\n"
     "        If(previewId.equal(76.0).or(previewId.equal(79.0)), () => { surfaceId.assign(27.0); });\n"
     "        If(previewId.equal(77.0).or(previewId.equal(80.0)), () => { surfaceId.assign(29.0); });\n"
     "        If(previewId.equal(78.0), () => { surfaceId.assign(26.0); });\n"),
    ("            // PREVIEW-TINT-A\n",
     """            // PREVIEW-TINT-A
            const aA = max(dot(albedo, vec3(0.299, 0.587, 0.114)), 0.18);
            const litA = min(pvL.div(aA), 3.0);
            const fdA = clamp(vd.sub(10.0).div(16.0).oneMinus(), 0.0, 1.0);
            If(previewId.equal(76.0), () => {
              const gc1 = floor(objP.mul(16.0));
              const gc2 = floor(vec3(objP.x.add(objP.z), objP.y.sub(objP.z), objP.x.sub(objP.y)).mul(11.0));
              const gf = fract(hash21(gc1.xy.add(gc1.z.mul(19.7))).add(hash21(gc2.xy.add(gc2.z.mul(7.3))).mul(0.7)).add(dot(V, vec3(0.7, 0.3, 0.5)).mul(1.5)));
              color.assign(vec3(litA).mul(vec3(1.0, 0.74, 0.28)).mul(1.3).mul(mix(float(0.85), gf.mul(gf).mul(gf).mul(1.9).add(0.30), fdA)));
            }).ElseIf(previewId.equal(77.0), () => {
              color.assign(vec3(litA).mul(mix(vec3(0.06, 0.28, 1.10), vec3(0.55, 0.70, 1.00), pvG2.mul(0.55))).mul(1.1));
            }).ElseIf(previewId.equal(78.0), () => {
              const cbC = floor(objP.mul(220.0));
              color.assign(vec3(litA).mul(vec3(0.46, 0.32, 0.19)).mul(hash21(cbC.xy.add(cbC.z.mul(19.7))).sub(0.5).mul(0.16).mul(fdA).add(1.0)));
              color.addAssign(vec3(U.sunColor).mul(vec3(0.9, 0.7, 0.5)).mul(pow(max(dot(N, normalize(U.sunDir.add(V))), 0.0), 8.0).mul(0.16)));
            }).ElseIf(previewId.equal(79.0), () => {
              const etP0 = vec2(objP.z, objP.y.add(objP.x.mul(0.7))).mul(9.0);
              const etP = vec2(etP0.x.add(fract(floor(etP0.y).mul(0.5))), etP0.y);
              const etD = fract(etP).sub(0.5);
              const etR = length(etD);
              const etB = pow(abs(dot(etD.div(max(etR, 0.001)), normalize(vec2(V.x.sub(V.z), 0.6)))), 3.0);
              color.assign(vec3(litA).mul(vec3(0.95, 0.96, 0.98)).mul(1.2).mul(mix(float(0.9), mix(float(0.45), etB.mul(1.3).add(0.40), step(etR, 0.5)), fdA)));
            }).Else(() => {
              const mgB = sin(objP.z.mul(4.0).add(sin(objP.y.mul(9.0).add(objP.x.mul(5.0))).mul(1.8)))
                .mul(cos(objP.y.mul(7.0).sub(objP.z.mul(2.5)).add(sin(objP.x.mul(6.0))))).mul(0.5).add(0.5);
              const mgC = floor(objP.mul(120.0));
              const mgK = mix(mix(vec3(0.34, 0.24, 0.13), vec3(0.62, 0.54, 0.24), smoothstep(0.2, 0.6, mgB)), vec3(0.38, 0.43, 0.29), smoothstep(0.65, 0.95, mgB));
              color.assign(vec3(litA).mul(mgK).mul(1.15).mul(hash21(mgC.xy.add(mgC.z.mul(7.1))).sub(0.5).mul(0.20).mul(fdA).add(1.0)));
            });
"""),
])

rep('js/render/webgpu/wgsl-chunks.js', [
    ("  // PREVIEW-REMAP-A\n",
     "  // PREVIEW-REMAP-A\n"
     "  if (previewId == 76 || previewId == 79) { surfaceId = 27; }\n"
     "  if (previewId == 77 || previewId == 80) { surfaceId = 29; }\n"
     "  if (previewId == 78) { surfaceId = 26; }\n"),
    ("      // PREVIEW-TINT-A\n",
     """      // PREVIEW-TINT-A
      let aA = max(dot(albedo, vec3<f32>(0.299, 0.587, 0.114)), 0.18);
      let litA = min(pvL / aA, 3.0);
      let fdA = clamp(1.0 - (vDist - 10.0) / 16.0, 0.0, 1.0);
      if (previewId == 76) {
        let gc1 = floor(in.objPos * 16.0);
        let gc2 = floor(vec3<f32>(in.objPos.x + in.objPos.z, in.objPos.y - in.objPos.z, in.objPos.x - in.objPos.y) * 11.0);
        let gf = fract(hash21(gc1.xy + gc1.z * 19.7) + hash21(gc2.xy + gc2.z * 7.3) * 0.7 + dot(V, vec3<f32>(0.7, 0.3, 0.5)) * 1.5);
        color = vec3<f32>(litA) * vec3<f32>(1.0, 0.74, 0.28) * 1.3 * mix(0.85, 0.30 + 1.9 * gf * gf * gf, fdA);
      } else if (previewId == 77) {
        color = vec3<f32>(litA) * mix(vec3<f32>(0.06, 0.28, 1.10), vec3<f32>(0.55, 0.70, 1.00), vec3<f32>(0.55 * pvG * pvG)) * 1.1;
      } else if (previewId == 78) {
        let cbC = floor(in.objPos * 220.0);
        color = vec3<f32>(litA) * vec3<f32>(0.46, 0.32, 0.19) * (1.0 + (hash21(cbC.xy + cbC.z * 19.7) - 0.5) * 0.16 * fdA);
        color = color + F.sunColor.xyz * vec3<f32>(0.9, 0.7, 0.5) * 0.16 * pow(max(dot(N, normalize(F.sunDir.xyz + V)), 0.0), 8.0);
      } else if (previewId == 79) {
        var etP = vec2<f32>(in.objPos.z, in.objPos.y + in.objPos.x * 0.7) * 9.0;
        etP.x = etP.x + fract(floor(etP.y) * 0.5);
        let etD = fract(etP) - vec2<f32>(0.5);
        let etR = length(etD);
        let etB = pow(abs(dot(etD / max(etR, 0.001), normalize(vec2<f32>(V.x - V.z, 0.6)))), 3.0);
        color = vec3<f32>(litA) * vec3<f32>(0.95, 0.96, 0.98) * 1.2 * mix(0.9, mix(0.45, 0.40 + 1.3 * etB, step(etR, 0.5)), fdA);
      } else {
        let mgB = 0.5 + 0.5 * sin(in.objPos.z * 4.0 + sin(in.objPos.y * 9.0 + in.objPos.x * 5.0) * 1.8) * cos(in.objPos.y * 7.0 - in.objPos.z * 2.5 + sin(in.objPos.x * 6.0));
        let mgC = floor(in.objPos * 120.0);
        let mgK = mix(mix(vec3<f32>(0.34, 0.24, 0.13), vec3<f32>(0.62, 0.54, 0.24), vec3<f32>(smoothstep(0.2, 0.6, mgB))), vec3<f32>(0.38, 0.43, 0.29), vec3<f32>(smoothstep(0.65, 0.95, mgB)));
        color = vec3<f32>(litA) * mgK * 1.15 * (1.0 + (hash21(mgC.xy + mgC.z * 7.1) - 0.5) * 0.20 * fdA);
      }
"""),
])
print("lane A applied")
