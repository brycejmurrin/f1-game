"use strict";
/**
 * Meeting picker labels must stay unique when OpenF1 reuses meeting_name
 * (two Pre-Season Testing rows, two Bahrain GPs). Runs hub.js's own
 * meetingPickerOptions, extracted from the source and evaluated.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HUB = fs.readFileSync(path.join(ROOT, "js/data/hub.js"), "utf8");

// THE REAL FUNCTION: hub.js's nested meetingPickerOptions, cut out of the
// source by its own braces and evaluated (it is pure: reads only its argument),
// so a change to the shipped body changes what these tests run.
function realMeetingPickerOptions() {
  const head = "function meetingPickerOptions(";
  const at = HUB.indexOf(head);
  assert.ok(at >= 0, "hub.js hosts meetingPickerOptions");
  let depth = 0, end = -1;
  for (let i = HUB.indexOf("{", at); i < HUB.length; i++) {
    if (HUB[i] === "{") depth++;
    else if (HUB[i] === "}" && --depth === 0) { end = i + 1; break; }
  }
  assert.ok(end > at, "meetingPickerOptions has a closed body");
  return vm.runInNewContext("(" + HUB.slice(at, end) + ")", { Object, String }, { filename: absSrc("js/data/hub.js") });
}
const meetingPickerOptions = realMeetingPickerOptions();

test("the hub panel drops native titles on scroll", () => {
  assert.match(HUB, /contentEl\.addEventListener\("scroll"/);
  assert.match(HUB, /querySelectorAll\("\[title\]"\)/);
});

test("hub.js still hosts meetingPickerOptions with circuit + date disambiguation", () => {
  assert.match(HUB, /function meetingPickerOptions\s*\(/);
  assert.match(HUB, /m\.circuit && label\.indexOf\(m\.circuit\) < 0/);
  assert.match(HUB, /counts\[label\] > 1 && m\.dateStart/);
  assert.match(HUB, /slice\(0,\s*10\)/);
  assert.match(HUB, /setSelectOptions\(gpSel,\s*meetingPickerOptions\(ms\)/);
});

test("duplicate meeting names get a date; unique names stay short", () => {
  const opts = meetingPickerOptions([
    { meetingKey: 1304, name: "Pre-Season Testing", circuit: "Bahrain", dateStart: "2026-02-01T10:00:00Z" },
    { meetingKey: 1305, name: "Pre-Season Testing", circuit: "Bahrain", dateStart: "2026-02-08T10:00:00Z" },
    { meetingKey: 1279, name: "Australian Grand Prix", circuit: "Melbourne", dateStart: "2026-03-08T04:00:00Z" },
    { meetingKey: 1282, name: "Bahrain Grand Prix", circuit: "Bahrain", dateStart: "2026-02-27T10:00:00Z" },
    { meetingKey: 1308, name: "Bahrain Grand Prix", circuit: "Sakhir", dateStart: "2026-04-12T10:00:00Z" },
  ]);
  const labels = opts.map((o) => o.label);
  assert.equal(new Set(labels).size, labels.length, "every option label is unique: " + labels.join(" | "));
  assert.ok(labels[0].includes("2026-02-01"), "same name+circuit gets date: " + labels[0]);
  assert.ok(labels[1].includes("2026-02-08"), labels[1]);
  assert.equal(labels[2], "Australian Grand Prix · Melbourne");
  assert.ok(labels[3].includes("Bahrain") && labels[4].includes("Sakhir"));
});

test("data hub tabs can shrink to scroll and wrap when height allows", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/data.css"), "utf8");
  // Anchored to the BASE rule (line start): the compact landscape strip is a nowrap
  // scroller by design (UI scaling contract gap 15, data-hub-layout.test.mjs).
  assert.match(css, /^\.dh-tabs\s*\{[^}]*min-width:\s*0/m, "tab strip shrinks inside the overflow-hidden card");
  assert.match(css, /^\.dh-tabs\s*\{[^}]*flex-wrap:\s*wrap/m, "tabs wrap so EXPORT stays a destination");
  assert.doesNotMatch(css, /^\.dh-tabs\s*\{[^}]*flex-wrap:\s*nowrap/m, "a nowrap strip clips EXPORT on the 760px card");
  assert.match(css, /\.dh-pick-fields\s*\{[^}]*flex-direction:\s*column/, "GP + session stack so the meeting label is not clipped");
});
