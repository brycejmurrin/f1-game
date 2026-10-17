"use strict";
// @doc Shared offline screenshot pages: native navigation, image expansion and responsive cards, without scripts.
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g,
  (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

function imageUrl(value) {
  if (typeof value !== "string" || !value || /[\x00-\x1f\x7f]/.test(value)) return "";
  if (/^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
  try { return ["http:", "https:", "file:"].includes(new URL(value, "https://gallery.invalid/").protocol) ? value : ""; }
  catch { return ""; }
}

const styles = `
:root{color-scheme:dark;--bg:#10151d;--panel:#18212d;--line:#334156;--ink:#eaf0f7;--muted:#aabbce;--accent:#c9ef83}
*{box-sizing:border-box}html{scroll-behavior:auto}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,sans-serif;overflow-wrap:anywhere}
body>header,body>nav,body>main,body>footer{max-width:1480px;margin-inline:auto;padding:24px}body>header{padding-bottom:8px}body>nav{padding-block:12px}body>footer{color:var(--muted);font-size:13px}
h1{font-size:clamp(26px,4vw,40px);line-height:1.15;letter-spacing:-.025em;margin:8px 0 12px}h2{font-size:23px;margin:0 0 6px}h3{font-size:16px;margin:0}p{margin:8px 0 16px}a{color:var(--accent);text-underline-offset:3px}a:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:4px}
.muted,.summary{color:var(--muted)}.summary{max-width:80ch}.gallery-nav,.artifact-links{display:flex;flex-wrap:wrap;gap:8px}.gallery-nav a{padding:9px 13px;border:1px solid var(--line);border-radius:8px;text-decoration:none;color:var(--ink);background:var(--panel)}.gallery-nav a:hover{border-color:var(--accent)}
.gallery-group{margin:8px 0 40px;scroll-margin-top:16px}.gallery-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:18px}.capture{margin:0;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}.capture img{display:block;width:100%;height:240px;object-fit:contain;background:#080c12}.capture figcaption{padding:14px}.capture-title{display:block;font-weight:650}.capture-caption{color:var(--muted);font-size:13px;margin:5px 0 10px}.artifact-links{font-size:13px;gap:8px 16px}
details{margin-top:12px}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,monospace;padding:12px;background:#0d131c;border-radius:6px;max-height:420px;overflow:auto}.empty{padding:24px;border:1px dashed var(--line);border-radius:8px;color:var(--muted)}
.image-view{margin:0}.image-view>summary{list-style:none;position:relative;cursor:zoom-in}.image-view>summary::-webkit-details-marker{display:none}.image-view>summary::after{content:'Enlarge';position:absolute;right:10px;bottom:10px;background:#10151de8;color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:4px 9px;font-size:12px}.image-view[open]>summary{cursor:zoom-out}.image-view[open]>summary::after{content:'Close image';position:fixed;right:24px;top:24px;bottom:auto;z-index:52}.image-view[open]>summary img{position:fixed;inset:0;z-index:50;width:100vw;height:100vh;object-fit:contain;padding:60px 18px 24px;background:#080c12fa}
.gallery-target{position:absolute;top:0}.gallery-target:target~main>.gallery-group{display:none}.table-scroll{overflow:auto;max-width:100%;border:1px solid var(--line);border-radius:8px}table{border-collapse:collapse;width:100%}th,td{padding:10px 14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--muted);font-size:13px}td details{min-width:180px;margin:0}
@media(max-width:600px){body>header,body>nav,body>main,body>footer{padding-inline:16px}.capture img{height:auto;max-height:360px}.gallery-grid{grid-template-columns:1fr}.image-view[open]>summary img{height:100vh;max-height:none;padding:64px 8px 16px}}
`;

function screenshotCard({ title, caption = "", image, thumb, metadata, links = "", className = "", body = "" }) {
  const full = imageUrl(image), preview = imageUrl(thumb) || full;
  const picture = preview ? `<details class="image-view"><summary aria-label="Enlarge or close ${escapeHtml(title)}"><img src="${escapeHtml(full || preview)}" loading="lazy" alt="${escapeHtml(title)}"></summary></details>` : '<p class="empty">No screenshot captured.</p>';
  // Use the complete image for both sizes: expansion is native HTML, so it cannot swap src.
  return `<figure class="capture ${escapeHtml(className)}">${picture}<figcaption><span class="capture-title">${escapeHtml(title)}</span>${caption ? `<p class="capture-caption">${escapeHtml(caption)}</p>` : ""}${links ? `<div class="artifact-links">${links}</div>` : ""}${metadata ? `<details><summary>Capture details</summary><pre>${escapeHtml(typeof metadata === "string" ? metadata : JSON.stringify(metadata, null, 2))}</pre></details>` : ""}${body}</figcaption></figure>`;
}

function renderPage({ title, summary = "", body, navigation = "", targets = "", css = "", head = "", footer = "Screenshot gallery · Images stay uncropped. Select an image to enlarge it; select it again to close." }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${styles}${css}</style>${head}</head><body>${targets}<header><h1>${escapeHtml(title)}</h1>${summary ? `<p class="summary">${escapeHtml(summary)}</p>` : ""}</header>${navigation}<main>${body}</main><footer>${escapeHtml(footer)}</footer></body></html>`;
}

function renderGallery({ title, summary, groups = [], links = "", head = "" }) {
  let css = "";
  const targets = groups.map((_, i) => `<span class="gallery-target" id="gallery-${i + 1}"></span>`).join("");
  const nav = groups.map((group, i) => {
    const id = `gallery-${i + 1}`;
    css += `#${id}:target~main>#section-${i + 1}{display:block}#${id}:target~nav a[href="#${id}"]{background:var(--accent);color:var(--bg);border-color:var(--accent)}`;
    return `<a href="#${id}">${escapeHtml(group.title)} <span class="group-count">(${group.cards?.length || 0})</span></a>`;
  }).join("");
  const navigation = `<nav class="gallery-nav" aria-label="Choose a group"><a href="#all">All views</a>${nav}${links}</nav>`;
  const body = groups.map((group, i) => `<section class="gallery-group" id="section-${i + 1}"><h2>${escapeHtml(group.title)}</h2>${group.description ? `<p class="muted">${escapeHtml(group.description)}</p>` : ""}${group.links ? `<p class="artifact-links">${group.links}</p>` : ""}${group.extra || ""}<div class="gallery-grid">${group.cards?.join("\n") || '<p class="empty">No captures recorded.</p>'}</div></section>`).join("\n") || '<p class="empty">No captures recorded.</p>';
  return renderPage({ title, summary, body, navigation, targets: '<span id="all"></span>' + targets, css, head });
}

module.exports = { escapeHtml, imageUrl, styles, screenshotCard, renderPage, renderGallery };
