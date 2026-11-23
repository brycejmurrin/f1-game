import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

function boot(globals = {}) {
  const dom = makeDom(), context = vm.createContext({ document: dom.document, ...globals });
  for (const path of ["js/input/pedal-travel.js", "js/input/touch-button-actions.js", "js/ui/touch-button-settings.js"]) {
    vm.runInContext(fs.readFileSync(absSrc(path), "utf8"), context, { filename: absSrc(path) });
  }
  const host = dom.document.createElement("div"); host.id = "touch-test"; dom.body.appendChild(host);
  return { dom, host, actions: vm.runInContext("TouchButtonActions", context), editor: vm.runInContext("TouchButtonSettings", context), model: vm.runInContext("PedalTravel", context) };
}

test("changing, reopening and resetting a touch response edits only the selected button", () => {
  const { host, dom, editor, model } = boot();
  editor.mount(host);
  const field = key => dom.byId("touch-test-" + key);
  const choose = (key, value) => { field(key).value = value; field(key).onchange(); };
  const slider = host.querySelector("input"), reset = host.querySelector("button");
  const describedBy = el => dom.byId(el.getAttribute("aria-describedby")).textContent;
  assert.equal(describedBy(slider).includes("40–160"), true);
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
  assert.equal(describedBy(field("feedback")).includes("Three rising bars"), true);
  choose("indicator", "percent");
  assert.match(describedBy(field("feedback")), /percentage/);
  assert.doesNotMatch(describedBy(field("feedback")), /Three rising bars/);
  choose("button", "brake"); choose("press", "progressive"); choose("sliderEdge", "bottom");
  assert.doesNotMatch(describedBy(field("feedback")), /Three rising bars/);
  choose("button", "gas");
  choose("press", "progressive");
  assert.equal(describedBy(field("feedback")).includes("Three rising bars"), false);
  assert.equal(describedBy(field("press")).includes("Latch toggles"), true);
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

test("per-button direction, starting input, timed build and color round-trip through the editor", () => {
  const { host, dom, editor, model } = boot();
  editor.mount(host);
  const field = key => dom.byId("touch-test-" + key);
  const choose = (key, value) => { field(key).value = value; field(key).onchange(); };
  choose("button", "brake"); choose("press", "progressive"); choose("direction", "down");
  choose("start", "40"); choose("buildMs", "1000"); choose("brightness", "100");
  const brake = model.buttonProfile("brake");
  assert.equal(model.level(brake, model.advance(brake, 70, -45, 45)), 0.2);
  assert.equal(model.level(brake, 0, 0.5), 0.7);
  assert.equal(model.level(brake, 90), 1);
  choose("button", "gas");
  assert.equal(field("direction").value, "default");
  assert.equal(field("start").value, "default");
  choose("button", "brake");
  assert.equal(field("brightness").value, "100");
  assert.equal(field("buildMs").value, "1000");
  choose("feedback", "off"); assert.equal(field("brightness").disabled, true);
  host.querySelector("button").onclick();
  assert.equal(field("brightness").value, "46");
});

test("a stationary timed hold advances by elapsed time and stops on release", () => {
  const frames = [];
  const { model } = boot({ performance: { now: () => 100 }, requestAnimationFrame: fn => frames.push(fn) });
  const contact = { profile: { press: "progressive", start: 20, travel: 90, buildMs: 500 } };
  const values = [];
  let held = true;
  model.buildOnHold(contact, () => held, v => values.push(v));
  frames.shift()(225);
  assert.equal(values[0], 0.4);
  contact.advance = 45;
  frames.shift()(350);
  assert.equal(values[1], 1);
  held = false;
  frames.shift()(475);
  assert.equal(frames.length, 0);
  assert.equal(values.length, 2);
});

test("Boost keeps its own colors and accepts only the chosen touch gesture", () => {
  const { host, dom, model, editor, actions: controls } = boot();
  editor.mount(host);
  const choose = (id, value) => {
    const control = dom.byId("touch-test-" + id);
    control.value = value; control.onchange();
  };
  choose("button", "boost");
  choose("idleColor", "yellow"); choose("pressedColor", "white"); choose("activation", "hold");
  const events = {}, style = {}, attrs = {};
  let actions = 0;
  const el = { style: { setProperty: (key, value) => { style[key] = value; }, removeProperty: key => delete style[key] },
    setAttribute: (key, value) => { attrs[key] = value; }, removeAttribute: key => delete attrs[key],
    getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 15, right: 15 }),
    addEventListener: (key, handle) => { events[key] = handle; }, click: () => actions++ };
  controls.bindControl(el, "boost");
  assert.equal(style["--touch-custom-idle"], "var(--gold)");
  assert.equal(model.buttonOverrides("pause").activation, undefined);
  const send = (type, time, x = 5, detail = 1, pointerId = 1) => {
    let consumed = false;
    events[type]({ timeStamp: time, detail, pointerId, pointerType: "touch", clientX: x, clientY: 5,
      preventDefault() {}, stopImmediatePropagation() { consumed = true; } });
    return consumed;
  };
  send("pointerdown", 0); send("pointerup", 200);
  send("pointerdown", 300); send("pointerup", 800, 30);
  send("pointerdown", 900); send("pointercancel", 1400); send("pointerup", 1450);
  assert.equal(actions, 0);
  send("pointerdown", 1500); send("pointerup", 1950);
  assert.equal(actions, 1);
  assert.equal(send("click", 1951), true);
  assert.equal(send("click", 1951, 5, 0), false);
  choose("activation", "double");
  send("pointerdown", 2100); send("pointerup", 2120);
  send("pointerdown", 2600); send("pointerup", 2620);
  assert.equal(actions, 1);
  send("pointerdown", 2650); send("pointerup", 2700);
  assert.equal(actions, 2);
  choose("activation", "tap");
  send("pointerdown", 2800); send("pointerup", 2820);
  assert.equal(actions, 3);
  choose("activation", "quick");
  send("pointerdown", 3000); send("pointerup", 3181);
  send("pointerdown", 3200); send("pointerup", 3380);
  assert.equal(actions, 4);
  choose("activation", "long");
  send("pointerdown", 4000); send("pointerup", 4899);
  send("pointerdown", 5000); send("pointerup", 5900);
  assert.equal(actions, 5);
  choose("activation", "double");
  send("pointerdown", 6000);
  dom.dispatch(dom.document, { type: "touchend", touches: [] }); // missing pointerup
  send("pointerdown", 6100, 5, 1, 2); send("pointerup", 6120, 5, 1, 2);
  dom.dispatch(dom.document, { type: "touchend", touches: [] }); // normal first tap
  send("pointerdown", 6200, 5, 1, 3); send("pointerup", 6220, 5, 1, 3);
  assert.equal(actions, 6, "an interrupted touch releases ownership; normal lifts preserve the first tap");
  host.querySelector("button").onclick();
  assert.equal(send("pointerdown", 2900), false);
  assert.equal(style["--touch-custom-idle"], undefined);
});

