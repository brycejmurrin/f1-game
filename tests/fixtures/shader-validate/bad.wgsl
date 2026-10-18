@fragment
fn fs_main() -> @location(0) vec4<f32> {
  let c: vec3<f32> = vec2<f32>(1.0, 0.0);   // planted: vec2 bound to vec3
  return vec4<f32>(c, undefinedName);       // planted: undeclared identifier
}
