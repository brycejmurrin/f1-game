# DESIGN PREVIEW v6, lane C (apply to scratch/lane-C, which already holds v3-v5 + the A/B/C scaffold markers).
# Theme C: race condition & livery technique. New ids 86-90:
#   rainsoak -> 20 (gloss), stealth -> 28 (matte), primer -> 20 (gloss), heatrear -> 20 (gloss), sunfaded -> 26 (satin).
# Refs: Red Bull matte (2016-2025, refs/finishes/matte-navy-*.jpg) vs its gloss RB22 (planetf1.com, 2026);
# McLaren MCL33 / Sauber C32 engine-cover heat staining (f1technical.net threads); test cars running new parts
# unpainted (Aston Martin AMR26 Barcelona shakedown, Jan 2026); chalky oxidised single-stage paint (Mike Phillips).
# Object space: +z nose, exhaust exit ~ (0, 0.40-0.60, -2.3..-2.6) per car-draw.js drawExhaustFx.
def rep(p, pairs):
    s = open(p).read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, a[:70])
        s = s.replace(a, b)
    open(p, 'w').write(s)

rep('js/car/car-materials.js', [(
    "    // PREVIEW-IDS-C\n",
    "    // PREVIEW-IDS-C\n    rainsoak: 86, stealth: 87, primer: 88, heatrear: 89, sunfaded: 90,\n")])

rep('js/render/glx/shaders/glsl-lit.js', [
    ("  // PREVIEW-REMAP-C\n",
     "  // PREVIEW-REMAP-C\n"
     "  if (previewId == 86 || previewId == 88 || previewId == 89) surfaceId = 20;\n"
     "  if (previewId == 87) surfaceId = 28;\n"
     "  if (previewId == 90) surfaceId = 26;\n"),
    ("      // PREVIEW-TINT-C\n",
     """      // PREVIEW-TINT-C
      float cAL = max(dot(albedo, vec3(0.299, 0.587, 0.114)), 0.05);
      float cLit = pvL / cAL;   // the lighting with the livery divided out
      float cNear = clamp(1.0 - (vDist - 10.0) / 16.0, 0.0, 1.0);
      if (previewId == 86) {   // rainsoak: wet paint goes deep and dark, a water sheet mirrors the sky on top, beads glint
        float wsUp = clamp(N.y, 0.0, 1.0);
        vec3 wsC = floor(vObjPos * 70.0);
        float wsB = step(0.86, hash21(wsC.xy + wsC.z * 13.1)) * cNear;
        color = max(mix(vec3(pvL), color, 1.35), vec3(0.0)) * 0.55;
        color += uAmbSky * (0.25 + 1.6 * pvG * pvG) * (0.35 + 0.65 * wsUp);
        color += (uSunColor * 1.2 * pow(max(dot(N, normalize(uSunDir + V)), 0.0), 40.0) + uAmbSky) * wsB * 0.9;
      } else if (previewId == 87) {   // stealth: gloss twin stripes + flank band inside a matte body (gloss-on-matte)
        float ssX = abs(vObjPos.x);
        float ss = min(step(0.05, ssX) * step(ssX, 0.19) * step(0.35, N.y)
                     + step(0.42, vObjPos.y) * step(vObjPos.y, 0.54) * step(abs(N.y), 0.5), 1.0);
        vec3 ssGl = color * 0.45 + uAmbSky * (0.20 + 1.4 * pvG * pvG) + uSunColor * (2.5 * pow(max(dot(N, normalize(uSunDir + V)), 0.0), 90.0));
        color = mix(color * 1.05, ssGl, ss);
      } else if (previewId == 88) {   // primer: new engine cover, sidepods and front wing in flat test-part grey
        float pmX = abs(vObjPos.x);
        float pmM = max(max(step(vObjPos.z, -0.5) * step(0.55, vObjPos.y) * step(pmX, 0.45),
                            step(0.35, pmX) * step(-1.3, vObjPos.z) * step(vObjPos.z, 0.5) * step(vObjPos.y, 0.62)), step(2.1, vObjPos.z));
        vec3 pmG = vec3(0.50, 0.51, 0.50) * (uSunColor * max(dot(N, uSunDir), 0.0) + uAmbSky) * (0.94 + 0.06 * hash21(floor(vObjPos.xz * 6.0 + vObjPos.y * 6.0)));
        color = mix(color, pmG, pmM);
      } else if (previewId == 89) {   // heatrear: paint scorched -> straw -> purple -> blue toward the exhaust exit only
        vec3 htP = vec3(vObjPos.x * 1.4, (vObjPos.y - 0.45) * 1.3, (vObjPos.z + 2.35) * 0.55);
        vec3 htC = floor(vObjPos * 12.0);
        float ht = clamp(1.0 - length(htP) / 0.85 + (hash21(htC.xy + htC.z * 5.3) - 0.5) * 0.12, 0.0, 1.0);
        vec3 htO = mix(color, vec3(pvL) * vec3(0.55, 0.42, 0.30), smoothstep(0.0, 0.20, ht));
        htO = mix(htO, vec3(0.85, 0.66, 0.32) * cLit, smoothstep(0.20, 0.35, ht));
        htO = mix(htO, vec3(0.55, 0.30, 0.55) * cLit, smoothstep(0.35, 0.50, ht));
        color = mix(htO, vec3(0.25, 0.40, 0.85) * cLit, smoothstep(0.50, 0.70, ht));
      } else {   // sunfaded: oxidised single-stage paint -- pastel, chalky, the sun-facing top faded most
        float sdE = 0.45 + 0.40 * clamp(N.y, 0.0, 1.0);
        color = mix(color, vec3(pvL) * vec3(1.04, 1.0, 0.94), sdE * 0.8);
        color = mix(color, vec3(0.80, 0.78, 0.74) * cLit, sdE * 0.45);
      }
"""),
])

