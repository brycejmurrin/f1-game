import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { AUDIT_LIMITS, joinAuditFindings, captureAuditEnvironment, captureAuditSelectors, auditFindingSelectors } from '../../tools/ui/explorer/audit-evidence.mjs';

function environment() {
  const prefs = Object.fromEntries(['uiTheme', 'menuAccent', 'hudAccent', 'textSize', 'uiContrast', 'cvd', 'menuHelp', 'motion', 'speedUnits'].map(k => [k, null]));
  return { version: 1, root: '#select', viewport: { width: 852, height: 393, dpr: 1, visual: { width: 852, height: 393, scale: 1, offsetLeft: 0, offsetTop: 0 } },
    pointer: { coarse: true, fine: false, hover: false, maxTouchPoints: 1 },
    scales: { ui: 1.3, hud: 1.3, hudButtons: '1', text: '16px', explorerText: '100' },
    insets: { top: 0, right: 59, bottom: 21, left: 59, layoutTokens: Object.fromEntries(['--safe-t', '--safe-r', '--safe-b', '--safe-l', '--gut'].map(k => [k, '12px'])) },
    appearance: { root: { ...prefs }, body: { ...prefs }, tokens: Object.fromEntries(['--red', '--accent', '--accent-ink', '--hud-text-boost'].map(k => [k, '1'])), dark: true, reducedMotion: false, forcedColors: false },
    adjustments: [], source: { sha: 'a'.repeat(40), dirty: false, fingerprint: 'b'.repeat(64) } };
}
const inspection = () => ({ environment: environment(), controls: [{ selector: '#go' }], layoutContexts: [{ selector: '#list' }] });
const fit = () => ({ producer: 'fit-audit', rows: [{ screen: 'select', viewport: { width: 852, height: 393 }, environment: environment(),
  tap: [{ el: '#go.action', w: 20, h: 23, sev: 'under-floor' }], spacing: [], type: [], overflow: [], marker: [],
  selectorIndex: { '#go.action': { count: 1, selector: '#go' } }, thresholds: { tap: { floor: 24, comfy: 44 } }, units: 'CSS px' }] });

test('native fit report joins original findings, measurements, thresholds and unique selector', () => {
  const report = joinAuditFindings(inspection(), fit());
  assert.equal(report.status, 'joined'); assert.equal(report.cells[0].status, 'comparable');
  assert.deepEqual(report.findings[0], { cell: 0, producer: 'fit-audit', kind: 'tap', classification: 'finding', selector: '#go.action',
    mapping: { status: 'mapped', selector: '#go', targets: ['control'] }, measurements: { el: '#go.action', w: 20, h: 23, sev: 'under-floor' }, thresholds: { floor: 24, comfy: 44 }, units: 'CSS px' });
});

test('native layout rows preserve context, informational standing and boolean document finding', () => {
  const row = { environment: environment(), screen: 'select', viewport: 'ios-phone@130', rootPresent: true, clipped: [{ el: '#list', by: '#select', past: { bottom: 8 } }], smallTaps: [{ el: '#go', w: 35, h: 35 }], deepScroll: [{ el: '#list', screens: 5 }], docOverflowX: true };
  const result = joinAuditFindings(inspection(), { rows: [row] });
  assert.equal(result.cells[0].producer, 'layout-audit');
  assert.deepEqual(result.findings.map(f => [f.kind, f.classification]), [['clipped', 'finding'], ['smallTaps', 'information'], ['deepScroll', 'information'], ['docOverflowX', 'finding']]);
  assert.deepEqual(result.findings[0].mapping.targets, ['layout-context']);
  assert.equal('thresholds' in result.findings[0], false);
});

test('native menu-fit and explicit native envelopes join without guessing missing thresholds', () => {
  const native = { '852x393@130': { select: { environment: environment(), hOverflow: [], clipped: [{ parent: '#list', child: '#go', by: -3 }], vLost: [], tiny: [], unsafe: [] } } };
  for (const artifact of [native, { producer: 'menu-fit', report: native }]) {
    const result = joinAuditFindings(inspection(), artifact);
    assert.equal(result.findings[0].kind, 'clipped'); assert.equal(result.findings[0].mapping.selector, '#go');
    assert.equal(result.findings[0].measurements.by, -3); assert.equal('thresholds' in result.findings[0], false);
  }
});

for (const [label, mutate] of [
  ['root', e => { e.root = '#other'; }], ['viewport', e => { e.viewport.width++; }], ['DPR', e => { e.viewport.dpr = 2; }],
  ['pointer', e => { e.pointer.coarse = false; }], ['UI scale', e => { e.scales.ui = 1; }], ['HUD scale', e => { e.scales.hud = 1; }],
  ['text scale', e => { e.scales.explorerText = '130'; }], ['insets', e => { e.insets.right = 0; }],
  ['appearance', e => { e.appearance.root.textSize = 'larger'; }], ['adjustments', e => { e.adjustments = ['content-visibility:visible!important']; }],
  ['sha', e => { e.source.sha = 'c'.repeat(40); }], ['dirty state', e => { e.source.dirty = true; }],
]) test(`mismatched ${label} stays incomparable and cannot attach findings`, () => {
  const audit = fit(); mutate(audit.rows[0].environment);
  const result = joinAuditFindings(inspection(), audit);
  assert.equal(result.cells[0].status, 'incomparable'); assert.equal(result.findings.length, 0); assert.ok(result.cells[0].reasons.length);
});

