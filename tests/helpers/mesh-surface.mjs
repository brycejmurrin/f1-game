export function trisOf(out, from = 0, to = out.idx.length) {
  const V = (i) => [out.pos[i * 3], out.pos[i * 3 + 1], out.pos[i * 3 + 2]], T = [];
  for (let i = from; i + 2 < to; i += 3) T.push([V(out.idx[i]), V(out.idx[i + 1]), V(out.idx[i + 2])]);
  return T;
}
/** The highest surface triangle over (x, z), or null — a 2 m XZ grid over `tris`. */
export function surfaceY(tris) {
  const CELL = 2, grid = new Map(), cellOf = (x, z) => Math.floor(x / CELL) + "," + Math.floor(z / CELL);
  tris.forEach((T, i) => {
    const xs = T.map((p) => p[0]), zs = T.map((p) => p[2]);
    for (let cx = Math.floor(Math.min(...xs) / CELL); cx <= Math.floor(Math.max(...xs) / CELL); cx++)
      for (let cz = Math.floor(Math.min(...zs) / CELL); cz <= Math.floor(Math.max(...zs) / CELL); cz++) {
        const key = cx + "," + cz;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
      }
  });
  return (x, z) => {
    let best = null;
    for (const i of grid.get(cellOf(x, z)) || []) {
      const [a, b, c] = tris[i];
      const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
      const l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const y = l1 * a[1] + l2 * b[1] + l3 * c[1];
      if (best === null || y > best) best = y;
    }
    return best;
  };
}
