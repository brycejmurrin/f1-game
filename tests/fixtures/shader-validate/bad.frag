#version 300 es
precision highp float;
out vec4 outColor;
void main() {
  vec3 c = vec2(1.0, 0.0);   // planted: vec2 assigned to vec3
  outColor = vec4(c, undefinedName);   // planted: undeclared identifier
}
