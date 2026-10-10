// MANIFEST SHORTCUTS REACH THE TITLE DOORS. manifest.json `shortcuts` open `./?go=<door>`; js/ui/deep-link.js maps the four
// allowed doors to title buttons, clicks one once the bare title is live, and strips the param. Anything else is ignored.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../../js/ui/deep-link.js", import.meta.url), "utf8");
const MANIFEST = JSON.parse(readFileSync(new URL("../../manifest.json", import.meta.url), "utf8"));

function boot({ search = "", overlayHidden = false, inRace = false, top = null, missing = [] } = {}) {
  const clicks = [], replaced = [], logs = [];
  const timers = [];
  const btn = (id) => ({ id, hidden: false, disabled: false, click() { clicks.push(id); } });
  const ctx = vm.createContext({
    location: { search, pathname: "/f1-game/", hash: "#x" },
    history: { replaceState: (_s, _t, url) => replaced.push(url) },
    URLSearchParams,
    UiLayers: { inRace: () => inRace, top: () => top },
    Log: { info: (_c, m) => logs.push(m) },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
  });
  vm.runInContext(SRC + ";globalThis.DeepLink = DeepLink;", ctx, { filename: "js/ui/deep-link.js" });
  const hub = { id: "dh-tab-schedule", click() { clicks.push("dh-tab-schedule"); } };
  const state = { hubUp: false };
  const G = { els: { overlay: { hidden: overlayHidden } },
    $: (id) => (id === "dh-tab-schedule" ? (state.hubUp ? hub : null) : missing.includes(id) ? null : btn(id)) };
  const out = ctx.DeepLink.create(G);
  return { out, clicks, replaced, logs, timers, state, DeepLink: ctx.DeepLink };
}

test("the four doors map to title buttons; unknown, inherited and empty values parse to nothing", () => {
  const { DeepLink } = boot();
  for (const [go, id] of [["race", "mb-race"], ["daily", "mb-daily"], ["nextgp", "mb-data"], ["garage", "mb-garage"]]) {
    assert.equal(DeepLink.parse("?go=" + go), go);
    assert.equal(DeepLink.DOORS[go], id);
  }
  for (const bad of ["", "?go=", "?go=constructor", "?go=__proto__", "?go=javascript:1", "?go=RACE", "?x=race"]) {
    assert.equal(DeepLink.parse(bad), null, bad);
  }
});

test("on a live title the door button is clicked once and the param is stripped (other params and the hash survive)", () => {
  const r = boot({ search: "?go=race&seed=7" });
  assert.deepEqual(r.clicks, ["mb-race"]);
  assert.deepEqual(r.replaced, ["/f1-game/?seed=7#x"]);
});

test("a link with no go param does nothing and leaves the URL alone", () => {
  const r = boot({ search: "?seed=7" });
  assert.deepEqual(r.clicks, []);
  assert.deepEqual(r.replaced, []);
});

test("mid-race, or with a layer over the title, the door waits instead of firing", () => {
  assert.deepEqual(boot({ search: "?go=garage", inRace: true }).clicks, []);
  assert.deepEqual(boot({ search: "?go=garage", overlayHidden: true }).clicks, []);
  const layered = boot({ search: "?go=garage", top: { id: "career-hub" } });
  assert.deepEqual(layered.clicks, []);
  assert.equal(layered.timers.length, 1, "one retry is queued");
});

test("a missing door button is dropped with a log line, never a throw", () => {
  const r = boot({ search: "?go=daily", missing: ["mb-daily"] });
  assert.deepEqual(r.clicks, []);
  assert.ok(r.logs.some((m) => /door unavailable/.test(m)), r.logs.join("|"));
});

test("NEXT GP opens the hub, then selects the schedule tab once it exists", () => {
  const r = boot({ search: "?go=nextgp" });
  assert.deepEqual(r.clicks, ["mb-data"]);
  assert.equal(r.timers.length, 1, "waiting for the hub bundle");
  r.state.hubUp = true;
  r.timers.shift()();
  assert.deepEqual(r.clicks, ["mb-data", "dh-tab-schedule"]);
});

test("every manifest shortcut is in scope, has an icon on disk, and ?go= urls are exactly the consumer's allow-list", () => {
  const goUrls = [];
  assert.ok(MANIFEST.shortcuts.length >= 4);
  for (const s of MANIFEST.shortcuts) {
    const u = new URL(s.url, "https://x.test/f1-game/");
    assert.ok(u.pathname.startsWith("/f1-game/"), "in scope: " + s.url);
    if (u.searchParams.has("go")) goUrls.push(u.searchParams.get("go"));
    for (const i of s.icons) readFileSync(new URL("../../" + i.src, import.meta.url));
  }
  const ctx = vm.createContext({ location: { search: "" }, URLSearchParams });
  vm.runInContext(SRC + ";globalThis.D = DeepLink;", ctx);
  assert.deepEqual([...goUrls].sort(), Object.keys(ctx.D.DOORS).sort());
  assert.ok(MANIFEST.shortcuts.slice(0, 4).some((s) => /controller/.test(s.url)), "phone controller stays in the four Android shows");
});
