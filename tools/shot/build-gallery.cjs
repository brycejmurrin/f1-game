"use strict";
// build-gallery.cjs — survey HTML where two cells that share a name stay two entries.
// @doc Survey gallery entries stay distinct when shot names collide, including the image each card points at.
// @skill survey-track
const fs = require("node:fs");
const path = require("node:path");
const { screenshotCard, renderGallery, escapeHtml } = require("../lib/screenshot-gallery.cjs");

/** One gallery row per shot. A repeated name used to overwrite one image and one card (#1983). */
function galleryEntries(shots) {
  const seen = new Map();
  const entries = (shots || []).map((shot, index) => {
    const name = String(shot && shot.name ? shot.name : `cell-${index + 1}`);
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    const image = shot && (shot.png || shot.file) ? String(shot.png || shot.file) : `${name}.png`;
    return {
      name,
      cellId: `${name}#${index}`,
      index,
      occurrence: n,
      frac: shot && shot.frac,
      cam: shot && shot.cam,
      tod: shot && shot.tod,
      weather: shot && shot.weather,
      image,
    };
  });
  const used = new Map();
  for (const entry of entries) {
    const base = path.basename(entry.image.replace(/\\/g, "/"));
    const count = (used.get(base) || 0) + 1;
    used.set(base, count);
    if (count > 1) {
      const ext = path.extname(base);
      const stem = path.basename(base, ext);
      entry.image = `${stem}--${entry.index}${ext || ".png"}`;
    } else {
      entry.image = base;
    }
  }
  return entries;
}

function buildSurveyGallery(outDir, meta = {}) {
  const entries = galleryEntries(meta.shots || []);
  const track = meta.track || "Track";
  const cards = entries.map((entry) => screenshotCard({
    title: entry.occurrence > 1 ? `${entry.name} (${entry.occurrence})` : entry.name,
    caption: [track, entry.frac != null ? `lap ${entry.frac}` : "", entry.cam, entry.tod, entry.weather, entry.cellId].filter(Boolean).join(" · "),
    image: entry.image,
    metadata: entry,
  }));
  const html = renderGallery({
    title: `${track} — ${meta.label || "survey"}`,
    summary: `${entries.length} captures · ${meta.preset || "custom"}`,
    groups: [{ title: track, cards }],
  });
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, "index.html");
  fs.writeFileSync(file, html);
  return { file, entries, html };
}

module.exports = { galleryEntries, buildSurveyGallery, escapeHtml };
