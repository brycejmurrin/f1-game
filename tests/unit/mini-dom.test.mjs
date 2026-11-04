import test from "node:test";
import assert from "node:assert/strict";
import { makeDom } from "../helpers/mini-dom.mjs";

test("matches() tests the element itself, not its descendants", () => {
  const { document } = makeDom();
  const div = document.createElement("div"), btn = document.createElement("button");
  btn.className = "x";
  div.appendChild(btn);
  assert.equal(div.matches(".x"), false);
  assert.equal(div.matches("button"), false);
  assert.equal(div.matches("button, div"), true);
  assert.equal(btn.matches(".x"), true);
});

test("removeEventListener of an unknown fn leaves registered listeners alone", () => {
  const { document } = makeDom();
  for (const target of [document.createElement("div"), document]) {
    const fired = [];
    const fa = () => fired.push("fa"), fb = () => fired.push("fb");
    target.addEventListener("click", fa);
    target.addEventListener("click", fb);
    target.removeEventListener("click", () => {});
    target.dispatchEvent({ type: "click" });
    assert.deepEqual(fired, ["fa", "fb"]);
  }
});
