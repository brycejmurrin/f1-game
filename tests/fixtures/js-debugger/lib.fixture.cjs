// js-debugger-node.test.mjs fixture: a CommonJS helper (probe target in another file).
function scale(x) {
  const k = 2;
  return x * k;
}
module.exports = { scale };
