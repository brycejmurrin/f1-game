/* persistence-vm.test.mjs — the JSON half of tests/specs/persistence.spec.js.
 * The warning DOM and the recovery download stay in
 * tests/specs/persistence-dom.spec.js. Five tests, matching the spec.
 *
 * Run: node --test tests/unit/persistence-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ storage: { trackId: "monza" } }); });
after(() => { if (g) g.close(); });

function breakStorage(name = "QuotaExceededError") {
  const ls = g.sandbox.localStorage;
  const real = ls.setItem.bind(ls);
  ls.setItem = function (k, v) {
    if (String(k).startsWith("apex26.")) {
      const e = new Error("storage is full");
      e.name = name;
      throw e;
    }
    return real(k, v);
  };
}

test("a healthy page reports ok", () => {
  const s = g.apex.persistState();
  assert.equal(s.ok, true);
  assert.equal(s.broken, null);
});

test("a failing write is recorded, logged, and reported by persistState()", () => {
  breakStorage();
  g.apex.aeroMode("auto");
  const state = g.apex.persistState();
  const logs = g.apex.logs({ ns: "game" }).map((x) => x.msg);
  assert.equal(state.ok, false);
  assert.equal(state.broken, "QuotaExceededError");
  assert.ok(logs.some((m) => /localStorage .*failed/.test(m)));
  assert.ok(logs.some((m) => /reload/.test(m)));
});

test("the exception's own name is reported, not a generic flag", async () => {
  // store.broken records the FIRST failure and keeps that name. The browser
  // spec gets a fresh page; a second throw on the shared boot would still
  // report QuotaExceededError from the test above.
  const v = await createGame({ storage: { trackId: "monza" } });
  try {
    const ls = v.sandbox.localStorage;
    const real = ls.setItem.bind(ls);
    ls.setItem = function (k, val) {
      if (String(k).startsWith("apex26.")) {
        const e = new Error("storage is full");
        e.name = "SecurityError";
        throw e;
      }
      return real(k, val);
    };
    v.apex.aeroMode("manual");
    const s = v.apex.persistState();
    assert.equal(s.ok, false);
    assert.equal(s.broken, "SecurityError");
  } finally { v.close(); }
});

test("the session still reads back what it wrote (a lost save is not a lost session)", () => {
  breakStorage();
  g.apex.aeroMode("auto");
  assert.equal(g.apex.aeroMode(), "auto");
});

test("the loud warning fires once, not once per write", async () => {
  // Fresh boot: on the shared one the single warning already fired in an
  // earlier test, so `<= 1` could not tell "once" from "never" (review P1-07).
  const v = await createGame({ storage: { trackId: "monza" } });
  try {
    const ls = v.sandbox.localStorage;
    const real = ls.setItem.bind(ls);
    ls.setItem = function (k, val) {
      if (String(k).startsWith("apex26.")) {
        const e = new Error("storage is full");
        e.name = "QuotaExceededError";
        throw e;
      }
      return real(k, val);
    };
    const mark = v.record.console.length;
    for (let i = 0; i < 6; i++) v.apex.aeroMode(i % 2 ? "auto" : "manual");
    const warned = v.record.console.slice(mark).filter((c) => /localStorage .*failed/.test(c[1]));
    assert.equal(warned.length, 1);
    const buffered = v.apex.logs({ ns: "game" }).filter((x) => /localStorage .*failed/.test(x.msg)).length;
    assert.ok(buffered > 1);
  } finally { v.close(); }
});
