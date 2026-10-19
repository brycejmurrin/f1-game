// Preload (node -r): names vm scripts after the js/ file whose text they run, so V8 coverage attributes them.
const fs = require('fs'), vm = require('vm'), path = require('path');
const seen = new Map(); // text -> abs path
const rf = fs.readFileSync;
fs.readFileSync = function (p, o) {
  const r = rf.apply(this, arguments);
  try {
    if (typeof p === 'string' && /[\\/]js[\\/].*\.js$/.test(p) && (typeof o === 'string' || (o && o.encoding))) seen.set(r, path.resolve(p));
  } catch (e) {}
  return r;
};
function nameFor(code) {
  if (typeof code !== 'string') return null;
  const p = seen.get(code); if (p) return p;
  for (const [t, f] of seen) if (code.includes(t)) return f;
  return null;
}
const rIC = vm.runInContext;
vm.runInContext = function (code, ctx, opts) {
  const f = nameFor(code);
  if (f && (typeof opts !== 'object' || !opts || !opts.filename)) opts = Object.assign({}, typeof opts === 'string' ? { filename: opts } : opts, { filename: f });
  return rIC.call(this, code, ctx, opts);
};
const OS = vm.Script;
vm.Script = class extends OS { constructor(code, opts) { const f = nameFor(code); if (f && !(opts && opts.filename)) opts = Object.assign({}, opts, { filename: f }); super(code, opts); } };
