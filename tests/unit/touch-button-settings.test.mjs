import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

function boot() {
  const dom = makeDom(), context = vm.createContext({ document: dom.document });
  for (const path of ["js/input/pedal-travel.js", "js/ui/touch-button-settings.js"]) {
    vm.runInContext(fs.readFileSync(absSrc(path), "utf8"), context, { filename: absSrc(path) });
  }
  const host = dom.document.createElement("div"); host.id = "touch-test"; dom.body.appendChild(host);
  return { dom, host, editor: vm.runInContext("TouchButtonSettings", context), model: vm.runInContext("PedalTravel", context) };
}

test("changing, reopening and resetting a touch response edits only the selected button", () => {
  const { host, dom, editor, model } = boot();
  editor.mount(host);
  const field = key => dom.byId("touch-test-" + key);
  const choose = (key, value) => { field(key).value = value; field(key).onchange(); };
  const slider = host.querySelector("input"), reset = host.querySelector("button");
  assert.equal(field("button").value, "left");
  assert.ok(field("slide").parentElement.parentElement.hidden);
  const adaptive = field("adaptive");
  assert.equal(adaptive.parentElement.parentElement.hidden, false);
  assert.equal(adaptive.value, "inherit");
  assert.equal(adaptive.children.length, 11);
  choose("adaptive", "1");
  assert.equal(model.buttonOverrides("left").adaptive, 1);
  choose("button", "right");
  assert.equal(adaptive.value, "inherit");
  choose("adaptive", "10");
  choose("button", "left");
  assert.equal(adaptive.value, "1");
  choose("adaptive", "inherit");
  assert.equal(model.buttonOverrides("left").adaptive, undefined);
  assert.equal(model.buttonOverrides("right").adaptive, 10);
  choose("press", "progressive");
  choose("button", "brake");
  assert.equal(field("press").value, "instant");
  assert.equal(adaptive.parentElement.parentElement.hidden, true);
  assert.equal(field("slide").parentElement.parentElement.hidden, false);
  slider.value = "120"; slider.oninput();
  assert.equal(slider.getAttribute("aria-valuetext"), "120 pixels");
  assert.equal(model.buttonProfile("brake").travel, 90);
  slider.onchange(); choose("slide", "ease"); choose("feedback", "off");
  assert.equal(model.buttonProfile("brake").feedback, false);
  editor.mount(host);
  assert.equal(host.querySelectorAll("input").length, 1);
  assert.equal(slider.value, "120");
  choose("slide", "inherit");
  assert.equal(model.buttonOverrides("brake").slide, undefined);
  reset.onclick();
  assert.equal(slider.value, "90");
  assert.equal(field("feedback").value, "on");
  choose("button", "left");
  assert.equal(field("press").value, "progressive");
});

test("controller editor offers only the controls its caller supports", () => {
  const { host, dom, editor } = boot(); editor.mount(host, ["gas", "brake"], { standalone: true });
  const select = dom.byId("touch-test-button");
  assert.deepEqual(select.children.map(option => option.value), ["gas", "brake"]);
  assert.equal(select.value, "gas");
  assert.ok(dom.byId("touch-test-adaptive").parentElement.parentElement.hidden);
  const slide = dom.byId("touch-test-slide");
  assert.equal(slide.value, "inherit");
  assert.equal(slide.children[0].textContent, "STAY ON ORIGINAL PEDAL");
});
