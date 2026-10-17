import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCssEvidence } from '../../tools/ui/explorer/css-evidence.mjs';

const declaration = (name = 'color', value = 'red', extra = {}) => ({ name, value, ...extra });
const match = (extra = {}) => ({ matchingSelectors: [0], rule: { styleSheetId: 'sheet', selectorList: { selectors: [{ text: '.candidate' }] },
  style: { range: { startLine: 9 }, cssProperties: [declaration('color', 'red', { important: true, range: { startLine: 10 } })] },
  media: [{ text: '(width > 300px)', mediaList: [{ active: true }] }], ...extra } });
const query = { text: '(width > 300px)', conditionText: 'card (width > 300px)', name: 'card', physicalAxes: 'Horizontal', logicalAxes: 'None',
  queriesScrollState: false, queriesAnchored: false, styleSheetId: 'sheet', range: { startLine: 7 } };
function mock({ matched = {}, nodes = [7], fail = {}, computed = [declaration('color', 'red')], handler } = {}) {
  const calls = [], listeners = new Map(); let detached = 0;
  const session = {
    on(event, fn) { listeners.set(event, fn); },
    async send(method, params = {}) {
      calls.push({ method, params });
      if (fail[method]) throw new Error(fail[method]);
      if (handler) { const response = handler(method, params); if (response !== undefined) return response; }
      switch (method) {
        case 'DOM.enable': return {};
        case 'CSS.enable': listeners.get('CSS.styleSheetAdded')?.({ header: { styleSheetId: 'sheet', sourceURL: 'https://example.test/app.css' } }); return {};
        case 'DOM.getDocument': return { root: { nodeId: 1 } };
        case 'DOM.querySelectorAll': return { nodeIds: nodes };
        case 'CSS.getMatchedStylesForNode': return matched;
        case 'CSS.getComputedStyleForNode': return { computedStyle: params.nodeId === 7 ? computed : [declaration('container-name', 'card'), declaration('container-type', 'inline-size')] };
        case 'DOM.resolveNode': return { object: { objectId: 'node-7' } };
        case 'Runtime.callFunctionOn': return { result: params.objectId === 'node-7' ? { objectId: 'node-6' } : { subtype: 'null', value: null } };
        case 'DOM.requestNode': return { nodeId: 6 };
        case 'DOM.describeNode': return { node: { nodeId: params.nodeId, backendNodeId: params.nodeId + 100, localName: 'section', attributes: ['id', params.nodeId === 5 ? 'actual-container' : 'parent', 'class', 'card', 'data-private', 'excluded'] } };
        case 'DOM.getContainerForNode': return { nodeId: 5 };
        case 'DOM.getBoxModel': return { model: { width: 480, height: 240, content: [0, 0, 480, 0, 480, 240, 0, 240], border: [0, 0, 480, 0, 480, 240, 0, 240] } };
        case 'Runtime.releaseObjectGroup': return {};
        default: throw new Error(`Unexpected method ${method}`);
      }
    },
    async detach() { detached++; }
  };
  return { page: { context: () => ({ newCDPSession: async () => session }) }, calls, detached: () => detached };
}

