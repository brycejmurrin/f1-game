// Track-build equivalence oracle: normalize numeric channels identically across
// synchronous, stepped and worker-replay uploads. This does not compute geometry.
import { createHash } from "node:crypto";

function hash(values) {
  const digest = createHash("sha1");
  if (values && values.length) digest.update(Buffer.from(Float64Array.from(values).buffer));
  return digest.digest("hex").slice(0, 16);
}

const PHYSICS = ["px", "py", "pz", "hw", "barL", "barR", "lineX", "lineK"];
export function physics(track) {
  return PHYSICS.filter((key) => track[key]).map((key) => key + ":" + hash(track[key]));
}

// Callers choose channels, CPU-channel release and the returned chunked handle
// independently: worker replay needs trk, released pos/idx and a chunks handle;
// the stepped suite deliberately keeps its historical non-releasing backend.
export function createBuildRecorder({ channels, releaseChunkPositions, chunkedHandle }) {
  const log = [];
  function geo(kind, geometry, extra) {
    log.push([kind, geometry && geometry.pos ? geometry.pos.length : 0,
      ...channels.map((key) => hash(geometry && geometry[key])), extra || ""].join(" "));
    return { kind };
  }
  return {
    log,
    gfx: {
      createMesh: (geometry) => geo("mesh", geometry),
      createChunkedMesh: (geometry, cell) => {
        const handle = geo("chunked", geometry, "cell=" + cell);
        if (releaseChunkPositions && !geometry._keepPositions) { geometry.pos = null; geometry.idx = null; }
        return chunkedHandle === "chunks" ? { kind: "chunked", chunks: [1] } : handle;
      },
      createInstancedBatch: (geometry, matrices, colors) => geo("inst", geometry, hash(matrices) + "/" + hash(colors)),
    },
  };
}
