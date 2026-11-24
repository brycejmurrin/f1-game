import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";

const registry = "js/ui/screen-regions.js";

function resultsRoute(layerId) {
  const dom = makeDom(), doc = dom.document, opened = [];
  const results = dom.byId("results");
  results.hidden = true;
  results.getClientRects = () => [{}];
  const observers = new Map();
  doc.getElementById = id => doc.querySelector("#" + id);
  const window = {
    UiLayers: { inRace: () => true, anyOpen: () => !!layerId, top: () => ({ id: layerId }) },
    ScreenArranger: { open(id) { opened.push(id); return true; } }
  };
  const global = { window, document: doc, URLSearchParams, location: { search: "?arrange=results" },
    queueMicrotask: fn => fn(), requestAnimationFrame: fn => fn(),
    MutationObserver: class {
      constructor(run) { this.run = run; }
      observe(target) { observers.set(target, this.run); }
    }
  };
  vm.runInNewContext(fs.readFileSync(absSrc(registry), "utf8"), global, { filename: absSrc(registry) });
  return { doc, opened, regions: window.ScreenRegions, finish() {
    results.hidden = false;
    observers.get(results)([{ target: results }]);
  } };
}

test("pausing on track and resuming Pause with Escape preserve the armed Results editor", () => {
  for (const layerId of ["", "pausemenu", "select"]) {
    const route = resultsRoute(layerId);
    route.doc.dispatchEvent({type: "keydown", key: "Escape"});
    route.finish();
    assert.deepEqual(route.opened, layerId === "select" ? [] : ["results"], layerId);
  }
});

test("Resume button preserves the armed Results editor", () => {
  const route = resultsRoute("pausemenu");
  const pause = route.doc.createElement("dialog");
  pause.id = "pausemenu";
  route.doc.body.appendChild(pause);
  pause.setAttribute("data-esc-close", "pm-resume");
  pause.dataset.escClose = "pm-resume";
  const button = route.doc.createElement("button");
  button.id = "pm-resume";
  pause.appendChild(button);
  route.doc.dispatchEvent({ type: "click", target: button });
  route.finish();
  assert.deepEqual(route.opened, ["results"]);
});

test("Race Settings registers the AI pace row and both step controls plus its value", () => {
  const {regions} = resultsRoute("");
  for (const key of ["aipace", "aipace-prev", "aipace-sel", "aipace-next"]) {
    assert.equal(regions["race-settings"].regions[key].selector, "#rs-" + key);
  }
});

test("the flyby card opens its arranger only during the Flyby editor preview", () => {
  const dom = makeDom(), doc = dom.document, opened = [], observers = new Map();
  const loading = dom.byId("loading");
  loading.hidden = true;
  loading.getClientRects = () => [{}];
  doc.getElementById = id => doc.querySelector("#" + id);
  const window = { ScreenArranger: { open(id) { opened.push(id); return true; } } };
  vm.runInNewContext(fs.readFileSync(absSrc(registry), "utf8"), {
    window, document: doc, URLSearchParams, location: { search: "?arrange=flyby-card" },
    queueMicrotask: fn => fn(), requestAnimationFrame: fn => fn(),
    MutationObserver: class {
      constructor(run) { this.run = run; }
      observe(target) { observers.set(target, this.run); }
    },
  }, { filename: absSrc(registry) });
  loading.hidden = false;
  for (const phase of ["build", "run", "hold"]) {
    loading.dataset.phase = phase;
    observers.get(loading)([{ target: loading }]);
    assert.deepEqual(opened, phase === "hold" ? ["flyby-card"] : []);
  }
  const { "track-detail": detail, "telemetry-detail": telemetry } = window.ScreenRegions;
  assert.equal(detail.regions.mapZoom.selector, "[data-map-zoom-controls]");
  assert.equal(telemetry.regions.mapZoom.selector, "[data-map-zoom-controls]");
});