test('preserves source/important/media evidence and resolves named containers for actual rule owners', async () => {
  const fixture = mock({ matched: { inlineStyle: { cssProperties: [declaration('width', '100%')] },
    matchedCSSRules: [match({ containerQueries: [query] })],
    inherited: [{ inlineStyle: { cssProperties: [declaration('--accent', 'tomato', { important: true, range: { startLine: 20 } })] },
      matchedCSSRules: [match({ style: { range: { startLine: 30 }, cssProperties: [declaration('--accent', 'purple', { important: true, range: { startLine: 31 } }), declaration('ignored', 'x', { disabled: true })] }, containerQueries: [query] })] }] },
    computed: [declaration('color', 'rgb(255, 0, 0)'), declaration('--accent', 'tomato'), declaration('unrelated', 'excluded')] });
  const report = await collectCssEvidence(fixture.page, { selector: '#control' });
  assert.equal(report.selector, '#control');
  assert.deepEqual(report.computed.map(p => p.name), ['color', '--accent']);
  const candidate = report.rules[0];
  assert.equal(candidate.source, 'https://example.test/app.css');
  assert.equal(candidate.line, 10);
  assert.deepEqual(candidate.declarations[0], { name: 'color', value: 'red', important: true, line: 11 });
  assert.deepEqual(candidate.media, [{ text: '(width > 300px)', active: true }]);
  const cq = candidate.containerQueries[0];
  assert.equal(cq.conditionText, 'card (width > 300px)');
  assert.equal(cq.line, 8);
  assert.equal(cq.condition.status, 'unavailable');
  assert.equal(cq.active, undefined);
  assert.equal(cq.container.node.id, 'actual-container');
  assert.equal(cq.container.geometry.width, 480);
  assert.equal(cq.container.computed.properties[0].value, 'card');
  assert.equal(report.inherited[0].distance, 1);
  assert.equal(report.inherited[0].ancestor.id, 'parent');
  assert.equal(report.inherited[0].ancestor.nodeId, 6);
  assert.equal(report.inherited[0].inline[0].name, '--accent');
  assert.equal(report.inherited[0].inline[0].line, 21);
  assert.equal(report.inherited[0].rules[0].source, 'https://example.test/app.css');
  assert.equal(report.inherited[0].rules[0].line, 31);
  assert.equal(report.inherited[0].rules[0].declarations.length, 1);
  assert.match(report.limitation, /candidates/);
  assert.match(report.limitation, /do not prove a property inherits/);
  const resolutions = fixture.calls.filter(c => c.method === 'DOM.getContainerForNode');
  assert.deepEqual(resolutions.map(c => c.params.nodeId), [7, 6]);
  assert.deepEqual(resolutions[0].params, { nodeId: 7, physicalAxes: 'Horizontal', logicalAxes: 'None', queriesScrollState: false, queriesAnchored: false, containerName: 'card' });
  assert.equal(fixture.calls.at(-1).method, 'Runtime.releaseObjectGroup');
  assert.equal(fixture.detached(), 1);
});

test('unsupported optional CDP capabilities remain unavailable without losing candidates', async () => {
  const fixture = mock({ matched: { matchedCSSRules: [match({ containerQueries: [query] })], inherited: [{ matchedCSSRules: [match({ containerQueries: [query] })] }] },
    fail: { 'DOM.getContainerForNode': 'method not found', 'DOM.resolveNode': 'unsupported' } });
  const report = await collectCssEvidence(fixture.page, { selector: '#control' });
  assert.equal(report.rules[0].containerQueries[0].container.status, 'unavailable');
  assert.match(report.rules[0].containerQueries[0].container.reason, /DOM.getContainerForNode/);
  assert.equal(report.inherited[0].ancestor.status, 'unavailable');
  assert.equal(report.inherited[0].rules[0].declarations[0].name, 'color');
  assert.match(report.inherited[0].rules[0].containerQueries[0].container.reason, /not inferred/);
  assert.equal(fixture.detached(), 1);
});

test('flat-tree boundaries retain inherited sources without guessing ancestor identity', async () => {
  for (const boundary of ['slot', 'closed-shadow-host', 'description-unavailable']) {
    const fixture = mock({ matched: { inherited: [{ matchedCSSRules: [match({ containerQueries: [query] })] }] },
      fail: boundary === 'description-unavailable' ? { 'DOM.describeNode': 'unsupported' } : {},
      handler: (method, params) => {
        if (boundary === 'slot' && method === 'Runtime.callFunctionOn') return { result: { subtype: 'null', value: null } };
        if (boundary === 'closed-shadow-host' && method === 'DOM.describeNode' && params.nodeId === 6)
          return { node: { nodeId: 6, localName: 'section', shadowRoots: [{ shadowRootType: 'closed' }] } };
      } });
    const report = await collectCssEvidence(fixture.page, { selector: '#control' });
    assert.equal(report.inherited[0].ancestor.status, 'unavailable', boundary);
    assert.equal(report.inherited[0].rules[0].source, 'https://example.test/app.css');
    assert.equal(report.inherited[0].rules[0].containerQueries[0].container.status, 'unavailable');
    assert.equal(fixture.calls.some(c => c.method === 'DOM.getContainerForNode'), false);
    assert.equal(fixture.calls.at(-1).method, 'Runtime.releaseObjectGroup');
    assert.equal(fixture.detached(), 1);
  }
});

