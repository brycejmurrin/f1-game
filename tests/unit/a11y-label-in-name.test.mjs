// WCAG 2.5.3 Label in Name: a control with visible text and an aria-label must
// have an accessible name that CONTAINS that text, or a voice-control user who
// says what they see ("click none") cannot target it. 14 controls broke this
// (#btn-ot, #mb-phonepad, the twelve #cz-*-none); this scans every button in
// the committed shell so a new one cannot.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
// Entities (&#9650; arrows, &rsaquo;) are symbols with no spoken text of their own; "&amp;" is the one word-bearing case.
const norm = (s) => s.toLowerCase().replace(/&amp;/g, " and ").replace(/&#?\w+;/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => {
  const attrs = m[1];
  const label = (attrs.match(/\baria-label="([^"]*)"/) || [])[1];
  const id = (attrs.match(/\bid="([^"]*)"/) || [])[1] || "(no id)";
  const visible = m[2].replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ");
  return { id, label, visible: norm(visible) };
}).filter((b) => b.label && b.visible && !/aria-hidden/.test(b.id));

test("the scan finds the shell's labelled text buttons", () => {
  assert.ok(buttons.length > 20, `only ${buttons.length} labelled text buttons found`);
  for (const id of ["btn-ot", "mb-phonepad", "cz-stripe-none", "cz-halo-none"]) assert.ok(buttons.some((b) => b.id === id), `${id} not scanned`);
});

test("every button's accessible name contains its visible text (Label in Name)", () => {
  const bad = buttons.filter((b) => !norm(b.label).includes(b.visible)).map((b) => `#${b.id}: "${b.visible}" not in "${b.label}"`);
  assert.deepEqual(bad, []);
});

test("the pit tyre-choice steppers read as tyre choices, not 'next next tyres'", () => {
  assert.doesNotMatch(html, /aria-label="(Previous|Next) next tyres"/);
  assert.match(html, /id="pm-pit-choice-prev"[^>]*aria-label="Previous tyre choice"/);
  assert.match(html, /id="pm-pit-choice-next"[^>]*aria-label="Next tyre choice"/);
});
