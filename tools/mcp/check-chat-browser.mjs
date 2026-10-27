// @doc Probe local game boot and F1Dev diagnostics through the canonical gateway; no hosted claim.
import fs from 'node:fs';
import {createGateway, RELEASE} from './chat-gateway.mjs';

const gateway = await createGateway();
let pageId;
const report = {kind: 'local gateway browser smoke', hosted: false, checks: []};
try {
  const catalog = await gateway.catalog();
  for (const name of ['chrome_devtools__navigate_page', 'chrome_devtools__evaluate_script']) {
    if (!catalog.has(name)) throw new Error('Missing browser route: ' + name);
  }
  const pages = await gateway.call({name: 'chrome_devtools__list_pages', arguments: {outputLevel: 'full'}});
  const text = (pages.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
  const match = text.match(/(?:^|\n)(\d+):/);
  if (pages.isError || !match) { report.pageDiscovery = pages; throw new Error('Could not discover browser page ID'); }
  pageId = Number(match[1]);
  const navigate = await gateway.call({name: 'chrome_devtools__navigate_page', arguments: {pageId, type: 'url', url: 'http://127.0.0.1:3456/'}});
  if (navigate.isError) { report.checks.push({name:'navigation',status:'fail',evidence:navigate}); throw new Error('Local game navigation failed'); }
  const boot = await gateway.call({name: 'chrome_devtools__evaluate_script', arguments: {pageId, waitForStableDom: false, function: `async () => {
    const deadline = Date.now() + 15000;
    while (!globalThis.__apex?.agentHelp && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
    if (!globalThis.__apex?.agentHelp) throw new Error('Apex API did not initialize');
    const manifest = __apex.agentHelp();
    return {signal: 'APEX_ENVIRONMENT_BOOT_PASS', url: location.href, title: document.title,
      manifestPresent: !!manifest, info: typeof __apex.info === 'function' ? __apex.info() : null,
      visibility: document.visibilityState, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches};
  }`}});
  if (boot.isError || !JSON.stringify(boot).includes('APEX_ENVIRONMENT_BOOT_PASS')) throw new Error('Game API boot probe failed');
  report.checks.push({name: 'game API boot through pinned Chrome MCP', status: 'pass', evidence: boot});
  const helper = fs.readFileSync('/workspace/f1-game/tools/environment/plugin-sources/f1-dev-tools/skills/f1-dev-tools/scripts/browser.js', 'utf8');
  const diagnosis = await gateway.call({name: 'chrome_devtools__evaluate_script', arguments: {pageId, waitForStableDom: false, function: `() => { ${helper}\n return F1Dev.diagnose(); }`}});
  if (diagnosis.isError) throw new Error('F1Dev diagnostic helper failed');
  report.checks.push({name: 'F1Dev.diagnose', status: 'pass', evidence: diagnosis});
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = error.message;
  process.exitCode = 1;
} finally {
  try { await gateway.call({name: 'chrome_devtools__navigate_page', arguments: {pageId, type: 'url', url: 'about:blank'}}); } catch {}
  try { await gateway.call({name: RELEASE}); } catch {}
  await gateway.close();
  fs.writeFileSync('/workspace/f1-game/artifacts/logs/environment-repair-browser.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ok: report.ok, checks: report.checks.map(c => ({name: c.name, status: c.status})), error: report.error}));
}
