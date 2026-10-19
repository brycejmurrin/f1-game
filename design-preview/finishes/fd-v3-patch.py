# DESIGN PREVIEW v3: three reference-grounded finishes, preview ids 65-67, mirrored GLX/TLX/WGX.
# 65 alubare (W196 polished aluminium) -> 29, 66 rawcarbon (Koenigsegg KNC) -> 31, 67 flovis (F1 flow-vis) -> 20.
def rep(p, pairs):
    s = open(p).read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, a[:60])
        s = s.replace(a, b)
    open(p, 'w').write(s)

rep('js/car/car-materials.js', [(
    "    oilslick: 60, frozen: 61, fluoro: 62, burnt: 63, holo: 64,\n",
    "    oilslick: 60, frozen: 61, fluoro: 62, burnt: 63, holo: 64, alubare: 65, rawcarbon: 66, flovis: 67,\n")])

rep('js/render/glx/shaders/glsl-lit.js', [
    ("    : previewId == 63 ? 27 : previewId == 64 ? 34 : previewId;",
     "    : previewId == 63 ? 27 : previewId == 64 ? 34 : previewId == 65 ? 29 : previewId == 66 ? 31 : previewId == 67 ? 20 : previewId;"),
    ("  if (previewId >= 60 && previewId <= 64) {\n    vec3 pvHue",
     "  if (previewId >= 60 && previewId <= 67) {\n    vec3 pvHue"),
    ("    } else {   // holo: a faint prism only",
     """    } else if (previewId == 65) {   // alubare: polished bare aluminium (W196) -- warm grey, livery ignored
      color = vec3(pvL) * vec3(1.0, 0.98, 0.94) * 1.55;
    } else if (previewId == 66) {   // rawcarbon: unlacquered weave (Koenigsegg KNC) -- cool graphite satin
      color = mix(color, vec3(pvL) * vec3(0.62, 0.64, 0.70), 0.75) * 0.90;
    } else if (previewId == 67) {   // flovis: glowing aero-paint streaks running back along the body, gone at the nose
      float fv = smoothstep(0.72, 0.90, 0.5 + 0.5 * sin(vObjPos.y * 38.0 + vObjPos.x * 22.0 + sin(vObjPos.z * 2.3) * 3.0));
      fv *= smoothstep(1.4, 0.2, vObjPos.z);
      vec3 fvGlow = vec3(0.70, 1.0, 0.15) * (uAmbSky * 2.5 + uSunColor * 0.6 * max(dot(N, uSunDir), 0.0) + vec3(0.15));
      color = mix(color, fvGlow, fv * 0.9);
    } else {   // holo: a faint prism only"""),
])

rep('js/render/three/tsl-lit.js', [
    ("          .ElseIf(previewId.equal(64.0), () => { surfaceId.assign(34.0); });",
     """          .ElseIf(previewId.equal(64.0), () => { surfaceId.assign(34.0); })
          .ElseIf(previewId.equal(65.0), () => { surfaceId.assign(29.0); })
          .ElseIf(previewId.equal(66.0), () => { surfaceId.assign(31.0); })
          .ElseIf(previewId.equal(67.0), () => { surfaceId.assign(20.0); });"""),
    ("        If(previewId.greaterThanEqual(60.0).and(previewId.lessThanEqual(64.0)), () => {",
     "        If(previewId.greaterThanEqual(60.0).and(previewId.lessThanEqual(67.0)), () => {"),
    ("""          }).Else(() => {
            const pr = cos(""",
     """          }).ElseIf(previewId.equal(65.0), () => {
            color.assign(vec3(pvL).mul(vec3(1.0, 0.98, 0.94)).mul(1.55));
          }).ElseIf(previewId.equal(66.0), () => {
            color.assign(mix(color, vec3(pvL).mul(vec3(0.62, 0.64, 0.70)), 0.75).mul(0.90));
          }).ElseIf(previewId.equal(67.0), () => {
            const fvS = sin(objP.y.mul(38.0).add(objP.x.mul(22.0)).add(sin(objP.z.mul(2.3)).mul(3.0))).mul(0.5).add(0.5);
            const fv = smoothstep(0.72, 0.90, fvS).mul(smoothstep(1.4, 0.2, objP.z));
            const fvGlow = vec3(0.70, 1.0, 0.15).mul(vec3(U.ambSky).mul(2.5)
              .add(vec3(U.sunColor).mul(max(dot(N, U.sunDir), 0.0).mul(0.6))).add(0.15));
            color.assign(mix(color, fvGlow, fv.mul(0.9)));
          }).Else(() => {
            const pr = cos("""),
])

rep('js/render/webgpu/wgsl-chunks.js', [
    ("  else if (previewId == 64) { surfaceId = 34; }\n",
     "  else if (previewId == 64) { surfaceId = 34; } else if (previewId == 65) { surfaceId = 29; }\n"
     "  else if (previewId == 66) { surfaceId = 31; } else if (previewId == 67) { surfaceId = 20; }\n"),
    ("  if (previewId >= 60 && previewId <= 64) {\n    let pvHue",
     "  if (previewId >= 60 && previewId <= 67) {\n    let pvHue"),
    ("""    } else {
      color = color * mix(vec3<f32>(1.0), 0.75 + 0.5 * cos(""",
     """    } else if (previewId == 65) {
      color = vec3<f32>(pvL) * vec3<f32>(1.0, 0.98, 0.94) * 1.55;
    } else if (previewId == 66) {
      color = mix(color, vec3<f32>(pvL) * vec3<f32>(0.62, 0.64, 0.70), vec3<f32>(0.75)) * 0.90;
    } else if (previewId == 67) {
      var fv = smoothstep(0.72, 0.90, 0.5 + 0.5 * sin(in.objPos.y * 38.0 + in.objPos.x * 22.0 + sin(in.objPos.z * 2.3) * 3.0));
      fv = fv * smoothstep(1.4, 0.2, in.objPos.z);
      let fvGlow = vec3<f32>(0.70, 1.0, 0.15) * (F.ambSky.xyz * 2.5 + F.sunColor.xyz * 0.6 * max(dot(N, F.sunDir.xyz), 0.0) + vec3<f32>(0.15));
      color = mix(color, fvGlow, vec3<f32>(fv * 0.9));
    } else {
      color = color * mix(vec3<f32>(1.0), 0.75 + 0.5 * cos("""),
])
print("v3 patch applied")

# holo v3: sparser, dimmer glitter (Lunaflair reads as dark metal at range; v2 measured as confetti at 8 m).
for p in ['js/render/glx/shaders/glsl-lit.js', 'js/render/three/tsl-lit.js', 'js/render/webgpu/wgsl-chunks.js']:
    s = open(p).read()
    assert s.count('0.93, 1.0, fkH') == 1, p
    s = s.replace('0.93, 1.0, fkH', '0.975, 1.0, fkH')
    for a, b in [('0.55) * 2.2, smoothstep', '0.55) * 1.6, smoothstep'), ('0.55) * 2.2;', '0.55) * 1.6;'), ('0.55).mul(2.2);', '0.55).mul(1.6);'), ('vec3<f32>(0.55)) * 2.2;', 'vec3<f32>(0.55)) * 1.6;')]:
        s = s.replace(a, b)
    open(p, 'w').write(s)
print("holo v3 applied")
