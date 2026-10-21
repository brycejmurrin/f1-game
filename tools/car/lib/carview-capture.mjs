// @doc Keep the isolated viewer's body, flap and decal identity aligned with capture requests.
export async function installCarviewCapture(page, team = 'mclaren') {
  await page.evaluate(initialTeam => {
    if (window.__carCapture) return;
    const state = window.__carCapture = { team: initialTeam, livery: {}, mesh: null };
    // The studio otherwise renders continuously between protocol round trips.
    // Retain its own callback, draw two real frames for each mutation, then idle.
    const nativeFrame = window.requestAnimationFrame.bind(window);
    let pending = null, scheduled = false, remaining = 0;
    window.requestAnimationFrame = callback => {
      if (callback.name !== 'frame') return nativeFrame(callback);
      pending = callback; return 0;
    };
    const draw = () => {
      if (scheduled || remaining <= 0) return;
      scheduled = true;
      nativeFrame(time => {
        scheduled = false;
        if (pending) { const frame = pending; pending = null; frame(time); remaining--; }
        draw();
      });
    };
    state.requestFrames = () => { remaining = 2; draw(); };
    const visibleParts = parts => Car3D.appearanceParts ? Car3D.appearanceParts(parts, state.livery) : parts;
    const build = Car3D.build, decals = CarMesh.getCarDecalMesh, aero = Car3D.aeroStyleOf, level = Car3D.aeroLevelOf, set = CARVIEW.set;
    Car3D.build = (c1, c2, opts) => {
      const mesh = build(c1, c2, { ...opts, teamId: state.team });
      let hash = 2166136261;
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < mesh.pos.length; i++) {
        const v = mesh.pos[i], k = i % 3;
        min[k] = Math.min(min[k], v); max[k] = Math.max(max[k], v);
        hash = Math.imul(hash ^ Math.round(v * 100000), 16777619);
      }
      state.mesh = { vertices: mesh.pos.length / 3, triangles: mesh.idx.length / 3, geometryHash: (hash >>> 0).toString(16), bounds: { min, max }, team: state.team, bodyStyle: state.livery.bodyStyle || 'team' };
      return mesh;
    };
    CarMesh.getCarDecalMesh = (lvl, parts, legacy, teamId, fin, spine, body) => decals(level(visibleParts(parts)), visibleParts(parts), legacy, state.team, fin, spine, state.livery.bodyStyle || body);
    Car3D.aeroLevelOf = parts => level(visibleParts(parts));
    Car3D.aeroStyleOf = parts => {
      parts = visibleParts(parts);
      const recipe = aero(parts), raw = parts?._visual?.aero || {};
      const body = Car3D.bodyStyleKey(state.team, state.livery.bodyStyle);
      for (const [key, value] of Object.entries(Car3D.teamStyleOf(body).wingStyle || {})) if (!Object.hasOwn(raw, key)) recipe[key] = value;
      return recipe;
    };
    CARVIEW.set = next => {
      if (next.team !== undefined) state.team = next.team;
      if (next.livery !== undefined) {
        const t = Teams.LIST.find(t => t.id === state.team);
        const list = Liveries.forTeam(t);
        state.livery = typeof next.livery === 'object' && next.livery ? { ...list[0], ...next.livery } : list.find(l => l.id === next.livery) || list[0];
      }
      const result = set(next);
      state.requestFrames();
      return result;
    };
  }, team);
}