rep('js/render/three/tsl-lit.js', [
    ("        // PREVIEW-REMAP-C\n",
     "        // PREVIEW-REMAP-C\n"
     "        If(previewId.equal(86.0).or(previewId.equal(88.0)).or(previewId.equal(89.0)), () => { surfaceId.assign(20.0); });\n"
     "        If(previewId.equal(87.0), () => { surfaceId.assign(28.0); });\n"
     "        If(previewId.equal(90.0), () => { surfaceId.assign(26.0); });\n"),
    ("            // PREVIEW-TINT-C\n",
     """            // PREVIEW-TINT-C
            const cL0 = pvL.toVar();   // frozen before color is reassigned below
            const cLit = cL0.div(max(dot(albedo, vec3(0.299, 0.587, 0.114)), 0.05)).toVar();
            const cNear = clamp(vd.sub(10.0).div(16.0).oneMinus(), 0.0, 1.0);
            If(previewId.equal(86.0), () => {
              const wsUp = clamp(N.y, 0.0, 1.0);
              const wsC = floor(objP.mul(70.0));
              const wsB = step(0.86, hash21(wsC.xy.add(wsC.z.mul(13.1)))).mul(cNear);
              color.assign(max(mix(vec3(cL0), color, 1.35), vec3(0.0)).mul(0.55));
              color.addAssign(vec3(U.ambSky).mul(pvG2.mul(1.6).add(0.25)).mul(wsUp.mul(0.65).add(0.35)));
              color.addAssign(vec3(U.sunColor).mul(pow(max(dot(N, normalize(U.sunDir.add(V))), 0.0), 40.0).mul(1.2))
                .add(vec3(U.ambSky)).mul(wsB.mul(0.9)));
            }).ElseIf(previewId.equal(87.0), () => {
              const ssX = abs(objP.x);
              const ss = min(step(0.05, ssX).mul(step(ssX, 0.19)).mul(step(0.35, N.y))
                .add(step(0.42, objP.y).mul(step(objP.y, 0.54)).mul(step(abs(N.y), 0.5))), 1.0);
              const ssGl = color.mul(0.45).add(vec3(U.ambSky).mul(pvG2.mul(1.4).add(0.20)))
                .add(vec3(U.sunColor).mul(pow(max(dot(N, normalize(U.sunDir.add(V))), 0.0), 90.0).mul(2.5)));
              color.assign(mix(color.mul(1.05), ssGl, ss));
            }).ElseIf(previewId.equal(88.0), () => {
              const pmX = abs(objP.x);
              const pmM = max(max(step(objP.z, -0.5).mul(step(0.55, objP.y)).mul(step(pmX, 0.45)),
                step(0.35, pmX).mul(step(-1.3, objP.z)).mul(step(objP.z, 0.5)).mul(step(objP.y, 0.62))), step(2.1, objP.z));
              const pmG = vec3(0.50, 0.51, 0.50).mul(vec3(U.sunColor).mul(max(dot(N, U.sunDir), 0.0)).add(vec3(U.ambSky)))
                .mul(hash21(floor(objP.xz.mul(6.0).add(objP.y.mul(6.0)))).mul(0.06).add(0.94));
              color.assign(mix(color, pmG, pmM));
            }).ElseIf(previewId.equal(89.0), () => {
              const htP = vec3(objP.x.mul(1.4), objP.y.sub(0.45).mul(1.3), objP.z.add(2.35).mul(0.55));
              const htC = floor(objP.mul(12.0));
              const ht = clamp(length(htP).div(0.85).oneMinus().add(hash21(htC.xy.add(htC.z.mul(5.3))).sub(0.5).mul(0.12)), 0.0, 1.0);
              const htO = mix(color, vec3(cL0).mul(vec3(0.55, 0.42, 0.30)), smoothstep(0.0, 0.20, ht)).toVar();
              htO.assign(mix(htO, vec3(0.85, 0.66, 0.32).mul(cLit), smoothstep(0.20, 0.35, ht)));
              htO.assign(mix(htO, vec3(0.55, 0.30, 0.55).mul(cLit), smoothstep(0.35, 0.50, ht)));
              color.assign(mix(htO, vec3(0.25, 0.40, 0.85).mul(cLit), smoothstep(0.50, 0.70, ht)));
            }).Else(() => {
              const sdE = clamp(N.y, 0.0, 1.0).mul(0.40).add(0.45);
              color.assign(mix(color, vec3(cL0).mul(vec3(1.04, 1.0, 0.94)), sdE.mul(0.8)));
              color.assign(mix(color, vec3(0.80, 0.78, 0.74).mul(cLit), sdE.mul(0.45)));
            });
"""),
])

