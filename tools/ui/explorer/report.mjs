// @doc Offline UI explorer HTML evidence report with filters, linked state graph and safe local artifacts.
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

const MODES = {
  missions: 'Player missions', atlas: 'UI atlas', transitions: 'Transition filmstrips',
  responsive: 'Phone stress tests', faults: 'Failure recovery', accessibility: 'Accessibility',
  minimize: 'Short reproductions', scene: 'Scene investigation'
};
const STATUSES = new Set(['passed', 'failed', 'not-run', 'partial']);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const json = value => JSON.stringify(value ?? null, null, 2);
const inlineJSON = value => json(value).replace(/[<>&\u2028\u2029]/g, character =>
  `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
const statusOf = value => STATUSES.has(value) ? value : 'not-run';

// Artifacts are local siblings of this report, never remote URLs or parent files.
function artifactPath(value) {
  if (typeof value !== 'string' || !value) return null;
  let decoded = value;
  for (let attempt = 0; attempt < 5; attempt++) {
    let next;
    try { next = decodeURIComponent(decoded); } catch { return null; }
    if (next === decoded) break;
    decoded = next;
  }
  if (/[%\\\x00-\x1f\x7f:?#]/.test(decoded) || decoded.startsWith('/')) return null;
  const segments = decoded.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return null;
  return segments.map(segment => encodeURIComponent(segment).replace(/'/g, '%27')).join('/');
}

function artifactLink(path, label) {
  const href = artifactPath(path);
  return href ? `<a href="${escapeHTML(href)}">${escapeHTML(label)}</a>` : '';
}

function detail(label, value) {
  if (value === undefined || value === null) return '';
  return `<details><summary>${escapeHTML(label)}</summary><pre>${escapeHTML(json(value))}</pre></details>`;
}

function recordHTML(record, anchor, outputDir) {
  const screenshot = artifactPath(record.screenshot);
  const links = Object.entries(record.artifacts ?? {}).map(([label, path]) => artifactLink(path, label)).filter(Boolean);
  const repro = artifactPath(record.artifacts?.repro);
  const replayFile = repro ? (outputDir ? resolve(outputDir, decodeURIComponent(repro)) : decodeURIComponent(repro)) : null;
  const duration = Number.isFinite(record.durationMs) ? ` · ${(record.durationMs / 1000).toFixed(1)} s` : '';
  return `<article class="record" id="${anchor}">
    <div class="record-head"><h3>${escapeHTML(record.label ?? record.id ?? 'Observation')}</h3>${badge(record.status)}</div>
    <p class="muted">${escapeHTML(record.mode ?? '')}${escapeHTML(duration)}</p>
    ${screenshot ? `<a class="shot" href="${escapeHTML(screenshot)}"><img loading="lazy" src="${escapeHTML(screenshot)}" alt="${escapeHTML(record.label ?? 'Captured UI state')}"></a>` : '<p class="empty">No screenshot captured.</p>'}
    ${links.length ? `<nav class="artifacts" aria-label="Record artifacts">${links.join('')}</nav>` : ''}
    ${replayFile ? `<details><summary>Replay instructions</summary><p>From the project root, replay the saved action file:</p><pre>${escapeHTML(`node tools/ui/explorer.mjs replay '${replayFile.replace(/'/g, "'\\''")}'`)}</pre><p class="muted">Use the original report URL and browser settings. Replay repeats recorded actions; it does not establish that a finding is fixed.</p></details>` : ''}
    ${record.errors?.length ? `<div class="errors"><strong>Console / page errors (${record.errors.length})</strong><pre>${escapeHTML(json(record.errors))}</pre></div>` : ''}
    ${detail('Action history', record.actions)}${detail('Before state', record.before)}${detail('After state', record.after)}${detail('Details', record.details)}
  </article>`;
}

function badge(status) {
  const normalized = statusOf(status);
  return `<span class="badge ${normalized}">${normalized === 'not-run' ? 'Not run' : normalized}</span>`;
}

/** Render a portable, offline report. Evidence stays in relative artifact files. */
export function renderReport(bundle) {
  const supplied = Array.isArray(bundle.capabilities) ? bundle.capabilities : [];
  const capabilities = Object.entries(MODES).map(([id, title]) => supplied.find(item => item.id === id) ?? {
    id, title, status: 'not-run', reason: 'This capability was not included in this run.', records: []
  });
  capabilities.push(...supplied.filter(item => !Object.hasOwn(MODES, item.id)));
  const records = new Map();
  capabilities.forEach((capability, index) => (capability.records ?? []).forEach((record, recordIndex) => {
    if (!records.has(record.id)) records.set(record.id, `record-${index}-${recordIndex}`);
  }));
  const findings = Array.isArray(bundle.findings) ? bundle.findings : [];
  const count = status => capabilities.filter(capability => statusOf(capability.status) === status).length;
  const meta = bundle.meta ?? {};
  const outputDir = typeof meta.outputDir === 'string' && isAbsolute(meta.outputDir) && !/[\x00-\x1f\x7f]/.test(meta.outputDir) ? meta.outputDir : null;
  const history = (Array.isArray(meta.history) ? meta.history : []).map(item => artifactLink(item.path, item.label ?? 'Earlier run')).filter(Boolean);
  const searchIndex = capability => json({ id: capability.id, title: capability.title, reason: capability.reason,
    records: (capability.records ?? []).map(({ id, label, mode, actions, errors, after }) => ({ id, label, mode, actions, errors, roots: after?.roots })) }).toLowerCase();
  const capabilityHTML = capabilities.map((capability, index) => `<section class="capability" data-status="${statusOf(capability.status)}" data-search="${escapeHTML(searchIndex(capability))}" id="capability-${index}">
    <header class="section-head"><div><p class="eyebrow">${escapeHTML(capability.id)}</p><h2>${escapeHTML(capability.title ?? MODES[capability.id] ?? capability.id)}</h2></div>${badge(capability.status)}</header>
    ${capability.reason ? `<p class="reason">${escapeHTML(capability.reason)}</p>` : ''}
    <div class="records">${(capability.records ?? []).map((record, recordIndex) => recordHTML(record, `record-${index}-${recordIndex}`, outputDir)).join('') || '<p class="empty">No observations recorded. This is not evidence of a pass.</p>'}</div>
  </section>`).join('');
  const findingsHTML = findings.map(finding => {
    const anchor = records.get(finding.recordId);
    return `<article class="finding" data-search="${escapeHTML(json(finding).toLowerCase())}"><div class="record-head"><strong>${escapeHTML(finding.kind ?? 'Finding')}</strong><span class="severity">${escapeHTML(finding.severity ?? 'unclassified')}</span></div><p>${escapeHTML(finding.message)}</p>${finding.selector ? `<code>${escapeHTML(finding.selector)}</code>` : ''}${anchor ? `<p><a href="#${anchor}">View observation</a></p>` : ''}${detail('Evidence', finding.evidence)}</article>`;
  }).join('');
  const nodes = Array.isArray(bundle.graph?.nodes) ? bundle.graph.nodes : [];
  const nodeIds = new Map(nodes.map((node, index) => [node.id, `state-${index}`]));
  const graphHTML = nodes.map((node, index) => {
    const anchor = records.get(node.recordId);
    const edges = (bundle.graph?.edges ?? []).filter(edge => edge.from === node.id);
    return `<article class="state" id="state-${index}"><h3>${escapeHTML(node.label ?? node.id)}</h3>${anchor ? `<a href="#${anchor}">Open captured state</a>` : '<p class="muted">No linked observation.</p>'}<ul>${edges.map(edge => `<li>${escapeHTML(typeof edge.action === 'object' ? json(edge.action) : edge.action ?? 'Transition')} → ${nodeIds.has(edge.to) ? `<a href="#${nodeIds.get(edge.to)}">${escapeHTML(nodes.find(target => target.id === edge.to)?.label ?? edge.to)}</a>` : escapeHTML(edge.to)}</li>`).join('')}</ul></article>`;
  }).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${escapeHTML(meta.title ?? 'Apex UI explorer')}</title>
<style>
:root{color-scheme:dark;--bg:#101724;--panel:#182334;--line:#314258;--text:#e8eef6;--muted:#adbbcc;--accent:#79d9cf}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,sans-serif}a{color:var(--accent);text-underline-offset:3px}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #f6c978;outline-offset:4px}main{max-width:1360px;margin:auto;padding:40px 24px 80px}h1{font-size:clamp(2rem,5vw,3.6rem);line-height:1.1;letter-spacing:-.04em;margin:12px 0}h2{font-size:1.45rem;margin:0}h3{font-size:1rem;margin:0}.eyebrow{text-transform:uppercase;letter-spacing:.12em;color:var(--accent);font-size:.75rem;margin:0}.muted,.empty{color:var(--muted)}.metadata{display:flex;flex-wrap:wrap;gap:10px 28px;font-size:.9rem;overflow-wrap:anywhere}.stats,.toolbar,.section-head,.record-head{display:flex;flex-wrap:wrap;align-items:center;gap:12px}.stats{margin:24px 0}.stat{border:1px solid var(--line);padding:12px 18px;border-radius:12px}.stat strong{font-size:1.5rem;margin-right:8px}.toolbar{padding:18px;background:var(--panel);border:1px solid var(--line);border-radius:12px;margin:28px 0}label{display:flex;gap:8px;align-items:center}input,select,button{font:inherit;color:var(--text);background:var(--bg);border:1px solid #61738a;border-radius:6px;padding:8px 12px}input{width:min(35vw,360px)}button{cursor:pointer}nav.quick{display:flex;gap:16px;flex-wrap:wrap}.capability,.overview{border-top:1px solid var(--line);padding-top:24px;margin-top:32px}.section-head,.record-head{justify-content:space-between}.records,.findings,.graph{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:16px;margin-top:20px}.record,.finding,.state{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px;min-width:0;scroll-margin-top:20px}.badge,.severity{font-size:.75rem;border:1px solid var(--line);border-radius:99px;padding:3px 10px;white-space:nowrap;text-transform:capitalize}.passed{color:#9de1ba;border-color:#4c8065}.failed{color:#ffb9b4;border-color:#aa635c}.partial{color:#f5d091;border-color:#927649}.not-run{color:#b5c0ce}.shot{display:block;margin:12px 0;background:#0b111b;border-radius:6px;overflow:hidden}.shot img{display:block;width:100%;height:220px;object-fit:contain}.artifacts{display:flex;flex-wrap:wrap;gap:14px}.reason,.limitations{padding:14px 18px;background:#253044;border-left:3px solid #d3b576;border-radius:4px}details{margin-top:12px}summary{cursor:pointer;color:#c6dded}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#101724;padding:12px;border-radius:6px;font-size:.8rem;max-height:420px;overflow:auto}code{overflow-wrap:anywhere}.errors{border-left:3px solid #d58f89;padding-left:12px;margin-top:16px}.state ul{padding-left:20px}.empty{font-size:.9rem}[hidden]{display:none!important}footer{color:var(--muted);margin-top:44px;font-size:.85rem}@media(max-width:600px){main{padding:24px 14px 50px}.toolbar label{width:100%;display:block}input,select{width:100%;display:block}.metadata{display:block}.shot img{height:auto;max-height:300px}}
.state,.record{min-width:0}.state h3,.state a{overflow-wrap:anywhere}
</style></head><body><main>
<header><p class="eyebrow">Apex · browser exploration</p><h1>${escapeHTML(meta.title ?? 'UI explorer')}</h1><p class="muted">Eight ways to investigate the interface. Each result keeps its evidence and limitations visible.</p><div class="metadata"><span>Target: ${escapeHTML(meta.url ?? 'Not recorded')}</span><span>Head: ${escapeHTML(meta.gitHead ?? 'Not recorded')}</span><span>Browser: ${escapeHTML(typeof meta.browser === 'object' ? json(meta.browser) : meta.browser ?? 'Not recorded')}</span><span>Viewport: ${escapeHTML(meta.viewport ? json(meta.viewport) : 'Not recorded')}</span><span>Started: ${escapeHTML(meta.startedAt ?? 'Not recorded')}</span><span>Finished: ${escapeHTML(meta.finishedAt ?? 'Not recorded')}</span></div></header>
<div class="stats" aria-label="Capability results">${['passed','failed','partial','not-run'].map(status => `<div class="stat"><strong>${count(status)}</strong>${status === 'not-run' ? 'not run' : status}</div>`).join('')}<div class="stat"><strong>${findings.length}</strong>findings</div></div>
${meta.limitations?.length ? `<aside class="limitations"><strong>Limits of this run</strong><ul>${meta.limitations.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul></aside>` : ''}
<nav class="quick" aria-label="Report sections"><a href="#observations">Observations</a><a href="#findings">Findings</a><a href="#graph">Reachable states</a><a href="report.json" download>Report JSON</a><button id="download" type="button">Download embedded JSON</button></nav>
${history.length ? `<nav class="quick" aria-label="Run history"><strong>Run history</strong>${history.join('')}</nav>` : ''}
<div class="toolbar"><label for="search">Search evidence <input id="search" type="search" placeholder="Screen, action, error…"></label><label for="status">Capability status <select id="status"><option value="all">All statuses</option>${['passed','failed','partial','not-run'].map(status => `<option value="${status}">${status === 'not-run' ? 'Not run' : status}</option>`).join('')}</select></label><output id="result-count" aria-live="polite"></output></div>
<div id="observations">${capabilityHTML}</div>
<section class="overview" id="findings"><h2>Findings</h2><p class="muted">Observations require review. Missing coverage does not establish correctness.</p><div class="findings">${findingsHTML || '<p class="empty">No findings recorded. Check capability coverage above.</p>'}</div></section>
<section class="overview" id="graph"><h2>Reachable states</h2><p class="muted">Observed navigation paths; this graph does not prove every screen is reachable.</p><div class="graph">${graphHTML || '<p class="empty">No navigation states recorded.</p>'}</div></section>
<footer>Portable report · opens directly from disk · screenshots, traces and replay files remain separate local artifacts.</footer>
</main><script type="application/json" id="report-data">${inlineJSON(bundle)}</script>
<script>
'use strict';
const search = document.getElementById('search');
const status = document.getElementById('status');
function filter() {
  const query = search.value.toLowerCase().trim();
  let visible = 0;
  document.querySelectorAll('.capability').forEach(section => {
    section.hidden = !(status.value === 'all' || section.dataset.status === status.value) || !section.dataset.search.includes(query);
    if (!section.hidden) visible++;
  });
  document.querySelectorAll('.finding').forEach(item => { item.hidden = !item.dataset.search.includes(query); });
  document.getElementById('result-count').textContent = visible + ' capabilities shown';
}
search.addEventListener('input', filter);
status.addEventListener('change', filter);
filter();
document.getElementById('download').addEventListener('click', () => {
  const blob = new Blob([document.getElementById('report-data').textContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'report.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
</script></body></html>`;
}

/** Write generated output only; callers choose an artifacts/ destination. */
export async function writeReport(bundle, outDir) {
  await mkdir(outDir, { recursive: true });
  const htmlPath = join(outDir, 'index.html');
  const report = { ...bundle, meta: { ...bundle.meta, outputDir: resolve(outDir) } };
  await writeFile(join(outDir, 'report.json'), `${json(report)}\n`, 'utf8');
  await writeFile(htmlPath, renderReport(report), 'utf8');
  return htmlPath;
}
