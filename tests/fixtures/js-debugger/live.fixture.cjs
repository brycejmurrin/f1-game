// js-debugger-node.test.mjs fixture: a long-lived Node process for attach/break/collect.
function mul(a, b) {
  const product = a * b;
  return product;
}
globalThis.mul = mul;
setTimeout(() => process.exit(0), 20000);
