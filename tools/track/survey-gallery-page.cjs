"use strict";
// @doc Offline circuit gallery: pre-rendered captures, native circuit navigation and recipe downloads.
const { escapeHtml: esc, screenshotCard, renderGallery } = require("../lib/screenshot-gallery.cjs");

function planLink(shots, label) {
  const names = new Set();
  const jobs = shots.filter((s) => s.job).map((s, i) => {
    const base = String(s.job.name || `capture-${i + 1}`).replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 72) || "capture";
    let name = base, suffix = 1;
    while (names.has(name)) name = `${base}-${++suffix}`;
    names.add(name);
    return { ...s.job, name };
  });
  const links = [];
  for (let offset = 0; offset < jobs.length; offset += 32) {
    const part = offset / 32 + 1;
    const href = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ preset: "custom", label: "gallery", shots: jobs.slice(offset, offset + 32) }, null, 2));
    const number = jobs.length > 32 ? ` ${part} of ${Math.ceil(jobs.length / 32)}` : "";
    links.push(`<a href="${esc(href)}" download="capture-plan-${part}.json">${esc(label + number)}</a>`);
  }
  return links.join(" ");
}

function buildHtml(manifest) {
  const circuits = new Map();
  for (const shot of manifest.shots || []) {
    const name = shot.circuit || "Unlabelled circuit";
    if (!circuits.has(name)) circuits.set(name, []);
    circuits.get(name).push(shot);
  }
  const groups = [...circuits].map(([title, shots]) => ({
    title, description: `${shots.length} captures`, links: planLink(shots, "Download circuit capture plan"),
    cards: shots.map((s) => screenshotCard({
      title: [s.location, s.angle || s.sector, s.fraction != null ? `lap ${Math.round(s.fraction * 100)}%` : ""].filter(Boolean).join(" · ") || title,
      caption: [s.tod, s.condition || s.weather, s.branch].filter(Boolean).join(" · "),
      image: s.web || s.thumb,
      metadata: { input: s.input, branch: s.branch, fraction: s.fraction, renderer: s.renderer, job: s.job, timings: s.timings, sourceIdentity: s.sourceIdentity },
      links: planLink([s], "Download capture recipe"),
    })),
  }));
  return renderGallery({ title: "Apex circuit gallery", summary: `${manifest.shots?.length || 0} captures across ${groups.length} circuits. Choose a circuit to browse its views.`, groups });
}
module.exports = { buildHtml };
