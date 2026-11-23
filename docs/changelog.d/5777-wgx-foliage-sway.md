Fixed: WebGPU (WGX) trees sway and marshal flags wave in the wind like WebGL2 — the per-vertex weight was already packed in the normal’s fourth component, but the vertex shader never applied it.
