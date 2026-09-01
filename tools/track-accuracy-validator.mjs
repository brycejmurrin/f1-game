// @doc Shape-error maths (`MAX_SHAPE_ERROR`, `signedArea`, …) shared by the circuit-accuracy tests.
// @skill new-track
export const MAX_SHAPE_ERROR = 0.31;

export function signedArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

function resampleClosed(points, count = 128) {
  const pts = points.slice();
  if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
  const lengths = [];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lengths.push(length);
    total += length;
  }
  const out = [];
  let edge = 0, edgeStart = 0;
  for (let n = 0; n < count; n++) {
    const target = total * n / count;
    while (edge < lengths.length - 1 && edgeStart + lengths[edge] < target) {
      edgeStart += lengths[edge++];
    }
    const a = pts[edge], b = pts[(edge + 1) % pts.length];
    const t = lengths[edge] ? (target - edgeStart) / lengths[edge] : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

function centreAndScale(points) {
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const centred = points.map(([x, y]) => [x - cx, y - cy]);
  const scale = Math.sqrt(centred.reduce((sum, [x, y]) => sum + x * x + y * y, 0) / points.length) || 1;
  return centred.map(([x, y]) => [x / scale, y / scale]);
}

function alignedError(a, b, shift) {
  let dot = 0, cross = 0;
  for (let i = 0; i < a.length; i++) {
    const p = a[i], q = b[(i + shift) % b.length];
    dot += p[0] * q[0] + p[1] * q[1];
    cross += p[0] * q[1] - p[1] * q[0];
  }
  const angle = Math.atan2(cross, dot);
  const c = Math.cos(angle), s = Math.sin(angle);
  let squared = 0;
  for (let i = 0; i < a.length; i++) {
    const p = a[i], q = b[(i + shift) % b.length];
    const x = q[0] * c + q[1] * s;
    const y = -q[0] * s + q[1] * c;
    squared += (p[0] - x) ** 2 + (p[1] - y) ** 2;
  }
  return Math.sqrt(squared / a.length);
}

export function compareCircuit(referencePoints, gamePoints) {
  const reference = centreAndScale(resampleClosed(referencePoints));
  const game = centreAndScale(resampleClosed(gamePoints));
  let shapeError = Infinity;
  for (let shift = 0; shift < game.length; shift++) {
    shapeError = Math.min(shapeError, alignedError(reference, game, shift));
  }
  const referenceDirection = signedArea(referencePoints) < 0 ? "CW" : "CCW";
  const gameDirection = signedArea(gamePoints) < 0 ? "CW" : "CCW";
  return {
    referenceDirection,
    gameDirection,
    directionMatch: referenceDirection === gameDirection,
    shapeError,
  };
}

export function validateMappings(mapping, gameCircuits, referencesById) {
  const issues = [];
  for (const [gameId, referenceId] of Object.entries(mapping)) {
    if (!referencesById.has(referenceId)) {
      issues.push(`missing reference "${referenceId}" for game circuit "${gameId}"`);
    }
    if (!gameCircuits[gameId]) {
      issues.push(`missing game circuit "${gameId}" for reference "${referenceId}"`);
    }
  }
  return issues;
}
