Improved: TLX's WebGL2 backend packs padded normals directly into their final buffers, avoiding a temporary 6-byte-per-vertex allocation while preserving the rendered values.