test("build curves share the same start and finish and save separately per button", () => {
  const { host, dom, editor, model } = boot();
  editor.mount(host);
  const select = (key, value) => {
    const el = dom.byId("touch-test-" + key); el.value = value; el.onchange();
  };
  select("button", "brake"); select("start", "20"); select("buildMs", "1000");
  for (const [power, quarter] of [["2", 0.25], ["0.5", 0.6], ["1", 0.4]]) {
    select("buildPower", power);
    const profile = model.buttonProfile("brake");
    assert.equal(model.level(profile, 0, 0), 0.2);
    assert.ok(Math.abs(model.level(profile, 0, 0.25) - quarter) < 1e-10);
    assert.equal(model.level(profile, 0, 1), 1);
    assert.equal(model.buttonProfile("gas").buildPower, undefined);
  }
});

test("touch position maps each edge and clamps to the actual resized button", () => {
  const { model, dom, host, editor } = boot();
  editor.mount(host);
  const field = id => dom.byId("touch-test-" + id);
  const choose = (id, value) => { field(id).value = value; field(id).onchange(); };
  choose("button", "gas"); choose("start", "30");
  const el = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 80, height: 40 }) };
  const at = (x, y) => model.contactProfile("gas", undefined, { clientX: x, clientY: y }, el).start;
  for (const [edge, near, far] of [
    ["left", [10, 40], [90, 40]], ["right", [100, 40], [0, 40]],
    ["top", [50, 20], [50, 60]], ["bottom", [50, 60], [50, 20]],
  ]) {
    choose("fullEdge", edge);
    assert.equal(at(...near), 100); assert.equal(at(50, 40), 50); assert.equal(at(...far), 0);
  }
  choose("indicator", "percent");
  assert.equal(model.buttonProfile("gas").indicator, "percent");
  assert.equal(model.buttonProfile("brake").indicator, undefined);
  assert.equal(field("start").disabled, true);
  choose("fullEdge", "fixed");
  assert.equal(at(50, 40), 30);
});

test("slide responses shape direct touch travel independently of timed buildup and other buttons", () => {
  const { host, dom, editor, model } = boot();
  editor.mount(host);
  const control = key => dom.byId("touch-test-" + key);
  const select = (key, value) => { control(key).value = value; control(key).onchange(); };
  select("button", "brake"); select("press", "progressive"); select("start", "50"); select("direction", "down");
  for (const [curve, quarter] of [["fine", 0.0625], ["quick", 0.4375], ["smooth", 0.15625], ["linear", 0.25]]) {
    select("slideCurve", curve);
    const profile = model.buttonProfile("brake");
    assert.equal(model.level(profile, profile.travel / 4), 0.5 + quarter / 2);
    assert.equal(model.level(profile, -profile.travel / 4), 0.5 - quarter / 2);
    assert.equal(model.level(profile, 0, 0.5), 0.75);
    assert.equal(model.level(profile, profile.travel), 1);
    assert.equal(model.level(profile, -profile.travel), 0);
  }
  assert.equal(model.buttonOverrides("brake").slideCurve, undefined);
  select("button", "gas"); select("slideCurve", "fine");
  const gas = model.buttonProfile("gas");
  assert.equal(model.level(gas, model.DEAD_PX), 1);
  assert.equal(model.level(gas, model.DEAD_PX + gas.travel / 2), 0.75);
  assert.equal(model.level(gas, model.DEAD_PX + gas.travel), model.MIN);
  select("button", "left"); assert.equal(control("slideCurve").value, "linear");
  select("button", "gas"); assert.equal(control("slideCurve").value, "fine");
  host.querySelector("button").onclick(); assert.equal(control("slideCurve").value, "linear");
});

