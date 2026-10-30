import { readCssSource } from "../helpers/css-source.mjs";
import { cssRules, decl, ruleFor, rulesFor } from "../helpers/css-rules.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

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
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/race/announce-banner.js"), "utf8"), ctx, { filename: absSrc("js/race/announce-banner.js") });
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
  assert.match(css, /body:has\(> \.screen:not\(\[hidden\]\)\)\s*:is\(/);
  assert.doesNotMatch(css, /body\.in-race:has\(>? ?\.screen\.dim:not\(\[hidden\]\)\)\s*:is\(/);
  assert.match(css, /\.hud-bottom/);
  assert.match(css, /\.hud-top/);
  assert.match(css, /#btn-cam/);
  assert.match(css, /\.dock/);
  assert.match(css, /body:has\(> #pmsettings:not\(\[hidden\]\) > :where\(#pmsettings-inner\) > :where\(#pm-settings-body\) > :where\(\.pm-groups\) > #pm-panel-display:not\(\[hidden\]\)\)\s*:is\(/);
  assert.doesNotMatch(css, /body:has\(>? ?#pmsettings:not\(\[hidden\]\)\)\s*:is\(/);
});

test("garage camera stack hides under a dim overlay, not under garage itself", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/carsetup.css"), "utf8");
  assert.match(css, /body:has\(> \.screen\.dim:not\(\[hidden\]\)\)\s*#cs-stack/);
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

test("short landscape pause: capped sheet, doors left with QUIT on-card, the tray right and scrolling alone", () => {
  const dialogs = cssRules(readCssSource("css/dialogs.css"));
  const at400 = { context: /^@media \(max-height: 400px\)$/ };
  assert.equal(decl(dialogs, "#pausemenu > .sheet", "max-height", at400), "min(100%, calc(100 * var(--svhz) - 24px))");
  assert.equal(decl(dialogs, /#pausemenu \.sheet-body\.stack > button:not\(\.as-tbtn\)/, "min-height", at400),
    "max(var(--tap), var(--tap-paint), calc(44px / var(--ui-scale)))", "every door holds the #3274 painted floor");
  const overlays = cssRules(readCssSource("css/overlays.css"));
  assert.equal(rulesFor(overlays, /#pm-quick-doors/, at400).length, 0, "the ≤400px 2-col tray rule is gone (the tray is its own pane)");
  const exp = cssRules(fs.readFileSync(path.join(ROOT, "css/experience.css"), "utf8"));
  const short = { context: /^@media \(orientation: landscape\) and \(max-height: 500px\)$/ };
  const G = ":root:not([data-pause-layout]):not([data-look-pause-w]) #pausemenu";
  assert.equal(decl(exp, G, "--sheet-w", short), "780px", "the default card uses the phone's width");
  const areas = decl(exp, G + " .sheet > .sheet-body", "grid-template-areas", short);
  const rows = [...areas.matchAll(/"([^"]+)"/g)].map((m) => m[1].split(" "));
  assert.ok(rows.every((r) => r[2] === "tray"), "the tray spans every row of the right column");
  assert.deepEqual(rows.map((r) => r.slice(0, 2).join(" ")), ["ctx ctx", "resume resume", "restart settings", "standings skip", "quit quit"]);
  for (const [id, area] of [["#pm-race-context", "ctx"], ["#pm-resume", "resume"], ["#pm-restart", "restart"], ["#pm-settings", "settings"], ["#pm-standings", "standings"], ["#pm-skip-results", "skip"], ["#pm-quit", "quit"], ["#pm-quick-doors", "tray"]]) {
    assert.equal(decl(exp, `${G} ${id}`, "grid-area", short), area, id);
  }
  const tray = ruleFor(exp, `${G} #pm-quick-doors`, "grid-area", short).decls;
  assert.equal(tray.get("--tray-cols"), "3");
  assert.equal(tray.get("contain"), "size", "the tray does not size the rows: the doors decide the card's height");
  assert.equal(tray.get("overflow-y"), "auto");
  assert.equal(tray.get("overscroll-behavior"), "contain");
  assert.equal(tray.get("align-self"), "stretch");
  // ONE tray tile floor, painted 52 on touch.
  const floors = exp.filter((r) => /#pm-quick-doors (button|> details > summary)/.test(r.selector) && r.decls.has("min-height") && r.context.some((c) => /max-height/.test(c)));
  assert.deepEqual(floors.map((r) => r.decls.get("min-height")), ["max(34px, var(--tap-paint))"]);
  // The PAUSED head is visually hidden, not removed: aria-labelledby="dlg-pause" still names the dialog.
  const head = ruleFor(exp, `${G} .sheet-head`, "clip-path", short).decls;
  assert.equal(head.get("clip-path"), "inset(50%)");
  assert.equal(head.get("height"), "0");
  assert.ok(!head.has("display") && !head.has("visibility"), "display/visibility would drop the label from the a11y tree");
  assert.equal(decl(exp, `${G} #pm-race-context > span`, "display", short), "block", "the race line becomes the header");
  // The base tray stays a wrapping flex row whose tiles grow; an open disclosure takes the full width.
  assert.equal(decl(exp, "#pm-quick-doors", "display"), "flex");
  assert.equal(decl(exp, "#pm-quick-doors", "flex-wrap"), "wrap");
  assert.equal(decl(exp, "#pm-quick-doors > details[open]", "flex-basis"), "100%");
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
