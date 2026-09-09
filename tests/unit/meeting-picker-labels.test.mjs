"use strict";
/**
 * Meeting picker labels must stay unique when OpenF1 reuses meeting_name
 * (two Pre-Season Testing rows, two Bahrain GPs). Mirrors hub.js
 * meetingPickerOptions — the source scan below fails if hub drifts.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HUB = fs.readFileSync(path.join(ROOT, "js/data/hub.js"), "utf8");

function meetingPickerOptions(ms) {
  const base = ms.map(function (m) {
    let label = m.name || m.circuit || "Round";
    if (m.circuit && label.indexOf(m.circuit) < 0) label += " · " + m.circuit;
    return label;
  });
  const counts = Object.create(null);
  for (let i = 0; i < base.length; i++) counts[base[i]] = (counts[base[i]] || 0) + 1;
  return ms.map(function (m, i) {
    let label = base[i];
    if (counts[label] > 1 && m.dateStart) {
      label += " · " + String(m.dateStart).slice(0, 10);
    }
    return { value: m.meetingKey, label: label };
  });
}

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
