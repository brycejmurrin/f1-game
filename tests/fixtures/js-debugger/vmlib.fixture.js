// js-debugger-node.test.mjs fixture: a game-style script loaded through vm (see vm.fixture.mjs).
const K = 3;
function triple(x) {
  return x * K;
}
var atLoad = triple(1);
