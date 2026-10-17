import { readCssSource } from "../helpers/css-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function openBanner({ profile = "standard", camId = "chase", now = () => 0 } = {}) {
  const shown = [];
  const announceText = {};
  Object.defineProperty(announceText, "textContent", {
    set(v) { shown.push(v); }, get() { return shown.at(-1) || ""; },
  });
  const els = {
    announceText, announceWho: { textContent: "" }, announceNum: { textContent: "" },
    announce: { className: "", hidden: true, dataset: {} }, announceLive: { textContent: "" },
  };
  let hudProfile = profile;
  const ctx = vm.createContext({
    performance: { now },
    RadioVoice: { SPEAKERS: { info: "radio", warning: "control", coach: "coach", comm: "announcer", box: "radio", race: "radio", "penalty-warn": "control", "penalty-hit": "control", practice: "coach" } },
    GameAudio: { radioLeadS: () => 0, radioSting() {} },
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/race/announce-banner.js"), "utf8"), ctx);
  const banner = vm.runInContext("AnnounceBanner", ctx).create({
    els: () => els, player: () => ({ name: "A Driver", num: 1 }), state: () => "race",
    hudProfile: () => hudProfile, camMode: () => 0, camModes: () => [{ id: camId }],
    radioVoice: () => ({ say() {} }), history: () => null,
  });
  return { banner, shown, setProfile(p) { hudProfile = p; } };
}

test("driving warnings survive camera changes while quiet views suppress optional tips", () => {
  for (const id of ["chase", "cockpit", "heli", "side", "cinematic", "low", "overhead"]) {
    const { banner, shown } = openBanner({ camId: id });
    for (const kind of ["warning", "penalty-warn", "penalty-hit", "race"]) {
      assert.equal(banner.announce("driver message", 2, kind), true, `${id} preserves ${kind}`);
      assert.equal(shown.at(-1), "driver message");
      banner.tick(10);
    }
    const before = shown.length;
    assert.equal(banner.announce("optional tip", 2, "coach"), ["chase", "cockpit"].includes(id), id);
    assert.equal(shown.length, before + (["chase", "cockpit"].includes(id) ? 1 : 0));
    const cast = openBanner({ camId: id, profile: "broadcast" });
    assert.equal(cast.banner.announce("optional tip", 2, "coach"), true, "broadcast keeps its optional tips");
    assert.equal(cast.shown.at(-1), "optional tip");
  }
});

test("any open screen hides race HUD chrome, DISPLAY keeps the live tower", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");
  // Career / select / garage / datahub are `.screen` without `.dim`; gating
  // on dim + in-race left POS/LAP/CHASE reading through those scrims.
  assert.match(css, /body:has\(\.screen:not\(\[hidden\]\)\)\s*:is\(/);
  assert.doesNotMatch(css, /body\.in-race:has\(\.screen\.dim:not\(\[hidden\]\)\)\s*:is\(/);
  assert.match(css, /\.hud-bottom/);
  assert.match(css, /\.hud-top/);
  assert.match(css, /#btn-cam/);
  assert.match(css, /\.dock/);
  assert.match(css, /body:has\(#pmsettings:not\(\[hidden\]\) #pm-panel-display:not\(\[hidden\]\)\)\s*:is\(/);
  assert.doesNotMatch(css, /body:has\(#pmsettings:not\(\[hidden\]\)\)\s*:is\(/);
});

test("garage camera stack hides under a dim overlay, not under garage itself", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/carsetup.css"), "utf8");
  assert.match(css, /body:has\(\.screen\.dim:not\(\[hidden\]\)\)\s*#cs-stack/);
  assert.match(css, /visibility:\s*hidden/);
});

test("compact pause stack tightens without changing type tokens", () => {
  const css = readCssSource("css/components.css");
  assert.match(css, /#pausemenu\s+\.sheet\[data-density="compact"\]\s+\.stack/);
  // max(36px, --tap-min), not a bare 36px: the 36 floor is the compact tighten
  // this test guards; the --tap-min arm only wins below 100% UI SIZE, where a
  // flat 36 local px painted RESUME at 14-18px (2026-08-21 sweep, pause @40).
  assert.match(css, /#pausemenu\s+\.sheet\[data-density="compact"\]\s+\.stack\s+button[^}]*min-height:\s*max\(36px,\s*var\(--tap-min\)\)/);
});

test("short phone pause (≤400px) caps the sheet and uses a 2-col tray with no holes", () => {
  const dialogs = readCssSource("css/dialogs.css");
  assert.match(dialogs, /@media\s*\(max-height:\s*400px\)[\s\S]*?#pausemenu\s*>\s*\.sheet\s*\{[^}]*max-height:\s*min\(100%,\s*calc\(100\s*\*\s*var\(--svhz\)/);
  assert.match(dialogs, /@media\s*\(max-height:\s*400px\)\s*\{[\s\S]*?#pausemenu\s+\.sheet-body\.stack\s*>\s*button:not\(\.as-tbtn\)\s*\{[^}]*min-height:\s*var\(--tap\)/);
  const overlays = fs.readFileSync(path.join(ROOT, "css/overlays.css"), "utf8");
  assert.match(overlays, /@media\s*\(max-height:\s*400px\)\s*\{[\s\S]*?#pausemenu\s+#pm-quick-doors\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/);
  assert.match(overlays, /#pausemenu\s+#pm-quick-doors\s*>\s*:last-child:nth-child\(odd\)\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
});

test("a queued INFO card older than ANN_STALE_MS is dropped at the drain; a warning never is", () => {
  let now = 0;
  const { banner, shown } = openBanner({ profile: "broadcast", now: () => now });
  banner.announce("HOLD", 5, "penalty-hit");
  shown.length = 0;
  banner.announce("UP TO P5", 2, "info");
  banner.announce("TRACK LIMITS", 2, "warning");
  now = 9000;
  banner.tick(10);
  assert.deepEqual(shown, ["TRACK LIMITS"], "the warning plays; the stale position call is dropped");
  banner.tick(10);
  assert.deepEqual(shown, ["TRACK LIMITS"], "UP TO P5 never reads out 9 s late");
  now = 0;
  const fresh = openBanner({ profile: "broadcast", now: () => now });
  fresh.banner.announce("HOLD", 5, "penalty-hit");
  fresh.banner.announce("TYRES AT 50%", 2, "info");
  fresh.shown.length = 0;
  now = 3000;
  fresh.banner.tick(10);
  assert.deepEqual(fresh.shown, ["TYRES AT 50%"], "a fresh info card still plays");
});

test("a full announce queue sheds comm and coach so a box call can queue", () => {
  const { banner, shown } = openBanner({ profile: "broadcast" });
  banner.announce("HOLD", 5, "comm");
  assert.equal(banner.announce("COACH TIP", 2, "coach"), true);
  assert.equal(banner.announce("TV LINE", 2, "comm"), true);
  assert.equal(banner.announce("TV TWO", 2, "comm"), false, "queue capped at two equal-priority lines");
  assert.equal(banner.announce("BOX BOX BOX — H", 2.2, "box"), true, "box queues by shedding the weakest waiting card");
  banner.tick(4);
  assert.ok(shown.includes("BOX BOX BOX — H"), "box is waiting behind the floor");
});

test("a give-back warning is not starved behind the caution's own radio card: it takes over at the floor", () => {
  const { banner, shown } = openBanner();
  banner.announce("SAFETY CAR. NO OVERTAKING", 3.3, "warning");
  banner.tick(0.5);
  banner.announce("GIVE THE POSITION BACK", 2.5, "penalty-warn");
  assert.deepEqual(shown, ["SAFETY CAR. NO OVERTAKING"], "the floor still holds: the SC card is not blinked away");
  let t = 0.5;
  while (shown.length < 2 && t < 6) { banner.tick(0.1); t += 0.1; }
  assert.equal(shown[1], "GIVE THE POSITION BACK");
  assert.ok(t <= 3.05, `the warning shows when the SC card's 3 s floor ends, not after its whole life (${t.toFixed(1)} s)`);
  const eq = openBanner();
  eq.banner.announce("TRACK LIMITS 1/4", 3.3, "penalty-warn");
  eq.banner.announce("POSITION RETURNED — NO PENALTY", 1.5, "penalty-warn");
  t = 0;
  while (eq.shown.length < 2 && t < 6) { eq.banner.tick(0.1); t += 0.1; }
  assert.ok(t > 3.7, `equal priority waits out the whole card (${t.toFixed(1)} s)`);
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const sc = game.match(/function scPassCall\(ev\) \{[\s\S]*?\n\}/)[0];
  assert.match(sc, /"GIVE THE POSITION BACK"[^;]*"penalty-warn", \(\) => scWatch\.info\(\)\.owed > 0\)/);
  assert.match(sc, /ev\.type === "cleared"\) \{ announce\("POSITION RETURNED — NO PENALTY", [\d.]+, "penalty-warn"\); return; \}/);
});

test("losing focus while visible pauses a solo race; an iOS audio interruption does too; neither in a friend race", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/ui/platform-session.js"), "utf8");
  const blur = game.match(/window\.addEventListener\("blur", \(\) => \{[\s\S]*?\n\}\);/)[0];
  assert.match(blur, /document\.hidden \|\| document\.hasFocus\(\) \|\| navigator\.webdriver \|\| G\.netPlay\.active\(\)/, "settled, visible-only, never under automation or in MP");
  assert.match(blur, /if \(G.state === "race" \|\| G.state === "count"\) setPaused\(true, "blur"\);/);
  assert.match(game, /GameAudio\.onInterrupted\(\(\) => \{\s*if \(\(G.state === "race" \|\| G.state === "count"\) && !G\.netPlay\.active\(\)\) setPaused\(true, "audio-interrupted"\);/);
  const eng = fs.readFileSync(path.join(ROOT, "js/audio/engine.js"), "utf8");
  assert.match(eng, /ctx\.state === "interrupted" && _onInterrupted/);
});

test("a context lost within 3 s of becoming visible is iOS's late-reported BACKGROUND loss on every backend", () => {
  for (const f of ["js/render/glx/glx.js", "js/render/three/tlx.js", "js/render/webgpu/wgx.js"]) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    // pageshow fires on the FIRST load too; only a bfcache restore (persisted)
    // is a return. Unconditional, a real crash in the first 3 s after boot
    // was read as a background loss: uncounted reload, nothing latched.
    assert.match(src, /addEventListener\("pageshow", (?:\w+ = )?function \(e\) \{ if \(e && e\.persisted\) _shownAt = _nowMs\(\); \}\)/, f + " tracks when the page came back from the bfcache");
    assert.doesNotMatch(src, /addEventListener\("pageshow", function \(\) \{ _shownAt/, f + " must not treat the initial load as a return");
    assert.match(src, /_nowMs\(\) - _shownAt < 3000/, f + " treats a loss inside that window as the background loss");
  }
});
