// @doc Pure resolvers for deploy/sync-pr conflict cures: keep both sides' hand edits in index.html and package.json.
//
// conflict-cure.mjs — the pure halves of deploy.mjs's / sync-pr.mjs's cure for
// a conflicted GENERATED file (ledger L13, 2026-10-09).
//
// The cure used to take a whole side: `checkout --theirs index.html` and
// `checkout --ours package.json`, then regenerate. Both files are only PARTLY
// generated, so the side not taken lost its hand edits even where git had
// merged them cleanly: a DOM element added to index.html outside the
// @gen-shell blocks, a dependency added to package.json, a non-test script.
// The shell guards that would notice (shell ids, dynamicIdReads) only fire
// when something happens to reference the lost id; `npm ci` fails on a
// manifest/lock mismatch only after the push.
//
// So the cure resolves ONLY what the generators will rewrite anyway:
//   index.html    conflict hunks INSIDE a `@gen-shell` span (gen-shell.mjs and
//                 title-art.mjs rewrite the span); a hunk anywhere else is a
//                 real conflict and stops the deploy.
//   package.json  a three-way merge by key: new/changed/removed fields from
//                 EITHER side survive; only `scripts.test*` (rewritten from
//                 tests/groups.json) may differ on both sides; any other field
//                 edited differently on both sides is a real conflict.

const OPEN = /<!--\s*@gen-shell:(?!\/)([\w-]+)\s*-->/;
const CLOSE = /<!--\s*(?:\/@gen-shell:([\w-]+)|@gen-shell:\/([\w-]+))\s*-->/;

/** Resolve the conflict hunks that sit entirely inside a generated span.
 *  `text` is the file as `git checkout --merge` leaves it (conflict markers
 *  in place). Returns the text with those hunks collapsed to OUR side (the
 *  generator overwrites the span, so the choice is immaterial) and the
 *  1-based line of every hunk that was NOT resolvable. */
export function resolveGenBlocks(text) {
  const lines = text.split("\n");
  const out = [];
  const unresolved = [];
  let open = null;
  const track = (ln) => {
    if (open === null) { const m = OPEN.exec(ln); if (m) open = m[1]; return; }
    const c = CLOSE.exec(ln);
    if (c && (c[1] || c[2]) === open) open = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln.startsWith("<<<<<<<")) { track(ln); out.push(ln); continue; }
    const ours = [], theirs = [];
    let part = ours, j = i + 1;
    while (j < lines.length && !lines[j].startsWith(">>>>>>>")) {
      if (lines[j].startsWith("|||||||")) part = [];                 // diff3 base: ignored
      else if (lines[j].startsWith("=======")) part = theirs;
      else part.push(lines[j]);
      j++;
    }
    const raw = lines.slice(i, Math.min(j + 1, lines.length));
    const terminated = j < lines.length;
    // A hunk that opens or closes a span, or sits outside one, is not ours to pick.
    const touchesMarker = [...ours, ...theirs].some((l) => OPEN.test(l) || CLOSE.test(l));
    if (terminated && open !== null && !touchesMarker) out.push(...ours);
    else { unresolved.push(i + 1); out.push(...raw); }
    i = Math.min(j, lines.length - 1);
  }
  return { text: out.join("\n"), unresolved };
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sortedKeys = (o) => Object.keys(o).every((k, n, a) => n === 0 || a[n - 1] < k);
/** Paths whose both-sides difference is harmless because a generator rewrites
 *  them: package.json's test scripts come from tests/groups.json. */
const GENERATED_PATH = /^scripts\.test(:|$)/;

/** Three-way merge of two parsed JSON documents against their base. Returns
 *  {merged, conflicts}: `conflicts` lists the dotted paths changed
 *  differently on both sides (excluding generated paths, where OURS is kept
 *  for the generator to overwrite). A key present on only one side survives
 *  unless the other side deleted it from an unchanged base. */
export function mergeJson3(base, ours, theirs, isGenerated = (p) => GENERATED_PATH.test(p)) {
  const conflicts = [];
  const go = (b, o, t, p) => {
    if (same(o, t)) return o;
    if (same(b, o)) return t;
    if (same(b, t)) return o;
    if (isObj(o) && isObj(t)) {
      const bb = isObj(b) ? b : {};
      const res = {};
      const keys = [...Object.keys(o), ...Object.keys(t).filter((k) => !(k in o))];
      for (const k of keys) {
        const v = go(bb[k], o[k], t[k], p ? `${p}.${k}` : k);
        if (v !== undefined) res[k] = v;
      }
      // npm keeps dependency maps sorted; keep them sorted when both sides did.
      if (sortedKeys(o) && sortedKeys(t)) return Object.fromEntries(Object.keys(res).sort().map((k) => [k, res[k]]));
      return res;
    }
    if (!isGenerated(p)) conflicts.push(p || "(root)");
    return o;
  };
  return { merged: go(base, ours, theirs, ""), conflicts };
}

/** package.json texts (base may be empty for an add/add) -> merge result. */
export function mergePackageJson(baseText, oursText, theirsText) {
  const parse = (s) => (s && s.trim() ? JSON.parse(s) : {});
  const r = mergeJson3(parse(baseText), parse(oursText), parse(theirsText));
  return { text: JSON.stringify(r.merged, null, 2) + "\n", conflicts: r.conflicts };
}
