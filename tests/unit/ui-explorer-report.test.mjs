import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Script } from 'node:vm';
import { renderReport, writeReport } from '../../tools/ui/explorer/report.mjs';

function fixture() {
  return {
    version: 1,
    meta: { title: 'Garage exploration', url: 'http://localhost:3456', gitHead: 'abc123', limitations: ['No real GPU'] },
    capabilities: [{ id: 'missions', title: 'First race', status: 'partial', reason: 'Race launch was not reached', records: [{
      id: 'garage', label: 'Garage settings', status: 'passed', mode: 'missions', durationMs: 1200,
      screenshot: 'shots/garage wide.png', artifacts: { aria: 'aria/garage.txt', repro: 'repros/garage.json' },
      actions: [{ type: 'click', selector: '#settings' }], errors: ['Missing texture'], details: { observed: true }
    }] }],
    findings: [{ id: 'clipped', kind: 'Layout', severity: 'medium', message: 'Button clipped', recordId: 'garage', evidence: { overlap: 24 } }],
    graph: { nodes: [{ id: 'menu', label: 'Main menu' }, { id: 'garage-state', label: 'Garage', recordId: 'garage' }], edges: [{ from: 'menu', to: 'garage-state', action: 'Open garage' }] }
  };
}

test('offline report presents partial coverage and all eight capabilities truthfully', () => {
  const html = renderReport(fixture());
  assert.equal((html.match(/class="capability"/g) ?? []).length, 8);
  assert.match(html, /Race launch was not reached/);
  assert.match(html, /This capability was not included in this run/);
  assert.match(html, /No observations recorded\. This is not evidence of a pass/);
  assert.match(html, /No real GPU/);
  assert.match(html, /class="badge partial"/);
  assert.match(html, /<strong>7<\/strong>not run/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|fetch\(/);
});

test('linked evidence includes screenshot, console error, graph and action history', () => {
  const html = renderReport(fixture());
  assert.match(html, /src="shots\/garage%20wide.png"/);
  assert.match(html, /href="aria\/garage.txt"/);
  assert.match(html, /Console \/ page errors \(1\)/);
  assert.match(html, /Missing texture/);
  assert.match(html, /Action history/);
  assert.match(html, /href="#state-1">Garage/);
  assert.match(html, /href="#record-0-0">Open captured state/);
  assert.match(html, /href="#record-0-0">View observation/);
  assert.match(html, /node tools\/ui\/explorer.mjs replay/);
});

test('untrusted strings cannot close script, title or attributes', () => {
  const bundle = fixture();
  const payload = '</script><script>alert("bad")</script><img src=x onerror="bad">&\u2028\u2029';
  bundle.meta.title = payload;
  bundle.meta.limitations = [payload];
  bundle.capabilities[0].title = payload;
  bundle.capabilities[0].records[0].label = payload;
  bundle.findings[0].message = payload;
  bundle.graph.nodes[0].label = payload;
  const html = renderReport(bundle);
  assert.equal((html.match(/<script\b/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<img src=x|<title><\/script>/);
  assert.match(html, /&lt;img src=x onerror=&quot;bad&quot;&gt;/);
  const embedded = html.match(/<script type="application\/json" id="report-data">([\s\S]*?)<\/script>/)[1];
  assert.doesNotMatch(embedded, /[<>&\u2028\u2029]/);
  assert.deepEqual(JSON.parse(embedded), bundle);
});

test('unsafe or escaping artifact paths never produce href, src or replay commands', () => {
  for (const path of ['javascript:alert(1)', 'data:text/html,bad', 'https://evil.test/x', '//evil.test/x', '/etc/passwd', '../secret', 'shots/../../secret', 'shots\\..\\secret', '%2e%2e/secret', '%252e%252e/secret', 'shots/%00secret', 'shots/x?redirect=bad', 'shots/x#bad', 'shots/%ZZ']) {
    const bundle = fixture();
    const record = bundle.capabilities[0].records[0];
    record.screenshot = path;
    record.artifacts = { repro: path, trace: path };
    const html = renderReport(bundle);
    assert.doesNotMatch(html, /class="shot"|Replay instructions|>trace<\/a>/, path);
    assert.match(html, /No screenshot captured/);
  }
});

test('artifact names containing HTML and shell metacharacters stay inert', () => {
  const bundle = fixture();
  const name = 'repros/$(touch nope)`echo no`\'"<x>.json';
  const record = bundle.capabilities[0].records[0];
  record.artifacts = { repro: name };
  record.screenshot = 'shots/" onerror="bad.png';
  const html = renderReport(bundle);
  assert.match(html, /src="shots\/%22%20onerror%3D%22bad.png"/);
  assert.match(html, /replay &#39;repros\/\$\(touch nope\)`echo no`&#39;\\&#39;&#39;&quot;&lt;x&gt;.json&#39;/);
  assert.doesNotMatch(html, /<img[^>]+ onerror=/);
});

test('missing evidence and unknown statuses never silently become successful', () => {
  const bundle = fixture();
  bundle.capabilities = [{ id: 'scene', title: 'Scene', status: 'unknown', records: [{ id: 'empty', label: 'No capture' }] }];
  bundle.graph = { nodes: [{ id: 'unseen', recordId: 'missing' }], edges: [] };
  const html = renderReport(bundle);
  assert.match(html, /No screenshot captured/);
  assert.match(html, /No linked observation/);
  assert.match(html, /<strong>0<\/strong>passed/);
  assert.match(html, /<strong>8<\/strong>not run/);
  assert.doesNotMatch(html, /Open captured state/);
});

test('replay resolves local evidence under absolute output directory and shell-quotes every character', () => {
  const bundle = fixture();
  bundle.meta.outputDir = "/workspace/artifacts/first run's $(printf INJECTED)`printf BAD`";
  bundle.capabilities[0].records[0].artifacts.repro = "evidence/garage's settings.json";
  const html = renderReport(bundle);
  const escaped = html.match(/<pre>(node tools\/ui\/explorer.mjs replay [\s\S]*?)<\/pre>/)[1];
  const command = escaped.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const argument = command.replace('node tools/ui/explorer.mjs replay ', '');
  // Ask the shell to expose its parsed argument, without invoking the CLI.
  // Unquoted command substitutions would change the observed path.
  const parsed = spawnSync('/bin/sh', ['-c', `set -- ${argument}; printf '%s' "$1"`], { encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  assert.equal(parsed.stdout, `${bundle.meta.outputDir}/evidence/garage's settings.json`);
  assert.match(parsed.stdout, /\$\(printf INJECTED\)`printf BAD`/);
});

test('archived run links accept relative evidence only and escape labels', () => {
  const bundle = fixture();
  bundle.meta.history = [
    { label: 'First run <unfixed>', path: 'history/first run/index.html' },
    { label: 'Corrected run', path: 'history/corrected/index.html' },
    { label: 'Bad external', path: 'https://evil.test' },
    { label: 'Bad traversal', path: '../outside/index.html' }
  ];
  const html = renderReport(bundle);
  assert.match(html, /aria-label="Run history"/);
  assert.match(html, /href="history\/first%20run\/index.html">First run &lt;unfixed&gt;/);
  assert.match(html, /href="history\/corrected\/index.html">Corrected run/);
  assert.doesNotMatch(html, />Bad external<|>Bad traversal</);
});

test('inline browser script parses independently and supports filtering without a server', () => {
  const html = renderReport(fixture());
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  const listeners = {};
  const sections = [
    { dataset: { status: 'partial', search: 'garage missing texture' } },
    { dataset: { status: 'not-run', search: 'phone stress' } }
  ];
  const findings = [{ dataset: { search: 'button clipped' } }];
  const elements = {
    search: { value: '', addEventListener: (event, callback) => { listeners.search = callback; } },
    status: { value: 'all', addEventListener: (event, callback) => { listeners.status = callback; } },
    'result-count': {},
    download: { addEventListener() {} }
  };
  const document = {
    getElementById: id => elements[id],
    querySelectorAll: selector => selector === '.capability' ? sections : findings
  };
  new Script(scripts[1][1]).runInNewContext({ document });
  assert.equal(elements['result-count'].textContent, '2 capabilities shown');
  elements.search.value = 'garage';
  listeners.search();
  assert.equal(sections[0].hidden, false);
  assert.equal(sections[1].hidden, true);
  assert.equal(findings[0].hidden, true);
  elements.status.value = 'passed';
  listeners.status();
  assert.equal(elements['result-count'].textContent, '0 capabilities shown');
});

test('writeReport creates portable HTML and faithful JSON together', async () => {
  const artifacts = join(process.cwd(), 'artifacts');
  await mkdir(artifacts, { recursive: true });
  const directory = await mkdtemp(join(artifacts, 'ui-explorer-report-test-'));
  try {
    const bundle = fixture();
    const path = await writeReport(bundle, join(directory, 'nested'));
    assert.equal(path, join(directory, 'nested', 'index.html'));
    const stamped = { ...bundle, meta: { ...bundle.meta, outputDir: resolve(directory, 'nested') } };
    assert.equal(await readFile(path, 'utf8'), renderReport(stamped));
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'nested', 'report.json'), 'utf8')), stamped);
    assert.equal(bundle.meta.outputDir, undefined, 'input bundle is not mutated');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
