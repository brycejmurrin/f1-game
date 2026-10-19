# DESIGN PREVIEW v6, lane B (apply to a tree that holds the PREVIEW-*-B markers).
# Theme B: exotic paint effects from real paint makers. ids 81-85:
#   81 ghostpearl     -> 20 gloss   livery face; a complementary pearl tint only at sunlit grazing edges (HoK Ice/ghost pearl)
#   82 xirallic       -> 34 flake   dense sharp white crystal glints that twinkle with view (Merck Xirallic Al2O3 platelets)
#   83 mystichrome    -> 20 gloss   green -> cobalt -> purple -> black across angles (2004 SVT Cobra, ChromaFlair)
#   84 midnightpurple -> 20 gloss   near-black purple, violet sun bloom turning bronze at the flop (Nissan R34 LV4 MP III)
#   85 ultrablack     -> 28 matte   ~1% reflectance, light-swallowing silhouette (BMW VBX6, Surrey NanoSystems VBx2)
def rep(p, pairs):
    s = open(p).read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, a[:70])
        s = s.replace(a, b)
    open(p, 'w').write(s)

rep('js/car/car-materials.js', [(
    "    // PREVIEW-IDS-B\n",
    "    // PREVIEW-IDS-B\n    ghostpearl: 81, xirallic: 82, mystichrome: 83, midnightpurple: 84, ultrablack: 85,\n")])

rep('js/render/glx/shaders/glsl-lit.js', [
    ("  // PREVIEW-REMAP-B\n",
     "  // PREVIEW-REMAP-B\n"
     "  if (previewId == 81 || previewId == 83 || previewId == 84) surfaceId = 20;\n"
     "  if (previewId == 82) surfaceId = 34;\n"
     "  if (previewId == 85) surfaceId = 28;\n"),
    ("      // PREVIEW-TINT-B\n",
     """      // PREVIEW-TINT-B
      float bL = max(dot(albedo, vec3(0.299, 0.587, 0.114)), 0.05);
      float bLit = min(pvL / bL, 1.6);   // the lighting with the livery divided out
      float bSun = max(dot(N, uSunDir), 0.0);
      float bNH = max(dot(N, normalize(uSunDir + V)), 0.0);
      if (previewId == 81) {   // ghostpearl: livery face; complementary pearl only at sunlit grazing edges (violet on neutrals)
        vec3 gpK = vec3(1.0) - pvHue;
        gpK /= max(max(gpK.r, max(gpK.g, gpK.b)), 0.04);
        float gpS = max(pvHue.r, max(pvHue.g, pvHue.b)) - min(pvHue.r, min(pvHue.g, pvHue.b));
        vec3 gpC = mix(vec3(0.55, 0.40, 1.0), gpK, smoothstep(0.15, 0.5, gpS));
        float gpE = smoothstep(0.40, 0.85, pvG) * (0.4 + 0.6 * bSun);
        color = mix(color, vec3(bLit) * gpC * 0.85, gpE * 0.85);
      } else if (previewId == 82) {   // xirallic: dense sharp crystal glints; each flake lights at its own angle
        vec3 xC = floor(vObjPos * 160.0);
        float xH = hash21(xC.xy + xC.z * 23.1);
        float xF = clamp(1.0 - (vDist - 10.0) / 16.0, 0.0, 1.0);
        float xS = step(0.70, xH) * smoothstep(0.75, 1.0, fract(xH * 53.0 + bNH * 4.0)) * xF;
        color = color * 1.05 + (uSunColor * (0.4 + 2.0 * bSun) + uAmbSky * 1.5) * (xS * 1.6) + uSunColor * (0.06 * (1.0 - xF) * bSun);
      } else if (previewId == 83) {   // mystichrome: topaz green -> cobalt -> royal purple -> onyx; livery ignored
        float mcT = clamp(pvG * 1.15 + vObjPos.y * 0.15, 0.0, 1.0);
        vec3 mc = mix(vec3(0.20, 0.85, 0.35), vec3(0.15, 0.35, 1.0), smoothstep(0.05, 0.40, mcT));
        mc = mix(mc, vec3(0.55, 0.15, 0.85), smoothstep(0.35, 0.65, mcT));
        mc = mix(mc, vec3(0.05, 0.03, 0.08), smoothstep(0.65, 0.95, mcT));
        color = vec3(bLit) * mc * 1.1;
      } else if (previewId == 84) {   // midnightpurple: near-black purple, violet sun bloom -> bronze at the flop
        float mpH = pow(bNH, 8.0);
        vec3 mpGlow = mix(vec3(0.75, 0.25, 1.0), vec3(0.85, 0.55, 0.20), smoothstep(0.3, 0.8, pvG));
        color = color * (0.05 / bL) * vec3(0.55, 0.30, 0.85) + uSunColor * mpGlow * (mpH * 0.9 + bSun * 0.18) + uAmbSky * vec3(0.10, 0.04, 0.16);
      } else {   // ultrablack: ~1% reflectance, only a faint hint of shape survives; livery ignored
        color = vec3(0.010, 0.010, 0.011) * (1.0 + 0.6 * bLit) + uAmbSky * (0.010 * pvG);
      }
"""),
])

