// js-debugger-node.test.mjs fixture: never finishes (timeout path).
import test from "node:test";
test("hangs", () => new Promise(() => setInterval(() => {}, 1000)));
