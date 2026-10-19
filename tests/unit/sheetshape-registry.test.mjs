/* sheetshape-registry.test.mjs — the shape registry must forget detached nodes.
 *
 * SheetShape.observe() put every managed element into a module-level `seen`
 * Set AND into a module-level ResizeObserver, and had no removal path for
 * either. Both hold strong references, so anything ever classified was retained
 * for the life of the page.
 *
 * Static markup never noticed. `.fit-managed` is not all static: js/data/
 * telemetry.js builds a FRESH .dh-tpopup-card for every lap-compare popup, and
 * closing one only removes it from the DOM. That card owns the trace canvases
 * (chart, delta, circuit map) sized layout x min(3, zoom * dpr) — roughly
 * 2-3.6 MB at dpr 2, up to ~6 MB at ratio 3 — so a Data Hub session leaked a
 * few MB per open, monotonically. telemetry.js could not have prevented it: it
 * disconnects its own observer and nulls its view in stopTelAnim(). The
 * retention was entirely on the SheetShape side.
 *
 * These are BEHAVIOURAL, not source-text: the module runs in a VM on
 * tests/helpers/mini-dom.mjs and the assertions are about what it does to a
 * node that leaves the tree — a regex over the file would pass on a prune that
 * never runs.
 *
 * Run: node --test tests/unit/sheetshape-registry.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootSheetShape } from "../helpers/sheetshape-boot.mjs";


/** Boot sheetshape.js in a VM, returning the module plus the observer spies. */
function boot() {
  const observed = [], unobserved = [];
  const mutationCbs = [];

  class RO {
    constructor(cb) { this.cb = cb; }
    observe(el) { observed.push(el); }
    unobserve(el) { unobserved.push(el); }
    disconnect() {}
  }
  class MO {
    constructor(cb) { mutationCbs.push(cb); }
    observe() {}
    disconnect() {}
  }

  const { dom, sheet, sb } = bootSheetShape(() => ({ ResizeObserver: RO, MutationObserver: MO }));
  return { dom, sheet, observed, unobserved, mutationCbs, sb };
}

/** A managed card with a real size, attached to the document like a popup. */
function makeCard(dom, cls = "fit-managed") {
  const card = dom.document.createElement("div");
  card.className = cls;
  for (const c of cls.split(" ")) card.classList.add(c);
  card._rect = { left: 0, top: 0, right: 600, bottom: 220, width: 600, height: 220 };
  dom.document.body.appendChild(card);
  return card;
}

test("a detached managed element is dropped from the registry and unobserved", () => {
  const { dom, sheet, unobserved } = boot();
  const card = makeCard(dom);
  sheet.observe(card);

  // While it is in the tree, reclassify keeps measuring it.
  let measured = 0;
  const rect = card.getBoundingClientRect;
  card.getBoundingClientRect = () => { measured++; return rect(); };
  sheet.reclassify();
  assert.ok(measured >= 1, "an attached managed element must still be classified");

  // The popup closes: removed from the DOM, but the registry held it forever.
  card.remove();
  assert.equal(card.isConnected, false, "the card really did leave the tree");

  const before = measured;
  sheet.reclassify();
  assert.equal(measured, before,
    "a detached element must not be measured again — it is retained if it is");
  assert.ok(unobserved.includes(card),
    "and it must be unobserved: a ResizeObserver holds its targets strongly, " +
    "so dropping it from the Set alone still leaks the node and its canvases");

  // Idempotent: a second sweep must not throw or re-unobserve.
  sheet.reclassify();
});

test("closing a popup prunes it without waiting for a resize", () => {
  const { dom, sheet, unobserved, mutationCbs } = boot();
  assert.ok(mutationCbs.length >= 1, "sheetshape must watch the document for added/removed nodes");
  // sheetshape registers more than one MutationObserver (watchScale watches an
  // attribute on documentElement), so drive them all rather than guessing which
  // index is the childList one — the test is about the outcome, not the wiring.
  const fire = (recs) => mutationCbs.forEach((cb) => cb(recs));

  const card = makeCard(dom);
  sheet.observe(card);
  card.remove();

  // The DOM observer sees the removal; nothing else has run.
  fire([{ addedNodes: [], removedNodes: [card] }]);
  assert.ok(unobserved.includes(card),
    "a removed managed node must be pruned on the mutation, not held until the next resize");
});

test("the prune is gated: unrelated DOM churn does not sweep the whole registry", () => {
  const { dom, sheet, unobserved, mutationCbs } = boot();
  const fire = (recs) => mutationCbs.forEach((cb) => cb(recs));

  // A managed card that has already left the tree WITHOUT this observer being
  // driven — the state an ungated prune would clean up on any removal at all.
  const stale = makeCard(dom);
  sheet.observe(stale);
  stale.remove();

  // Now something unrelated leaves. This observer sees EVERY removal on the
  // page, and pruneSeen walks the whole set, so an ungated call here means
  // ordinary HUD churn pays a full sweep. The gate is the cost control: the
  // stale entry waits for a managed removal or the next reclassify.
  const noise = dom.document.createElement("div");
  dom.document.body.appendChild(noise);
  noise.remove();
  fire([{ addedNodes: [], removedNodes: [noise] }]);
  assert.equal(unobserved.length, 0,
    "a removal of nothing managed must not trigger a sweep of the registry");

  // A managed removal does, and it collects the straggler too.
  const card = makeCard(dom);
  sheet.observe(card);
  card.remove();
  fire([{ addedNodes: [], removedNodes: [card] }]);
  assert.ok(unobserved.includes(card) && unobserved.includes(stale),
    "and when it does run it collects everything detached, not just the trigger");
});
