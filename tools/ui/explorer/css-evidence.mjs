// @doc Bounded CDP inherited and container CSS candidates with explicit unavailable evidence.
/** Read-only CSS candidates. Protocol checked 2026-10-17:
 * https://chromedevtools.github.io/devtools-protocol/tot/CSS/#type-CSSContainerQuery
 * https://chromedevtools.github.io/devtools-protocol/tot/CSS/#method-getMatchedStylesForNode
 * https://chromedevtools.github.io/devtools-protocol/tot/DOM/#method-getContainerForNode
 * https://chromedevtools.github.io/devtools-protocol/tot/DOM/#method-resolveNode
 * https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-callFunctionOn
 */
const LIMITS = { ancestors: 12, rules: 80, declarations: 512, perStyle: 64, queries: 8, containers: 24, text: 2048, stringBudget: 64000, outputBytes: 262144 };
const PROPERTIES = new Set('display position overflow overflow-x overflow-y width height min-width min-height max-width max-height box-sizing z-index zoom transform pointer-events visibility opacity font-size line-height white-space color background-color grid-template-columns grid-template-rows flex flex-direction flex-wrap gap container-type container-name'.split(' '));
const unavailable = reason => ({ status: 'unavailable', reason });
const line = range => Number.isInteger(range?.startLine) ? range.startLine + 1 : null;

