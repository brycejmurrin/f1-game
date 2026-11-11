// SCRATCH DIAGNOSTIC (#5387) — never merged. Names (1) every NEW render object and (2) every bind-group rebuild on an
// existing render object, with the binding that changed, once the census opens its log (after the replay's jump).
export function diagHooks() {
  const D = window.__dg = { ro: [], rb: [], bakes: [], bg: 0, armed: false, err: null };
  const on = () => !!(window.__bpp && window.__bpp.gpuLogOn);
  const at = () => (window.__bpp ? window.__bpp.frames : -1);
  const iv = setInterval(() => {
    try {
      const T = typeof GLX !== "undefined" ? GLX.__tlx : null, r = T && T.renderer;
      if (!r || !r._objects || !r._bindings || D.armed) return;
      if (typeof r._objects.createRenderObject !== "function" || typeof r._bindings._update !== "function") return;
      D.armed = true; clearInterval(iv);
      const dev = r.backend && r.backend.device;
      if (dev && dev.createBindGroup) { const cb = dev.createBindGroup; dev.createBindGroup = function () { D.bg++; return cb.apply(this, arguments); }; }
      else if (r.backend && typeof r.backend.updateBindings === "function") { const ub = r.backend.updateBindings; D.glFallback = true; r.backend.updateBindings = function () { D.bg++; return ub.apply(this, arguments); }; }   // WebGL2: no device, count the rebind call
      try { if (typeof Log !== "undefined" && Log.info) { const li = Log.info; Log.info = function (tag, msg) { try { if (/per-chunk lamp/.test(String(msg))) D.bakes.push({ at: at(), on: on(), msg: String(msg).slice(0, 90) }); } catch (_) {} return li.apply(this, arguments); }; } } catch (_) {}
      const geoSeen = new WeakSet();
      // Who made each mesh: a short stack per geometry, for every gfx create call (round: paint parts, #5387).
      const mk = new WeakMap();
      const stackShort = () => (new Error().stack || "").split("\n").slice(3, 9).map((l) => l.trim().replace(/^at\s+/, "").replace(/\?v=[a-z0-9]+/g, "").replace(/\(?https?:\/\/[^\s)]*\/js\//g, "").replace(/\)$/, "")).join(" < ").slice(0, 300);
      for (const fn of ["createMesh", "createTexMesh", "createChunkedMesh"]) {
        const o = typeof GLX !== "undefined" ? GLX[fn] : null;
        if (typeof o !== "function") continue;
        GLX[fn] = function () { const h = o.apply(this, arguments); try { if (h && h.geo) mk.set(h.geo, { at: at(), on: on(), s: stackShort() }); } catch (_) {} return h; };
      }
      D.mkWrapped = true;
      const desc = (object, material) => {
        const g = object && object.geometry, e = object && object.matrixWorld && object.matrixWorld.elements;
        let key = null; try { key = T.matKeyOf ? T.matKeyOf(material) : null; } catch (_) {}
        return { obj: (object.type || "") + ":" + (object.name || ""), par: object.parent ? (object.parent.name || object.parent.type) : "-",
          verts: g && g.attributes && g.attributes.position ? g.attributes.position.count : null, kind: g ? g.__tlxKind || null : null,
          mat: (material && material.type || "") + ":" + (material && material.name || "") + "#" + (material && material.id),
          key: key ? String(key).slice(0, 80) : null, road: !!(object.userData && object.userData.tlxLgRoad),
          ident: !!(e && e[0] === 1 && e[5] === 1 && e[10] === 1 && e[12] === 0 && e[13] === 0 && e[14] === 0),
          pos: e ? [Math.round(e[12]), Math.round(e[13]), Math.round(e[14])] : null, inst: !!(object.isInstancedMesh || (object.instanceMatrix && object.count > 0)),
          mk: g ? (mk.get(g) || (g.__coSrc && mk.get(g.__coSrc)) || null) : null };
      };
      const os = r._objects, cro = os.createRenderObject;
      os.createRenderObject = function (nodes, geos, rr, object, material, scene, camera, lightsNode, renderContext, clip, passId) {
        try {
          const g = object && object.geometry, seen = g ? geoSeen.has(g) : false; if (g) geoSeen.add(g);
          if (on() && D.ro.length < 260) { const d = desc(object, material); d.at = at(); d.geoSeen = seen; d.ctx = renderContext && renderContext.id; d.pass = passId == null ? null : String(passId).slice(0, 24); D.ro.push(d); }
        } catch (e) { D.err = String(e); }
        return cro.apply(this, arguments);
      };
      const B = r._bindings, ufr = B.updateForRender, upd = B._update; let cur = null;
      B.updateForRender = function (ro) { cur = ro; try { return ufr.apply(this, arguments); } finally { cur = null; } };
      const fp = (b) => b.isSampledTexture ? { t: b.texture, id: b.texture && b.texture.id, gen: b.generation, ver: b.texture && b.texture.version,
          wh: b.texture && b.texture.image ? (b.texture.image.width + "x" + b.texture.image.height) : null }
        : b.isSampler ? { sk: b.samplerKey } : b.isStorageBuffer ? { sb: b.attribute && b.attribute.id } : null;
      B._update = function (bg, bindings) {
        let before = null;
        if (on()) { try { before = (bg.bindings || []).map(fp); } catch (_) {} }
        const n0 = D.bg, out = upd.apply(this, arguments);
        if (before && D.bg > n0 && D.rb.length < 260) {
          try {
            const ch = [];
            (bg.bindings || []).forEach((b, i) => { const a = before[i], c = fp(b); if (!a || !c) return;
              if (a.id !== c.id || a.gen !== c.gen || a.sk !== c.sk || a.sb !== c.sb) ch.push({ name: b.name, tex: c.t ? (c.t.name || c.t.type || "tex") : null, id: a.id + "->" + c.id, gen: a.gen + "->" + c.gen, ver: a.ver + "->" + c.ver, wh: a.wh + "->" + c.wh, sk: a.sk !== c.sk ? String(a.sk) + "->" + String(c.sk) : undefined }); });
            const d = cur ? desc(cur.object, cur.material) : { obj: "?" };
            d.at = at(); d.bg = bg.name; d.changed = ch; d.newRO = false; D.rb.push(d);
          } catch (e) { D.err = String(e); }
        }
        return out;
      };
    } catch (e) { D.err = String(e); }
  }, 50);
}
// Group a log by its stable fields, so ~260 rows print as a few lines.
export function groupRows(rows, keys) {
  const g = {};
  for (const r of rows || []) { const k = keys.map((x) => typeof x === "function" ? x(r) : JSON.stringify(r[x])).join("|"); const a = g[k] || (g[k] = { n: 0, at0: r.at, at1: r.at }); a.n++; a.at1 = r.at; }
  return Object.entries(g).sort((a, b) => b[1].n - a[1].n).slice(0, 25);
}