rep('js/render/webgpu/wgsl-chunks.js', [
    ("  // PREVIEW-REMAP-C\n",
     "  // PREVIEW-REMAP-C\n"
     "  if (previewId == 86 || previewId == 88 || previewId == 89) { surfaceId = 20; }\n"
     "  if (previewId == 87) { surfaceId = 28; }\n"
     "  if (previewId == 90) { surfaceId = 26; }\n"),
    ("      // PREVIEW-TINT-C\n",
     """      // PREVIEW-TINT-C
      let cAL = max(dot(albedo, vec3<f32>(0.299, 0.587, 0.114)), 0.05);
      let cLit = pvL / cAL;
      let cNear = clamp(1.0 - (vDist - 10.0) / 16.0, 0.0, 1.0);
      if (previewId == 86) {
        let wsUp = clamp(N.y, 0.0, 1.0);
        let wsC = floor(in.objPos * 70.0);
        let wsB = step(0.86, hash21(wsC.xy + wsC.z * 13.1)) * cNear;
        color = max(mix(vec3<f32>(pvL), color, vec3<f32>(1.35)), vec3<f32>(0.0)) * 0.55;
        color = color + F.ambSky.xyz * (0.25 + 1.6 * pvG * pvG) * (0.35 + 0.65 * wsUp);
        color = color + (F.sunColor.xyz * 1.2 * pow(max(dot(N, normalize(F.sunDir.xyz + V)), 0.0), 40.0) + F.ambSky.xyz) * (wsB * 0.9);
      } else if (previewId == 87) {
        let ssX = abs(in.objPos.x);
        let ss = min(step(0.05, ssX) * step(ssX, 0.19) * step(0.35, N.y)
                   + step(0.42, in.objPos.y) * step(in.objPos.y, 0.54) * step(abs(N.y), 0.5), 1.0);
        let ssGl = color * 0.45 + F.ambSky.xyz * (0.20 + 1.4 * pvG * pvG) + F.sunColor.xyz * (2.5 * pow(max(dot(N, normalize(F.sunDir.xyz + V)), 0.0), 90.0));
        color = mix(color * 1.05, ssGl, vec3<f32>(ss));
      } else if (previewId == 88) {
        let pmX = abs(in.objPos.x);
        let pmM = max(max(step(in.objPos.z, -0.5) * step(0.55, in.objPos.y) * step(pmX, 0.45),
                          step(0.35, pmX) * step(-1.3, in.objPos.z) * step(in.objPos.z, 0.5) * step(in.objPos.y, 0.62)), step(2.1, in.objPos.z));
        let pmG = vec3<f32>(0.50, 0.51, 0.50) * (F.sunColor.xyz * max(dot(N, F.sunDir.xyz), 0.0) + F.ambSky.xyz) * (0.94 + 0.06 * hash21(floor(in.objPos.xz * 6.0 + vec2<f32>(in.objPos.y * 6.0))));
        color = mix(color, pmG, vec3<f32>(pmM));
      } else if (previewId == 89) {
        let htP = vec3<f32>(in.objPos.x * 1.4, (in.objPos.y - 0.45) * 1.3, (in.objPos.z + 2.35) * 0.55);
        let htC = floor(in.objPos * 12.0);
        let ht = clamp(1.0 - length(htP) / 0.85 + (hash21(htC.xy + htC.z * 5.3) - 0.5) * 0.12, 0.0, 1.0);
        var htO = mix(color, vec3<f32>(pvL) * vec3<f32>(0.55, 0.42, 0.30), vec3<f32>(smoothstep(0.0, 0.20, ht)));
        htO = mix(htO, vec3<f32>(0.85, 0.66, 0.32) * cLit, vec3<f32>(smoothstep(0.20, 0.35, ht)));
        htO = mix(htO, vec3<f32>(0.55, 0.30, 0.55) * cLit, vec3<f32>(smoothstep(0.35, 0.50, ht)));
        color = mix(htO, vec3<f32>(0.25, 0.40, 0.85) * cLit, vec3<f32>(smoothstep(0.50, 0.70, ht)));
      } else {
        let sdE = 0.45 + 0.40 * clamp(N.y, 0.0, 1.0);
        color = mix(color, vec3<f32>(pvL) * vec3<f32>(1.04, 1.0, 0.94), vec3<f32>(sdE * 0.8));
        color = mix(color, vec3<f32>(0.80, 0.78, 0.74) * cLit, vec3<f32>(sdE * 0.45));
      }
"""),
])
print("lane C applied")
