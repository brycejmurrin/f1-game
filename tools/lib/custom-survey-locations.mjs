// @doc Native custom-design imports and source-located authored scenery targets (no browser).
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { buildContext, customContext } = require('../track/verify-track.cjs');

// Ask the native prop dresser for water dimensions and terrain emitter arguments.
// This is a placement query, not a second renderer or a claim that geometry emitted.
function placementTarget(P, tr, p) {
  const K = f => Math.round(((f % 1 + 1) % 1) * tr.n) % tr.n;
  const anchor = (k, side, gap) => {
    const offset = side * (tr.hw[k] + gap);
    return { c: [tr.px[k] + tr.rx[k] * offset, tr.py[k], tr.pz[k] + tr.rz[k] * offset] };
  };
  let target = anchor(K(p.s), p.kind === 'gantry' ? 0 : p.side, Math.max(P.MIN_GAP[p.kind] || 0, p.gap)).c;
  let distance = 90;
  const fit = radius => { distance = Math.max(90, radius / Math.tan(55 * Math.PI / 360) * 1.2); };
  target[1] += 1.5;
  const pyMin = Math.min(...tr.py);
  const api = { track: tr, K, pyMin, anchor,
    waterSurface(k, side, gap, size) { target = anchor(k, side, gap + size[0] / 2).c; target[1] = pyMin - .8 - size[1] / 2; fit(Math.hypot(size[0], size[2]) / 2); return true; },
    mountain(x, z, base, width, height) { target = [x, base + height / 2, z]; fit(Math.hypot(width * 2, height) / 2); },
    ridge(x, z, base, yaw, width, depth, height) { target = [x, base + height / 2, z]; fit(Math.hypot(width * 2, depth * 2, height) / 2); },
  };
  P.dress(api, { n: tr.n, total: tr.total }, [p]);
  return { target, distance };
}

export function loadSurveyDesigns(file) {
  if (statSync(file).size > 8 * 1024 * 1024) throw new Error('Design collection exceeds 8 MiB');
  const text = readFileSync(file, 'utf8'), raw = JSON.parse(text);
  const Tracks = buildContext(null, { quiet: true }), ctx = customContext(Tracks);
  const C = ctx.CustomTracks, P = ctx.TrackDesignerProps;
  if (raw.format !== C.COLLECTION_FORMAT || raw.v !== 1 || !Array.isArray(raw.items) || !raw.items.length || raw.items.length > C.LIMITS.items) throw new Error('Expected a native nonempty custom-track collection');
  const designs = raw.items.map(row => {
    if (!ctx.TrackThemes.has(row.theme)) throw new Error(`Unsupported theme ${row.theme}; use a game revision containing this theme`);
    for (const p of row.props || []) if (!P.has(p.kind)) throw new Error(`Unsupported scenery ${p.kind}; use a game revision containing this prop`);
    const it = C.sanitize(row);
    if (!it || (row.id && row.id !== it.id)) throw new Error('Invalid custom design or content id mismatch');
    if ((row.props?.length || 0) !== (it.props?.length || 0)) throw new Error('Custom scenery was rejected by the native sanitizer');
    return JSON.parse(JSON.stringify(it));
  });
  if (new Set(designs.map(d => d.id)).size !== designs.length) throw new Error('Duplicate custom design id');
  const locations = new Map();
  for (const design of designs) {
    const tr = Tracks.buildCenterline(ctx.TrackDef.fromRaw(C.toRaw(design)), { line: false });
    const counts = {};
    locations.set(design.id, (design.props || []).map((p, index) => {
      const ordinal = counts[p.kind] = (counts[p.kind] || 0) + 1;
      return { id: `${design.id}/${p.kind}-${ordinal}`, name: `${p.kind} ${ordinal}`, track: design.id,
        kind: 'custom-placement', aliases: [`${p.kind}-${ordinal}`], frac: p.s,
        ...placementTarget(P, tr, p),
        source: `custom design ${design.id} props[${index}]`,
        verification: 'authored placement anchor; emitted geometry and framing require visual review' };
    }));
  }
  return { designs, locations, digest: createHash('sha256').update(text).digest('hex') };
}