test('dirty sha equality requires matching complete content fingerprints', () => {
  const inspect = inspection(), audit = fit();
  inspect.environment.source.dirty = audit.rows[0].environment.source.dirty = true;
  assert.equal(joinAuditFindings(inspect, audit).cells[0].status, 'comparable');
  audit.rows[0].environment.source.fingerprint = 'c'.repeat(64);
  assert.equal(joinAuditFindings(inspect, audit).cells[0].status, 'incomparable');
  delete audit.rows[0].environment.source.fingerprint;
  assert.equal(joinAuditFindings(inspect, audit).cells[0].status, 'incomparable');
});

test('legacy and equal incomplete metadata are explicitly incomparable', () => {
  for (const e of [undefined, {}, { version: 1 }, { ...environment(), scales: {} }, { ...environment(), appearance: { ...environment().appearance, root: {} } }]) {
    const inspect = inspection(), audit = fit(); inspect.environment = e; audit.rows[0].environment = e;
    const result = joinAuditFindings(inspect, audit); assert.equal(result.cells[0].status, 'incomparable'); assert.equal(result.findings.length, 0);
  }
  const legacy = { rows: [{ screen: 'select', viewport: 'ios-phone', clipped: [], rootPresent: true }] };
  assert.equal(joinAuditFindings(inspection(), legacy).cells[0].status, 'incomparable');
});

test('skipped, error and absent-root cells remain skipped even with missing provenance', () => {
  for (const row of [{ skipped: 'boot failed' }, { error: 'root missing/hidden' }, { rootPresent: false, clipped: [] }]) {
    const result = joinAuditFindings(inspection(), { producer: 'layout-audit', rows: [row] });
    assert.equal(result.cells[0].status, 'skipped'); assert.equal(result.findings.length, 0);
  }
});

test('ambiguous producer selectors, duplicate controls and absent contexts never fan out', () => {
  for (const index of [{ count: 2, selector: null }, { count: null, selector: null }, undefined]) {
    const audit = fit(); audit.rows[0].selectorIndex = index ? { '#go.action': index } : {};
    assert.equal(joinAuditFindings(inspection(), audit).findings[0].mapping.status, 'unmapped');
  }
  const inspect = inspection(); inspect.controls.push({ selector: '#go' });
  assert.equal(joinAuditFindings(inspect, fit()).findings[0].mapping.status, 'unmapped');
});

test('unknown artifacts and empty measurements cannot become comparable passes', () => {
  assert.equal(joinAuditFindings(inspection(), {}).cells[0].status, 'incomparable');
  assert.equal(joinAuditFindings(inspection(), { producer: 'fit-audit', rows: [{ environment: environment() }] }).cells[0].status, 'incomparable');
});

test('input, nested cells and unsupported artifacts respect advertised bounds', () => {
  assert.throws(() => joinAuditFindings(inspection(), { data: 'x'.repeat(AUDIT_LIMITS.inputBytes) }), /5 MiB/);
  const artifacts = [{ producer: 'layout-audit', rows: Array.from({ length: 500 }, () => ({ skipped: 'boot failed' })) }, ...Array.from({ length: 499 }, () => ({}))];
  const result = joinAuditFindings(inspection(), artifacts);
  assert.equal(result.cells.length, 500); assert.equal(result.limits.cellsTruncated, true);
  const audit = fit(); audit.rows[0].tap = Array.from({ length: 2001 }, () => ({ el: '#go', w: 20, h: 20 }));
  const findings = joinAuditFindings(inspection(), audit);
  assert.equal(findings.findings.length, 2000); assert.equal(findings.limits.findingsTruncated, true);
});

test('browser environment callback reads actual hardware tokens and defaults root to body', () => {
  const style = { fontSize: '16px', getPropertyValue(k) { return ({ '--ui-scale': '1.3', '--hud-scale': '1', '--hud-btn-scale': '1', '--sat': '0px', '--sar': '59px', '--sab': '21px', '--sal': '59px' })[k] || 'calc(0px + 12px)'; } };
  const body = { id: '', dataset: {} }, html = { dataset: {} };
  const context = { getComputedStyle: () => style, document: { body, documentElement: html, querySelectorAll: s => s === 'body' ? [body] : [] },
    window: { visualViewport: { width: 852, height: 393, scale: 1, offsetLeft: 0, offsetTop: 0 } }, navigator: { maxTouchPoints: 1 }, CSS: { escape: x => x },
    innerWidth: 852, innerHeight: 393, devicePixelRatio: 1, matchMedia: q => ({ matches: q === '(pointer: coarse)' }) };
  const output = vm.runInNewContext(`(${captureAuditEnvironment.toString()})()`, context);
  assert.equal(output.root, 'body'); assert.equal(output.insets.right, 59); assert.equal(output.scales.ui, 1.3);
  assert.equal(output.insets.layoutTokens['--safe-r'], 'calc(0px + 12px)');
  style.getPropertyValue = () => '';
  assert.equal(vm.runInNewContext(`(${captureAuditEnvironment.toString()})()`, context).insets.right, null);
});

test('producer selector callback records cardinality and canonical ids', () => {
  const base = { id: 'select', contains: () => true }, one = { id: 'go', nodeType: 1, contains: () => false }, two = { id: 'other', nodeType: 1, contains: () => false };
  const context = { CSS: { escape: x => x }, document: { querySelector: () => base, querySelectorAll: s => s === '.chip' ? [one, two] : s === '#go.action' || s === '#go' ? [one] : [] } };
  const out = vm.runInNewContext(`(${captureAuditSelectors.toString()})({root:'#select',selectors:['#go.action','.chip']})`, context);
  assert.equal(out['#go.action'].selector, '#go'); assert.equal(out['.chip'].count, 2); assert.equal(out['.chip'].selector, null);
  assert.deepEqual(auditFindingSelectors({ clipped: [{ el: '#go', by: '#list' }], thresholds: {} }), ['#go', '#list']);
});