rep('js/render/three/tsl-lit.js', [
    ("        // PREVIEW-REMAP-B\n",
     "        // PREVIEW-REMAP-B\n"
     "        If(previewId.equal(81.0).or(previewId.equal(83.0)).or(previewId.equal(84.0)), () => { surfaceId.assign(20.0); });\n"
     "        If(previewId.equal(82.0), () => { surfaceId.assign(34.0); });\n"
     "        If(previewId.equal(85.0), () => { surfaceId.assign(28.0); });\n"),
    ("            // PREVIEW-TINT-B\n",
     """            // PREVIEW-TINT-B
            const bL = max(dot(albedo, vec3(0.299, 0.587, 0.114)), 0.05);
            const bLit = min(pvL.div(bL), 1.6);
            const bSun = max(dot(N, U.sunDir), 0.0);
            const bNH = max(dot(N, normalize(U.sunDir.add(V))), 0.0);
            If(previewId.equal(81.0), () => {   // ghostpearl
              const gpK0 = vec3(1.0).sub(pvHue);
              const gpK = gpK0.div(max(max(gpK0.r, max(gpK0.g, gpK0.b)), 0.04));
              const gpS = max(pvHue.r, max(pvHue.g, pvHue.b)).sub(min(pvHue.r, min(pvHue.g, pvHue.b)));
              const gpC = mix(vec3(0.55, 0.40, 1.0), gpK, smoothstep(0.15, 0.5, gpS));
              const gpE = smoothstep(0.40, 0.85, pvG).mul(bSun.mul(0.6).add(0.4));
              color.assign(mix(color, vec3(bLit).mul(gpC).mul(0.85), gpE.mul(0.85)));
            }).ElseIf(previewId.equal(82.0), () => {   // xirallic
              const xC = floor(objP.mul(160.0));
              const xH = hash21(xC.xy.add(xC.z.mul(23.1)));
              const xF = clamp(vd.sub(10.0).div(16.0).oneMinus(), 0.0, 1.0);
              const xS = step(0.70, xH).mul(smoothstep(0.75, 1.0, fract(xH.mul(53.0).add(bNH.mul(4.0))))).mul(xF);
              color.assign(color.mul(1.05)
                .add(vec3(U.sunColor).mul(bSun.mul(2.0).add(0.4)).add(vec3(U.ambSky).mul(1.5)).mul(xS.mul(1.6)))
                .add(vec3(U.sunColor).mul(xF.oneMinus().mul(bSun).mul(0.06))));
            }).ElseIf(previewId.equal(83.0), () => {   // mystichrome
              const mcT = clamp(pvG.mul(1.15).add(objP.y.mul(0.15)), 0.0, 1.0);
              const mc = mix(vec3(0.20, 0.85, 0.35), vec3(0.15, 0.35, 1.0), smoothstep(0.05, 0.40, mcT)).toVar();
              mc.assign(mix(mc, vec3(0.55, 0.15, 0.85), smoothstep(0.35, 0.65, mcT)));
              mc.assign(mix(mc, vec3(0.05, 0.03, 0.08), smoothstep(0.65, 0.95, mcT)));
              color.assign(vec3(bLit).mul(mc).mul(1.1));
            }).ElseIf(previewId.equal(84.0), () => {   // midnightpurple
              const mpH = pow(bNH, 8.0);
              const mpGlow = mix(vec3(0.75, 0.25, 1.0), vec3(0.85, 0.55, 0.20), smoothstep(0.3, 0.8, pvG));
              color.assign(color.mul(float(0.05).div(bL)).mul(vec3(0.55, 0.30, 0.85))
                .add(vec3(U.sunColor).mul(mpGlow).mul(mpH.mul(0.9).add(bSun.mul(0.18))))
                .add(vec3(U.ambSky).mul(vec3(0.10, 0.04, 0.16))));
            }).Else(() => {   // ultrablack
              color.assign(vec3(0.010, 0.010, 0.011).mul(bLit.mul(0.6).add(1.0)).add(vec3(U.ambSky).mul(pvG.mul(0.010))));
            });
"""),
])