test("absolute mapping preserves relative settings, only appears on pedals and resets per button", () => {
  const { host, dom, editor, model } = boot();
  editor.mount(host);
  const field = key => dom.byId("touch-test-" + key);
  const choose = (key, value) => { field(key).value = value; field(key).onchange(); };
  assert.ok(field("sliderEdge").parentElement.parentElement.hidden);
  choose("button", "gas"); choose("press", "progressive"); choose("fullEdge", "bottom");
  choose("sliderEdge", "right");
  assert.equal(model.buttonProfile("gas").sliderEdge, "right");
  assert.equal(dom.byId("touch-test-slider-help").textContent.includes("25%, 50% and 75%"), true);
  choose("button", "brake"); assert.equal(field("sliderEdge").value, "relative");
  choose("button", "gas"); choose("sliderEdge", "relative");
  assert.equal(field("press").value, "progressive");
  assert.equal(field("fullEdge").value, "bottom");
  choose("sliderEdge", "left"); host.querySelector("button").onclick();
  assert.equal(model.buttonProfile("gas").sliderEdge, undefined);
});

test("absolute slider paints a single decorative quarter scale and restores its relative edge guide", () => {
  const { actions, model } = boot();
  const attributes = new Map(), children = [];
  const el = {
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: key => attributes.delete(key),
    appendChild: child => children.push(child),
    ownerDocument: { createElement: () => ({
      setAttribute(key, value) { this[key] = value; },
      remove() { children.splice(children.indexOf(this), 1); },
    }) },
  };
  actions.bindControl(el, "brake");
  model.setButtonProfile("brake", { sliderEdge: "left", fullEdge: "top" });
  assert.equal(attributes.get("data-touch-edge"), "left");
  assert.equal(children[0]["aria-hidden"], "true");
  assert.equal(children[0]["data-pedal-ticks"], "");
  model.setButtonProfile("brake", { sliderEdge: "bottom" });
  assert.equal(children.length, 1);
  model.setButtonProfile("brake", { feedback: false });
  assert.equal(children.length, 0);
  assert.equal(attributes.has("data-touch-edge"), false);
  model.setButtonProfile("brake", { feedback: true, sliderEdge: "relative" });
  assert.equal(attributes.get("data-touch-edge"), "top");
  assert.equal(children.length, 0);
});

test("custom camera gestures share the picker hold and cancel with the camera screen", () => {
  const dom = makeDom(), el = dom.byId("btn-cam"), handlers = new Map();
  let timer, cycles = 0;
  const context = vm.createContext({ document: dom.document, window: {},
    setTimeout(fn, delay) { timer = { fn, delay }; return 1; }, clearTimeout() { timer = null; } });
  for (const file of ["js/input/pedal-travel.js", "js/input/touch-button-actions.js", "js/camera/cam-picker.js"]) {
    vm.runInContext(fs.readFileSync(absSrc(file), "utf8"), context, { filename: absSrc(file) });
  }
  const [model, actions, picker] = vm.runInContext("[PedalTravel, TouchButtonActions, CamPicker]", context);
  el.getBoundingClientRect = () => ({ left: 0, right: 50, top: 0, bottom: 50 });
  // The action recognizer captures each pointer before the CAM button's ordinary listener.
  const register = el.addEventListener.bind(el);
  el.addEventListener = (type, fn, capture) => capture ? handlers.set(type, fn) : register(type, fn);
  const camera = picker.attach({ $: () => el, G: { state: "race" }, CAM_MODES: [{ label: "Helmet" }],
    watchReplay: () => null, HOLD_MS: 340, cycleCam: () => cycles++ });
  actions.bindControl(el, "camera");
  el.click = () => el.onclick();
  const send = (type, timeStamp) => handlers.get(type)({ type, timeStamp, pointerId: 3, pointerType: "touch",
    clientX: 25, clientY: 25, preventDefault() {}, stopImmediatePropagation() {} });
  for (const [mode, threshold] of [["quick", 340], ["double", 340], ["hold", 900], ["long", 1350]]) {
    model.setButtonProfile("camera", { activation: mode });
    send("pointerdown", 100); assert.equal(timer.delay, threshold);
    timer.fn(); send("pointerup", 100 + threshold);
    assert.equal(el.getAttribute("aria-expanded"), "true", mode);
    assert.equal(cycles, 0);
    camera.hide();
  }
  send("pointerdown", 2000); send("pointerup", 2900);
  assert.equal(cycles, 1, "the selected long-hold action still cycles on release");
  send("pointerdown", 3200); camera.hide(); send("pointerup", 4100);
  assert.equal(cycles, 1, "a hold retired by pause cannot switch camera on resume");
});
