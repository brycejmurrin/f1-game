/* Apex 26 — ApexPlay: the def() registry for NEW __apex hooks (#6962, #6920 U4.4).
   A hook is declared once, here, and the rest follows from that declaration:
     def("drillStart", { readOnly, needsTrack, doc, args, fn })
   gives the callable hook (spread into the api literal by apex.js), the lazyTrackEnsure exemption
   (readOnly: no track build on call), an honest {ok:false,error:"no_track"} (needsTrack), an
   agentHelp().play row (agentview.js reads rows() at call time) and a generated, fenced block in
   docs/DEBUG-HOOKS.md (tools/gen/gen-hooks-table.mjs reads rows() from a headless boot).
   Names are FLAT: the phone bridge's `call` only reaches /^[a-z][A-Za-z0-9]{0,40}$/. A namespace (an
   object of functions) is refused for the same reason, and lazyTrackEnsure skips non-functions.
   The 180+ older hooks are not migrated; only new ones go through def().
   LOAD ORDER: defs are collected when hooks(G) runs, at ApexApi.create (game.js bootAgentSurface, after
   every LAZY_AGENT script has evaluated). A U4.x file registers at its own eval and must sit in LAZY_AGENT
   BEFORE apex.js with an edge, or call def() from its own hooks(G). A def made after create is missing. */
const ApexPlay = (function () {
  "use strict";

  const NAME_RE = /^[a-z][A-Za-z0-9]{0,40}$/;
  const registry = new Map();   // insertion order = registry order = docs order

  function def(name, spec) {
    if (typeof name !== "string" || !NAME_RE.test(name)) throw new Error("ApexPlay.def: bad hook name " + JSON.stringify(name) + " (flat, " + NAME_RE + ")");
    if (registry.has(name)) throw new Error("ApexPlay.def: duplicate hook " + name);
    const s = spec || {};
    if (typeof s.fn !== "function") throw new Error("ApexPlay.def(" + name + "): fn must be a function (a namespace is refused)");
    if (typeof s.doc !== "string" || !s.doc.trim()) throw new Error("ApexPlay.def(" + name + "): doc is required");
    registry.set(name, { name, readOnly: !!s.readOnly, needsTrack: !!s.needsTrack, doc: s.doc.trim(), args: typeof s.args === "string" ? s.args : "", fn: s.fn });
  }

  /** One wrapper per def, for apex.js to spread into `api`. */
  function hooks(G) {
    const out = {};
    for (const [name, e] of registry) {
      out[name] = function (...a) {
        if (e.needsTrack && !G.track) return { ok: false, error: "no_track" };
        return e.fn(G, ...a);
      };
    }
    return out;
  }

  const isReadOnly = (name) => { const e = registry.get(name); return !!(e && e.readOnly); };
  const rows = () => [...registry.values()].map((e) => ({ name: e.name, args: e.args, doc: e.doc, readOnly: e.readOnly, needsTrack: e.needsTrack }));

  return { def, hooks, isReadOnly, rows };
})();
Object.freeze(ApexPlay);