/** Preserves inspectPage's styles shape; inherited declarations are candidates, not proof of inheritance. */
export async function collectCssEvidence(page, { selector } = {}) {
  const session = await page.context().newCDPSession(page), sheets = new Map();
  const objectGroup = 'ui-inspector-css-ancestors';
  let truncated = false, stringBudget = LIMITS.stringBudget, declarationBudget = LIMITS.declarations, ruleBudget = LIMITS.rules, remoteObjects = false;
  const text = (value, max = LIMITS.text) => {
    const raw = String(value ?? ''), length = Math.min(max, stringBudget);
    if (raw.length > length) truncated = true;
    const result = raw.slice(0, length); stringBudget -= result.length;
    return result;
  };
  const take = (items, max) => {
    const list = Array.isArray(items) ? items : [];
    if (list.length > max) truncated = true;
    return list.slice(0, max);
  };
  const declarations = style => take((style?.cssProperties || []).filter(p => !p.disabled), Math.min(LIMITS.perStyle, declarationBudget)).map(p => {
    declarationBudget--;
    return { name: text(p.name, 256), value: text(p.value), important: !!p.important, line: line(p.range),
      ...(p.parsedOk === false ? { parsedOk: false } : {}) };
  });
  const identity = node => {
    // Only identity attributes are retained; DOM text, form values and unrelated attributes are excluded.
    const attrs = node?.attributes || [], attr = key => {
      for (let i = 0; i < attrs.length; i += 2) if (attrs[i] === key) return text(attrs[i + 1], 512);
      return null;
    };
    return { nodeId: node?.nodeId || null, backendNodeId: node?.backendNodeId || null,
      tagName: text(node?.localName || node?.nodeName, 128), id: attr('id'), classes: attr('class') };
  };
  const optional = async (method, params) => {
    try { return { status: 'available', result: await session.send(method, params) }; }
    catch { return unavailable(`${method} unavailable or failed`); }
  };
  const containerCache = new Map();
  const container = async (ownerNodeId, query) => {
    if (!ownerNodeId) return unavailable('Ancestor node identity unavailable; container not inferred from inspected descendant');
    // Missing axes on older protocol versions must not turn a size query into a style-container lookup.
    if (query.physicalAxes === undefined && query.logicalAxes === undefined && query.queriesScrollState === undefined && query.queriesAnchored === undefined)
      return unavailable('CDP did not report query axes or query type; container not inferred');
    const params = { nodeId: ownerNodeId };
    for (const key of ['physicalAxes', 'logicalAxes', 'queriesScrollState', 'queriesAnchored']) if (query[key] !== undefined) params[key] = query[key];
    if (query.name !== undefined) params.containerName = query.name;
    const key = JSON.stringify(params);
    if (containerCache.has(key)) return containerCache.get(key);
    if (containerCache.size >= LIMITS.containers) { truncated = true; return unavailable('Container lookup budget reached'); }
    const resolution = await optional('DOM.getContainerForNode', params);
    let result;
    if (resolution.status !== 'available') result = resolution;
    else if (!resolution.result.nodeId) result = unavailable('CDP reported no matching query container');
    else {
      const nodeId = resolution.result.nodeId;
      const description = await optional('DOM.describeNode', { nodeId, depth: 0 });
      const geometry = await optional('DOM.getBoxModel', { nodeId });
      const styles = await optional('CSS.getComputedStyleForNode', { nodeId });
      const model = geometry.result?.model;
      result = { status: 'available', nodeId,
        node: description.status === 'available' ? { status: 'available', ...identity(description.result.node) } : description,
        geometry: model ? { status: 'available', width: model.width, height: model.height,
          content: take(model.content, 8), border: take(model.border, 8) } : unavailable('DOM.getBoxModel unavailable or no box'),
        computed: styles.status === 'available' ? { status: 'available', properties: take((styles.result.computedStyle || []).filter(p => ['container-type', 'container-name', 'writing-mode'].includes(p.name)), 3).map(p => ({ name: text(p.name, 128), value: text(p.value) })) } : styles };
    }
    containerCache.set(key, result);
    return result;
  };
  const rules = async (matches, ownerNodeId) => {
    const result = [];
    for (const match of take(matches, ruleBudget)) {
      ruleBudget--;
      const rule = match.rule || {}, style = rule.style || {};
      const entry = { selectors: take(match.matchingSelectors, 16).map(i => text(rule.selectorList?.selectors?.[i]?.text)),
        source: sheets.has(rule.styleSheetId) ? text(sheets.get(rule.styleSheetId)) : null, line: line(style.range),
        declarations: declarations(style),
        media: take(rule.media, 8).map(m => ({ text: text(m.text),
          ...(Array.isArray(m.mediaList) ? { active: m.mediaList.some(q => q.active === true) } : { status: 'unavailable', reason: 'CDP did not report media evaluation' }) })),
        containerQueryMetadata: Array.isArray(rule.containerQueries) ? { status: 'available' } : unavailable('CDP did not report containerQueries for this rule'),
        containerQueries: [] };
      for (const query of take(rule.containerQueries, LIMITS.queries)) {
        entry.containerQueries.push({ text: text(query.text), ...(query.conditionText !== undefined ? { conditionText: text(query.conditionText) } : {}),
          name: query.name === undefined ? null : text(query.name, 256),
          source: sheets.has(query.styleSheetId) ? text(sheets.get(query.styleSheetId)) : entry.source,
          line: line(query.range),
          ...Object.fromEntries(['physicalAxes', 'logicalAxes', 'queriesScrollState', 'queriesAnchored'].filter(k => query[k] !== undefined).map(k => [k, query[k]])),
          condition: unavailable('CSSContainerQuery has no browser-reported active result; matching rule is not proof the condition is active'),
          container: await container(ownerNodeId, query) });
      }
      result.push(entry);
    }
    return result;
  };
  const ancestorNodes = async (nodeId, count) => {
    const result = [];
    if (!count) return result;
    const resolved = await optional('DOM.resolveNode', { nodeId, objectGroup });
    let objectId = resolved.result?.object?.objectId;
    remoteObjects = !!objectId;
    for (let i = 0; objectId && i < count; i++) {
      const parent = await optional('Runtime.callFunctionOn', { objectId, functionDeclaration: 'function() { return this.assignedSlot ? null : this.parentElement; }', silent: true, objectGroup });
      objectId = parent.result?.result?.objectId;
      if (!objectId) break;
      const requested = await optional('DOM.requestNode', { objectId });
      const parentId = requested.result?.nodeId;
      if (!parentId) break;
      const described = await optional('DOM.describeNode', { nodeId: parentId, depth: 0 });
      // CDP inheritance follows the flat tree. A shadow host may redistribute light-DOM children
      // through a closed slot that parentElement/assignedSlot cannot expose. Do not label that chain.
      if (described.status !== 'available' || described.result.node.shadowRoots?.length) break;
      result.push({ nodeId: parentId, identity: { status: 'available', ...identity(described.result.node) } });
    }
    return result;
  };
  try {
    session.on('CSS.styleSheetAdded', ({ header }) => {
      if (sheets.size < 256) sheets.set(header.styleSheetId, String(header.sourceURL || '').slice(0, 2048));
      else truncated = true;
    });
    await session.send('DOM.enable'); await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const { nodeIds } = await session.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector });
    if (nodeIds.length !== 1) throw new Error('--styles must identify exactly one element');
    const nodeId = nodeIds[0];
    const matched = await session.send('CSS.getMatchedStylesForNode', { nodeId });
    const computed = await session.send('CSS.getComputedStyleForNode', { nodeId });
    const inheritedEntries = take(matched.inherited, LIMITS.ancestors);
    const ancestors = await ancestorNodes(nodeId, inheritedEntries.length);
    const report = { selector: text(selector), computed: take([...(computed.computedStyle || []).filter(p => PROPERTIES.has(p.name)), ...(computed.computedStyle || []).filter(p => p.name.startsWith('--'))], 128).map(p => ({ name: text(p.name, 256), value: text(p.value) })),
      inline: declarations(matched.inlineStyle), rules: await rules(matched.matchedCSSRules, nodeId), inherited: [],
      inheritedMetadata: Array.isArray(matched.inherited) ? { status: 'available', order: 'immediate parent first' } : unavailable('CDP did not report inherited styles'),
      truncated: false, limitation: 'Matched rules and inherited ancestor declarations are candidates; computed values are authoritative. This is not a cascade-winner solver. Ancestor declarations do not prove a property inherits (including registered custom properties). Container conditions are not evaluated. Ancestor identity stops at assigned slots, shadow hosts and parentElement boundaries.' };
    for (let i = 0; i < inheritedEntries.length; i++) {
      const inherited = inheritedEntries[i], ancestor = ancestors[i];
      report.inherited.push({ distance: i + 1,
        ancestor: ancestor?.identity || unavailable('Ancestor identity unavailable across parentElement boundary or unsupported CDP capability'),
        inline: declarations(inherited.inlineStyle), rules: await rules(inherited.matchedCSSRules, ancestor?.nodeId) });
    }
    // Bound serialized UTF-8 output too: escaped control characters and multibyte text can exceed the character budget.
    const size = () => Buffer.byteLength(JSON.stringify(report), 'utf8');
    while (size() > LIMITS.outputBytes) {
      truncated = true;
      if (report.inherited.length) report.inherited.pop();
      else if (report.rules.length) report.rules.pop();
      else if (report.inline.length) report.inline.pop();
      else if (report.computed.length) report.computed.pop();
      else break;
    }
    report.truncated = truncated;
    return report;
  } finally {
    try { if (remoteObjects) await session.send('Runtime.releaseObjectGroup', { objectGroup }); }
    finally { await session.detach(); }
  }
}
