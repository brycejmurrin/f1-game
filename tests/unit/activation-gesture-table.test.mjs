// activation-gesture-table.test.mjs — #7252: ONE activation-gesture predicate (PlatformSession.isActivation);
// engine.js and radio-voice.js call it instead of carrying their own table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { absSrc } from "../helpers/abs-src.mjs";
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const src = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const isActivation = vm.runInNewContext(src("js/ui/platform-session.js") + "; PlatformSession.isActivation", {}, { filename: absSrc("js/ui/platform-session.js") });

test("shared predicate: activation-triggering events pass, the rest do not", () => {
  const cases = [
    [{ type: "pointerup", pointerType: "touch" }, true], [{ type: "pointerup", pointerType: "pen" }, true],
    [{ type: "pointerup", pointerType: "mouse" }, false],
    [{ type: "pointerdown", pointerType: "mouse" }, true], [{ type: "pointerdown", pointerType: "touch" }, false],
    [{ type: "touchend" }, true], [{ type: "click" }, true],
    [{ type: "keydown", key: "a" }, true], [{ type: "keydown", key: "Escape" }, false],
    [{ type: "touchstart" }, false], [{ type: "pointermove", pointerType: "mouse" }, false], [{ type: "keyup", key: "a" }, false],
  ];
  for (const [e, want] of cases) assert.equal(isActivation(e), want, JSON.stringify(e));
});

