const FlybyClear = (function () {
  "use strict";

  const SOLID = ["building", "grandstand", "tower", "motorhome", "gantry", "pit", "garage"];
  const MIN_FILL = 0.25;
  const MIN_H = 3;

  function isSolid(r) {
    if (!r || !(r.h >= MIN_H)) return false;
    if (SOLID.indexOf(r.kind) !== -1) return true;
    return r.kind === "structure" && (r.fill || 0) >= MIN_FILL;
  }

  function blockers(track) {
    if (track._fbSolid) return track._fbSolid;
    const out = [];
    const list = track.props && track.props.list;
    if (list) for (let i = 0; i < list.length; i++) if (isSolid(list[i])) out.push(list[i]);
    track._fbSolid = out;
    return out;
  }

  const GRID_CELL = 32;
  function boxGrid(list) {
    const cells = new Map();
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const x0 = Math.floor((r.x - r.w / 2) / GRID_CELL), x1 = Math.floor((r.x + r.w / 2) / GRID_CELL);
      const z0 = Math.floor((r.z - r.d / 2) / GRID_CELL), z1 = Math.floor((r.z + r.d / 2) / GRID_CELL);
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
        const k = ix * 100003 + iz;
        let a = cells.get(k);
        if (!a) cells.set(k, a = []);
        a.push(i);
      }
    }
    return cells;
  }
  const _near = [], byIndex = (a, b) => a - b;
  function nearBoxes(cells, x, z, m) {
    _near.length = 0;
    const x0 = Math.floor((x - m) / GRID_CELL), x1 = Math.floor((x + m) / GRID_CELL);
    const z0 = Math.floor((z - m) / GRID_CELL), z1 = Math.floor((z + m) / GRID_CELL);
    let many = 0;
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const a = cells.get(ix * 100003 + iz);
      if (a) { many++; for (let j = 0; j < a.length; j++) _near.push(a[j]); }
    }
    if (many > 1) {
      _near.sort(byIndex);
      let w = 0;
      for (let j = 0; j < _near.length; j++) if (!j || _near[j] !== _near[j - 1]) _near[w++] = _near[j];
      _near.length = w;
    }
    return _near;
  }

  function insideProp(track, p, margin) {
    const b = blockers(track), m = margin || 0;
    const near = nearBoxes(track._fbSolidGrid || (track._fbSolidGrid = boxGrid(b)), p[0], p[2], m);
    for (let n = 0; n < near.length; n++) {
      const r = b[near[n]];
      if (Math.abs(p[0] - r.x) < r.w / 2 + m &&
          Math.abs(p[2] - r.z) < r.d / 2 + m &&
          p[1] > r.y - r.h / 2 - m && p[1] < r.y + r.h / 2 + m) return r;
    }
    return null;
  }

  function onRoadPose(pose) {
    return pose && pose.at !== "centre" && pose.at !== "landmark" &&
      Math.abs(pose.x || 0) <= 8 && (pose.y || 0) <= 6;
  }

  const CLEAR_M = 2.5;
  function clearEye(track, eye, margin) {
    const m = margin === undefined ? CLEAR_M : margin;
    for (let i = 0; i < 4; i++) {
      const hit = insideProp(track, eye, m);
      if (!hit) break;
      eye[1] = hit.y + hit.h / 2 + m;
    }
    return eye;
  }

  const FLOOR = 1.5;
  const _fl = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
  function groundAt(track, x, z, y) {
    let g = Tracks.terrainY ? Tracks.terrainY(track, x, z) : null;
    if (g == null || !isFinite(g)) g = -Infinity;
    const pr = Tracks.project(track, x, z, null, y);
    if (pr) {
      Tracks.sample(track, pr.s, _fl);
      if (Math.abs(pr.lat) <= (_fl.hw || 10) + 2 && _fl.p[1] > g) g = _fl.p[1];
    }
    return g;
  }
  function floorEye(track, eye) {
    const g = groundAt(track, eye[0], eye[2], eye[1]);
    if (eye[1] < g + FLOOR) eye[1] = g + FLOOR;
    return eye;
  }

  return {
    isSolid, blockers, insideProp, onRoadPose, clearEye, groundAt, floorEye,
    boxGrid, nearBoxes, CLEAR_M,
  };
})();
Object.freeze(FlybyClear);
