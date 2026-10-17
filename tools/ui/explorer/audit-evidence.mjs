// @doc Strict, bounded joins of native audit evidence; no audit heuristics or CLI imports.
// Browser callbacks are self-contained: https://playwright.dev/docs/evaluating
export const AUDIT_LIMITS = Object.freeze({ inputBytes: 5 * 1024 * 1024, cells: 500, findings: 2000, selectors: 2000, outputBytes: 2 * 1024 * 1024 });

/** Read-only browser callback. Unknown computed values remain null, never assumed defaults. */
export function captureAuditEnvironment({ root = 'body', source = null, adjustments = [] } = {}) {
  const style = getComputedStyle(document.documentElement);
  const scalar = name => { const s = style.getPropertyValue(name).trim(); return s && Number.isFinite(Number(s)) ? Number(s) : null; };
  const px = name => { const s = style.getPropertyValue(name).trim(); return /^-?\d+(?:\.\d+)?px$/.test(s) ? Number(s.slice(0, -2)) : null; };
  const media = q => matchMedia(q).matches;
  const nodes = root ? document.querySelectorAll(root) : [];
  const el = nodes.length === 1 ? nodes[0] : null;
  const vv = window.visualViewport;
  const keys = ['uiTheme', 'menuAccent', 'hudAccent', 'textSize', 'uiContrast', 'cvd', 'menuHelp', 'motion', 'speedUnits'];
  const prefs = node => Object.fromEntries(keys.map(k => [k, node?.dataset[k] ?? null]));
  return { version: 1, root: el ? (el.id ? '#' + CSS.escape(el.id) : root) : null,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
      visual: vv ? { width: vv.width, height: vv.height, scale: vv.scale, offsetLeft: vv.offsetLeft, offsetTop: vv.offsetTop } : null },
    pointer: { coarse: media('(pointer: coarse)'), fine: media('(pointer: fine)'), hover: media('(hover: hover)'), maxTouchPoints: navigator.maxTouchPoints },
    scales: { ui: scalar('--ui-scale'), hud: scalar('--hud-scale'), hudButtons: style.getPropertyValue('--hud-btn-scale').trim() || null,
      text: style.fontSize, explorerText: document.documentElement.dataset.explorerTextScale || '100' },
    insets: { top: px('--sat'), right: px('--sar'), bottom: px('--sab'), left: px('--sal'), layoutTokens: Object.fromEntries(['--safe-t', '--safe-r', '--safe-b', '--safe-l', '--gut'].map(k => [k, style.getPropertyValue(k).trim()])) },
    appearance: { root: prefs(document.documentElement), body: prefs(document.body),
      tokens: Object.fromEntries(['--red', '--accent', '--accent-ink', '--hud-text-boost'].map(k => [k, style.getPropertyValue(k).trim()])),
      dark: media('(prefers-color-scheme: dark)'), reducedMotion: media('(prefers-reduced-motion: reduce)'), forcedColors: media('(forced-colors: active)') },
    adjustments: adjustments.slice(0, 16), source };
}

/** Capture cardinality on the producer page, before screenshots/navigation can alter it. */
export function captureAuditSelectors({ root, selectors = [] } = {}) {
  const base = document.querySelector(root), out = {};
  const canonical = el => {
    const parts = [];
    for (let n = el; n && n.nodeType !== 9; n = n.parentElement) {
      if (n.id && document.querySelectorAll('#' + CSS.escape(n.id)).length === 1) { parts.unshift('#' + CSS.escape(n.id)); break; }
      const tag = n.tagName.toLowerCase();
      const siblings = n.parentElement ? [...n.parentElement.children].filter(s => s.tagName === n.tagName) : [n];
      parts.unshift(tag + ':nth-of-type(' + (siblings.indexOf(n) + 1) + ')');
    }
    return parts.join(' > ');
  };
  for (const selector of [...new Set(selectors)].slice(0, 2000)) {
    if (typeof selector !== 'string' || selector.length > 512) continue;
    try {
      const matches = [...document.querySelectorAll(selector)].filter(n => n === base || base?.contains(n) || n.contains(base));
      Object.defineProperty(out, selector, { enumerable: true, value: { count: matches.length, selector: matches.length === 1 ? canonical(matches[0]) : null } });
    } catch { Object.defineProperty(out, selector, { enumerable: true, value: { count: null, selector: null } }); }
  }
  return out;
}