test('unreported container metadata, query type and inherited metadata are explicit unavailable results', async () => {
  const fixture = mock({ matched: { matchedCSSRules: [match(), match({ containerQueries: [{ text: '(width > 0px)' }] })] } });
  const report = await collectCssEvidence(fixture.page, { selector: '#control' });
  assert.equal(report.rules[0].containerQueryMetadata.status, 'unavailable');
  assert.equal(report.inheritedMetadata.status, 'unavailable');
  assert.equal(report.rules[1].containerQueries[0].container.status, 'unavailable');
  assert.match(report.rules[1].containerQueries[0].container.reason, /axes or query type/);
  assert.equal(fixture.calls.some(c => c.method === 'DOM.getContainerForNode'), false);
  assert.equal(fixture.detached(), 1);
});

test('geometry failure and absent container do not imply successful condition evaluation', async () => {
  const fixture = mock({ matched: { matchedCSSRules: [match({ containerQueries: [query] })] }, fail: { 'DOM.getBoxModel': 'no box' } });
  const report = await collectCssEvidence(fixture.page, { selector: '#control' });
  const cq = report.rules[0].containerQueries[0];
  assert.equal(cq.container.status, 'available');
  assert.equal(cq.container.geometry.status, 'unavailable');
  assert.equal(cq.condition.status, 'unavailable');
  const missing = mock({ matched: { matchedCSSRules: [match({ containerQueries: [query] })] }, handler: method => method === 'DOM.getContainerForNode' ? {} : undefined });
  const absent = await collectCssEvidence(missing.page, { selector: '#control' });
  assert.equal(absent.rules[0].containerQueries[0].container.status, 'unavailable');
  assert.match(absent.rules[0].containerQueries[0].container.reason, /no matching/);
});

test('bounds ancestor, rule, declaration, query, string and serialized output sizes', async () => {
  const huge = '\u0000😀'.repeat(3000);
  const largeMatch = match({ selectorList: { selectors: [{ text: huge }] }, style: { cssProperties: Array.from({ length: 100 }, () => declaration('--large', huge)) },
    containerQueries: Array.from({ length: 20 }, (_, i) => ({ ...query, name: `container-${i}` })) });
  const fixture = mock({ matched: { inlineStyle: { cssProperties: Array.from({ length: 100 }, () => declaration('--large', huge)) },
    matchedCSSRules: Array.from({ length: 100 }, () => largeMatch), inherited: Array.from({ length: 30 }, () => ({ matchedCSSRules: [largeMatch] })) },
    computed: Array.from({ length: 300 }, (_, i) => declaration(`--computed-${i}`, huge)) });
  const report = await collectCssEvidence(fixture.page, { selector: '#control' });
  assert.equal(report.truncated, true);
  assert.ok(report.inherited.length <= 12);
  assert.ok(report.rules.length + report.inherited.reduce((n, a) => n + a.rules.length, 0) <= 80);
  assert.ok(report.inline.length <= 64);
  assert.ok(report.rules.every(r => r.declarations.length <= 64 && r.containerQueries.length <= 8));
  assert.ok(report.computed.length <= 128);
  assert.ok(report.computed.every(p => p.value.length <= 2048));
  assert.ok(fixture.calls.filter(c => c.method === 'DOM.getContainerForNode').length <= 24);
  assert.ok(Buffer.byteLength(JSON.stringify(report), 'utf8') <= 262144);
  assert.equal(fixture.detached(), 1);
});

test('ambiguity keeps the existing error and always detaches', async () => {
  for (const nodes of [[], [7, 8]]) {
    const fixture = mock({ nodes });
    await assert.rejects(collectCssEvidence(fixture.page, { selector: '.many' }), { message: '--styles must identify exactly one element' });
    assert.equal(fixture.detached(), 1);
    assert.equal(fixture.calls.some(c => c.method === 'CSS.getMatchedStylesForNode'), false);
  }
});

test('required CDP failures and cleanup failures still detach', async () => {
  for (const method of ['DOM.enable', 'CSS.getMatchedStylesForNode', 'CSS.getComputedStyleForNode', 'Runtime.releaseObjectGroup']) {
    const fixture = mock({ matched: { inherited: [{ matchedCSSRules: [] }] }, fail: { [method]: 'test failure' } });
    await assert.rejects(collectCssEvidence(fixture.page, { selector: '#control' }), /test failure/);
    assert.equal(fixture.detached(), 1, method);
  }
});