rep('js/render/webgpu/wgsl-chunks.js', [
    ("  // PREVIEW-REMAP-B\n",
     "  // PREVIEW-REMAP-B\n"
     "  if (previewId == 81 || previewId == 83 || previewId == 84) { surfaceId = 20; }\n"
     "  if (previewId == 82) { surfaceId = 34; }\n"
     "  if (previewId == 85) { surfaceId = 28; }\n"),
    ("      // PREVIEW-TINT-B\n",
     """      // PREVIEW-TINT-B
      let bL = max(dot(albedo, vec3<f32>(0.299, 0.587, 0.114)), 0.05);
      let bLit = min(pvL / bL, 1.6);
      let bSun = max(dot(N, F.sunDir.xyz), 0.0);
      let bNH = max(dot(N, normalize(F.sunDir.xyz + V)), 0.0);
      if (previewId == 81) {   // ghostpearl
        let gpK0 = vec3<f32>(1.0) - pvHue;
        let gpK = gpK0 / max(max(gpK0.r, max(gpK0.g, gpK0.b)), 0.04);
        let gpS = max(pvHue.r, max(pvHue.g, pvHue.b)) - min(pvHue.r, min(pvHue.g, pvHue.b));
        let gpC = mix(vec3<f32>(0.55, 0.40, 1.0), gpK, vec3<f32>(smoothstep(0.15, 0.5, gpS)));
        let gpE = smoothstep(0.40, 0.85, pvG) * (0.4 + 0.6 * bSun);
        color = mix(color, vec3<f32>(bLit) * gpC * 0.85, vec3<f32>(gpE * 0.85));
      } else if (previewId == 82) {   // xirallic
        let xC = floor(in.objPos * 160.0);
        let xH = hash21(xC.xy + xC.z * 23.1);
        let xF = clamp(1.0 - (vDist - 10.0) / 16.0, 0.0, 1.0);
        let xS = step(0.70, xH) * smoothstep(0.75, 1.0, fract(xH * 53.0 + bNH * 4.0)) * xF;
        color = color * 1.05 + (F.sunColor.xyz * (0.4 + 2.0 * bSun) + F.ambSky.xyz * 1.5) * (xS * 1.6) + F.sunColor.xyz * (0.06 * (1.0 - xF) * bSun);
      } else if (previewId == 83) {   // mystichrome
        let mcT = clamp(pvG * 1.15 + in.objPos.y * 0.15, 0.0, 1.0);
        var mc = mix(vec3<f32>(0.20, 0.85, 0.35), vec3<f32>(0.15, 0.35, 1.0), vec3<f32>(smoothstep(0.05, 0.40, mcT)));
        mc = mix(mc, vec3<f32>(0.55, 0.15, 0.85), vec3<f32>(smoothstep(0.35, 0.65, mcT)));
        mc = mix(mc, vec3<f32>(0.05, 0.03, 0.08), vec3<f32>(smoothstep(0.65, 0.95, mcT)));
        color = vec3<f32>(bLit) * mc * 1.1;
      } else if (previewId == 84) {   // midnightpurple
        let mpH = pow(bNH, 8.0);
        let mpGlow = mix(vec3<f32>(0.75, 0.25, 1.0), vec3<f32>(0.85, 0.55, 0.20), vec3<f32>(smoothstep(0.3, 0.8, pvG)));
        color = color * (0.05 / bL) * vec3<f32>(0.55, 0.30, 0.85) + F.sunColor.xyz * mpGlow * (mpH * 0.9 + bSun * 0.18) + F.ambSky.xyz * vec3<f32>(0.10, 0.04, 0.16);
      } else {   // ultrablack
        color = vec3<f32>(0.010, 0.010, 0.011) * (1.0 + 0.6 * bLit) + F.ambSky.xyz * (0.010 * pvG);
      }
"""),
])
print("lane B applied")