/** Fixed read-only git operations. Dirty identities include all nonignored untracked content. */
export async function captureAuditSource(root) {
  const [{ execFileSync }, { createHash }, fs, path] = await Promise.all([
    import('node:child_process'), import('node:crypto'), import('node:fs'), import('node:path')]);
  const git = args => execFileSync('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024, timeout: 10000 });
  try {
    const sha = git(['rev-parse', 'HEAD']).toString().trim();
    const status = git(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    const dirty = status.length > 0;
    const hash = createHash('sha256').update(sha).update(status).update(git(['diff', 'HEAD', '--binary', '--no-ext-diff', '--no-textconv']));
    const names = git(['ls-files', '--others', '--exclude-standard', '-z']).toString().split('\0').filter(Boolean);
    let bytes = 0;
    for (const name of names) {
      const file = path.resolve(root, name), stat = fs.lstatSync(file);
      bytes += stat.size;
      if (bytes > 16 * 1024 * 1024 || (!stat.isFile() && !stat.isSymbolicLink())) return { sha, dirty, fingerprint: null };
      const content = stat.isSymbolicLink() ? fs.readlinkSync(file) : fs.readFileSync(file);
      hash.update(JSON.stringify([name, stat.mode, createHash('sha256').update(content).digest('hex')]));
    }
    return { sha, dirty, fingerprint: hash.digest('hex') };
  } catch { return { sha: null, dirty: null, fingerprint: null }; }
}

export function auditFindingSelectors(result) {
  const selectors = [];
  for (const value of Object.values(result || {})) if (Array.isArray(value)) {
    for (const f of value.slice(0, AUDIT_LIMITS.findings)) if (f && typeof f === 'object') {
      for (const k of ['el', 'child', 'parent', 'by', 'near']) if (typeof f[k] === 'string') selectors.push(f[k]);
    }
  }
  return [...new Set(selectors)].slice(0, AUDIT_LIMITS.selectors);
}

const nativeKinds = {
  'fit-audit': ['tap', 'spacing', 'type', 'overflow', 'marker'],
  'layout-audit': ['clipped', 'offscreen', 'tinyTaps', 'smallTaps', 'truncated', 'underHardware', 'starved', 'deepScroll', 'maps', 'errors'],
  'menu-fit': ['hOverflow', 'clipped', 'vLost', 'tiny', 'unsafe'],
};
const infoKinds = new Set(['smallTaps', 'truncated', 'deepScroll', 'maps']);
const isRecord = v => !!v && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => Object.hasOwn(o || {}, k);
const stable = v => JSON.stringify(v, (_, x) => isRecord(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const finite = v => typeof v === 'number' && Number.isFinite(v);

function differences(a, b) {
  const reasons = [];
  const required = ['root', 'viewport', 'pointer', 'scales', 'insets', 'appearance', 'adjustments'];
  for (const key of required) {
    if (!own(a, key) || !own(b, key) || a[key] == null || b[key] == null) reasons.push('missing environment.' + key);
    else if (stable(a[key]) !== stable(b[key])) reasons.push('mismatched environment.' + key);
  }
  const complete = e => e?.version === 1 && typeof e.root === 'string' && e.root.length > 0
    && ['width', 'height', 'dpr'].every(k => finite(e.viewport?.[k]) && e.viewport[k] > 0)
    && isRecord(e.viewport?.visual) && ['width', 'height', 'scale', 'offsetLeft', 'offsetTop'].every(k => finite(e.viewport.visual[k]))
    && ['coarse', 'fine', 'hover'].every(k => typeof e.pointer?.[k] === 'boolean') && finite(e.pointer?.maxTouchPoints)
    && ['ui', 'hud'].every(k => finite(e.scales?.[k]) && e.scales[k] > 0)
    && ['hudButtons', 'text', 'explorerText'].every(k => typeof e.scales?.[k] === 'string' && e.scales[k].length > 0)
    && ['top', 'right', 'bottom', 'left'].every(k => finite(e.insets?.[k]))
    && ['root', 'body', 'tokens'].every(k => isRecord(e.appearance?.[k]))
    && ['root', 'body'].every(k => ['uiTheme', 'menuAccent', 'hudAccent', 'textSize', 'uiContrast', 'cvd', 'menuHelp', 'motion', 'speedUnits'].every(p => own(e.appearance?.[k], p)))
    && ['--red', '--accent', '--accent-ink', '--hud-text-boost'].every(k => own(e.appearance?.tokens, k))
    && ['--safe-t', '--safe-r', '--safe-b', '--safe-l', '--gut'].every(k => typeof e.insets?.layoutTokens?.[k] === 'string' && e.insets.layoutTokens[k].length > 0)
    && ['dark', 'reducedMotion', 'forcedColors'].every(k => typeof e.appearance?.[k] === 'boolean') && Array.isArray(e.adjustments);
  if (!complete(a) || !complete(b)) reasons.push('incomplete environment metadata');
  const sourceOK = s => isRecord(s) && /^[a-f\d]{40,64}$/i.test(s.sha) && typeof s.dirty === 'boolean' && (!s.dirty || /^[a-f\d]{64}$/i.test(s.fingerprint));
  if (!sourceOK(a?.source) || !sourceOK(b?.source)) reasons.push('missing or unknown source identity');
  else if (a.source.sha !== b.source.sha || a.source.dirty !== b.source.dirty || (a.source.dirty && a.source.fingerprint !== b.source.fingerprint)) reasons.push('mismatched source identity');
  return reasons;
}

function bounded(value, depth = 0) {
  if (depth > 6) return '[depth limit]';
  if (typeof value === 'string') return value.length > 1024 ? value.slice(0, 1024) + '[truncated]' : value;
  if (Array.isArray(value)) return value.slice(0, 64).map(v => bounded(v, depth + 1));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).slice(0, 64).map(([k, v]) => [k.slice(0, 512), bounded(v, depth + 1)]));
  return value;
}

/** Accept one native artifact, an array of artifacts, or {producer, report:<native>}. */
export function joinAuditFindings(inspection, audits) {
  const input = JSON.stringify({ inspection, audits });
  if (new TextEncoder().encode(input).length > AUDIT_LIMITS.inputBytes) throw new RangeError('Audit join input exceeds 5 MiB');
  const cells = [], findings = [];
  let cellsTruncated = false, findingsTruncated = false, outputBytes = 0;
  const entities = [ ...(inspection?.controls || []).slice(0, 500).map(c => ({ type: 'control', selector: c.selector })),
    ...(inspection?.layoutContexts || []).slice(0, 256).map(c => ({ type: 'layout-context', selector: c.selector })) ];
  const mapping = (selector, index) => {
    if (!selector) return { status: 'unmapped', reason: 'no producer selector' };
    const record = own(index, selector) ? index[selector] : null;
    if (record && record.count !== 1) return { status: 'unmapped', reason: 'ambiguous or unavailable producer selector' };
    const resolved = record?.selector || selector;
    // A class/tag descriptor cannot prove uniqueness from a truncated control list.
    if (!record && !/^#[\w-]+$/.test(selector)) return { status: 'unmapped', reason: 'producer selector cardinality unavailable' };
    const matches = entities.filter(e => e.selector === resolved);
    const unique = [...new Set(matches.map(e => e.selector))];
    if (unique.length !== 1 || !matches.length) return { status: 'unmapped', reason: 'selector absent from inspected controls/context' };
    // A single DOM element can be both a control and an ancestor context.
    if (matches.filter(e => e.type === 'control').length > 1 || matches.filter(e => e.type === 'layout-context').length > 1) return { status: 'unmapped', reason: 'ambiguous inspection selector' };
    return { status: 'mapped', selector: resolved, targets: matches.map(e => e.type) };
  };
  const add = (row, producer, screen, viewport) => {
    if (cells.length >= AUDIT_LIMITS.cells) { cellsTruncated = true; return; }
    if (!isRecord(row)) return;
    const id = cells.length;
    const skipped = row.skipped || row.error || row.rootPresent === false && 'audit root absent';
    const reasons = differences(inspection?.environment, row.environment);
    const status = skipped ? 'skipped' : reasons.length ? 'incomparable' : 'comparable';
    const cell = { id, producer, screen: String(screen || '').slice(0, 160), viewport: bounded(viewport), status, reasons: skipped ? [String(skipped).slice(0, 512), ...reasons] : reasons, findingCount: 0 };
    cells.push(cell);
    if (status !== 'comparable') return;
    const emit = (kind, raw) => {
      if (findings.length >= AUDIT_LIMITS.findings) { findingsTruncated = true; return; }
      const selector = raw?.el || raw?.child || null;
      const finding = { cell: id, producer, kind, classification: infoKinds.has(kind) ? 'information' : 'finding',
        selector, mapping: mapping(selector, row.selectorIndex), measurements: bounded(raw),
        ...(own(row.thresholds, kind) ? { thresholds: bounded(row.thresholds[kind]) } : {}),
        ...(row.units ? { units: bounded(row.units) } : {}) };
      const bytes = new TextEncoder().encode(JSON.stringify(finding)).length;
      if (bytes > 16384 || outputBytes + bytes > AUDIT_LIMITS.outputBytes) { findingsTruncated = true; return; }
      findings.push(finding); outputBytes += bytes;
      cell.findingCount++;
    };
    let measured = false;
    for (const kind of nativeKinds[producer] || []) if (Array.isArray(row[kind])) {
      measured = true;
      for (const raw of row[kind].slice(0, AUDIT_LIMITS.findings)) emit(kind, raw);
      if (row[kind].length > AUDIT_LIMITS.findings) findingsTruncated = true;
    }
    if (producer === 'layout-audit' && own(row, 'docOverflowX')) { measured = true; if (row.docOverflowX === true) emit('docOverflowX', { value: true }); }
    if (!measured) { cell.status = 'incomparable'; cell.reasons.push('native measurements unavailable'); }
  };
  const artifacts = Array.isArray(audits) ? audits : [audits];
  if (artifacts.length > AUDIT_LIMITS.cells) cellsTruncated = true;
  for (const envelope of artifacts.slice(0, AUDIT_LIMITS.cells)) {
    const report = envelope?.report ?? envelope;
    const producer = envelope?.producer || report?.producer;
    if (Array.isArray(report?.rows)) {
      const inferred = producer || (report.rows.some(r => own(r, 'clipped') || own(r, 'rootPresent') || own(r, 'skipped')) ? 'layout-audit' : 'fit-audit');
      for (const row of report.rows.slice(0, AUDIT_LIMITS.cells)) add(row, inferred, row?.screen, row?.viewport);
      if (report.rows.length > AUDIT_LIMITS.cells) cellsTruncated = true;
    } else if (isRecord(report)) {
      let seen = false;
      if (Object.keys(report).length > AUDIT_LIMITS.cells) cellsTruncated = true;
      for (const [viewport, screens] of Object.entries(report).slice(0, AUDIT_LIMITS.cells)) {
        if (!/^\d+x\d+(?:@[\d.]+)?$/.test(viewport) || !isRecord(screens)) continue;
        if (Object.keys(screens).length > AUDIT_LIMITS.cells) cellsTruncated = true;
        for (const [screen, row] of Object.entries(screens).slice(0, AUDIT_LIMITS.cells)) { add(row, producer || 'menu-fit', screen, viewport); seen = true; }
      }
      if (!seen && cells.length >= AUDIT_LIMITS.cells) cellsTruncated = true;
      else if (!seen) cells.push({ id: cells.length, producer: producer || 'unknown', status: 'incomparable', reasons: ['unsupported native audit artifact'], findingCount: 0 });
    }
  }
  if (!cells.length) cells.push({ id: 0, producer: 'unknown', status: 'incomparable', reasons: ['no audit cells'], findingCount: 0 });
  return { version: 1, status: cells.some(c => c.status === 'comparable') ? 'joined' : 'unavailable', cells, findings,
    limits: { ...AUDIT_LIMITS, cellsTruncated, findingsTruncated },
    limitations: ['A comparable audit cell is evidence from its producer; absence of findings is not an inspector clean-pass assertion.', 'Maps, truncation, soft targets and deep scroll retain informational standing; no audit thresholds are recomputed.'] };
}
