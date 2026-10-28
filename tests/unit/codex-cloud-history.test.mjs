// Offline native-protocol fixtures: no account, credentials, network or WebSocket dependency.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const setup = String.raw`
import asyncio, importlib.util, json, pathlib, tempfile
root = pathlib.Path.cwd()
spec = importlib.util.spec_from_file_location('cloud_history', root/'tools/env/codex-cloud-history.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
(root/'scratch').mkdir(exist_ok=True)

def item(identity, kind, **fields):
    return {'turnId': 'turn-native', 'item': {'id': identity, 'type': kind, **fields}}

class FakeClient:
    def __init__(self, fail_child=False, foreign=False):
        self.calls = []
        self.fail_child = fail_child
        self.foreign = foreign
    async def call(self, method, params):
        assert method in m.READ_METHODS
        self.calls.append((method, dict(params)))
        if method == 'thread/list':
            assert params['archived'] is True
            if params.get('cursor') == 'roots-next':
                return {'data': [{'id': 'archived-b'}], 'nextCursor': None}
            return {'data': [{'id': 'archived-a'}], 'nextCursor': 'roots-next'}
        identity = params['threadId']
        if method == 'thread/read':
            parent = 'archived-a' if identity == 'child-a' else None
            return {'thread': {'id': identity, 'parentThreadId': parent, 'source': 'cli', 'turns': []}}
        assert method == 'thread/items/list'
        if identity == 'foreign-root':
            raise AssertionError('unrelated root contents requested')
        if identity == 'child-a' and self.fail_child:
            raise TimeoutError('synthetic failure, never log transport text')
        if identity == 'archived-a' and params.get('cursor') != 'items-next':
            rows = [item('command', 'commandExecution', command='printf hello', aggregatedOutput=None, exitCode=0),
                    item('hidden', 'reasoning', text='excluded synthetic fixture'),
                    item('child-event', 'subAgentActivity', agentThreadId='child-a')]
            if self.foreign:
                rows.append(item('foreign-event', 'collabAgentToolCall', receiverThreadIds=[],
                                 agentsStates={'foreign-root': {'status': 'complete'}}))
            return {'data': rows, 'nextCursor': 'items-next'}
        if identity == 'archived-a':
            return {'data': [item('future', 'futureNativeType', payload={'native': [1, 2, 3]})], 'nextCursor': None}
        return {'data': [item(identity+'-message', 'agentMessage', text='visible message')], 'nextCursor': None}
`;

function fixture(code) {
  const result = spawnSync("python3", ["-B", "-c", setup + code], {
    cwd: root, encoding: "utf8", timeout: 15_000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("archived pagination preserves native visible data and follows verified descendants", () => fixture(String.raw`
async def check():
    with tempfile.TemporaryDirectory(dir=root/'scratch') as directory:
        output = pathlib.Path(directory)
        client = FakeClient()
        state = await m.Exporter(client, output, archived=True).run()
        manifest = m.build_share(output, state, include_markdown=True)
        assert manifest['captureTraversalComplete'] is True
        assert set(state['roots']) == {'archived-a', 'archived-b'}
        assert set(state['threads']) == {'archived-a', 'archived-b', 'child-a'}
        path = output/'share/threads/archived-a/transcript.json'
        if not path.exists():
            path = output/'share/threads/archived-a/visible-history.json'
        document = json.loads(path.read_text())
        rows = {m.item_of(row)['id']: row for row in document['items']}
        assert rows['command']['item']['aggregatedOutput'] is None
        assert rows['command']['item']['exitCode'] == 0
        assert rows['future']['item']['payload'] == {'native': [1, 2, 3]}
        assert 'hidden' not in rows
        for path in output.rglob('*.json'):
            assert 'excluded synthetic fixture' not in path.read_text()
        pages = sorted((output/'share/threads/archived-a/pages').glob('*.json'))
        assert len(pages) == 2
        assert json.loads(pages[-1].read_text())['response']['nextCursor'] is None
asyncio.run(check())
`));

test("failed descendants remain incomplete and resume retries without relisting frozen roots", () => fixture(String.raw`
async def check():
    with tempfile.TemporaryDirectory(dir=root/'scratch') as directory:
        output = pathlib.Path(directory)
        state = await m.Exporter(FakeClient(fail_child=True), output, archived=True).run()
        assert m.build_share(output, state)['captureTraversalComplete'] is False
        assert state['threads']['child-a']['failure']['errorClass'] == 'TimeoutError'
        retry = FakeClient()
        state = await m.Exporter(retry, output, archived=True, resume=True).run()
        assert m.build_share(output, state)['captureTraversalComplete'] is True
        assert not any(method == 'thread/list' for method, _ in retry.calls)
        assert not any(method == 'thread/items/list' and p['threadId'] == 'archived-a' for method, p in retry.calls)
asyncio.run(check())
`));

test("collab state references cannot authorize reading an unrelated root", () => fixture(String.raw`
async def check():
    with tempfile.TemporaryDirectory(dir=root/'scratch') as directory:
        output = pathlib.Path(directory)
        client = FakeClient(foreign=True)
        state = await m.Exporter(client, output, archived=True).run()
        assert 'foreign-root' not in state['threads']
        assert any(edge['childThreadId'] == 'foreign-root' and edge['status'] != 'accepted' for edge in state['edges'])
        assert not any(method == 'thread/items/list' and p['threadId'] == 'foreign-root' for method, p in client.calls)
asyncio.run(check())
`));

test("credential redaction removes nested structured secrets and their earlier echoes", () => fixture(String.raw`
secret = 'synthetic-history-credential-123456789'
github = 'ghp_' + 'Z' * 36
data = [{'item': {'type': 'agentMessage', 'text': 'earlier echo: '+secret+' '+github}},
        {'result': {'siwc_bypass_bearer_token': secret}},
        {'text': json.dumps({'credentials': {'password': secret}})}]
redactor = m.Redactor()
redactor.collect(data)
clean = redactor.redact(data)
assert secret not in json.dumps(clean)
assert github not in json.dumps(clean)
assert clean[1]['result']['siwc_bypass_bearer_token'] == m.MARKER
assert m.MARKER in clean[0]['item']['text']
assert m.metadata_parent({'source': {'subAgent': 'review'}}) is None
assert m.metadata_parent({'forkedFromId': 'unrelated-fork'}) is None
short = m.Redactor()
short.collect({'password': 'a'})
assert short.redact({'password': 'a'})['password'] == m.MARKER
assert short.redact('a') == m.MARKER
assert short.redact('saved data') == 'saved data'
assert 'password=a' not in short.redact('password=a')
`));

test("credential map keys redact without dropping collisions or mutating schema labels", () => fixture(String.raw`
from urllib.parse import quote
first = 'synthetic-opaque-"key-credential-123456'
second = 'ghp_' + 'Q' * 36
data = [{first: 'left-value', second: 'right-value', 'schemaField': 'unchanged', m.MARKER: 'existing-marker-value'},
        {'apiKey': first}, {'nested': json.dumps({first: 1, second: 2})},
        {'url': 'https://example.invalid/?credential='+quote(first, safe='')}]
redactor = m.Redactor()
redactor.collect(data)
clean = redactor.redact(data)
serialized = json.dumps(clean)
assert first not in serialized and second not in serialized
assert quote(first, safe='') not in serialized
assert set(clean[0].values()) == {'left-value', 'right-value', 'unchanged', 'existing-marker-value'}
assert len(clean[0]) == 4
assert clean[0]['schemaField'] == 'unchanged'
assert clean[0][m.MARKER] == 'existing-marker-value'
assert clean[1]['apiKey'] == m.MARKER
assert set(json.loads(clean[2]['nested']).values()) == {1, 2}
assert len(json.loads(clean[2]['nested'])) == 2
assert redactor.redact(data) == clean
`));

test("partial packaging requires every selected root and accepted reference target", () => fixture(String.raw`
with tempfile.TemporaryDirectory(dir=root/'scratch') as directory:
    output = pathlib.Path(directory)
    exporter = m.Exporter(FakeClient(), output, threads=['selected-root'])
    state = exporter.state
    manifest = m.build_share(output, state)
    assert manifest['threadCount'] == 0
    assert manifest['captureTraversalComplete'] is False
    state['threads']['selected-root'] = {'done': True}
    assert m.build_share(output, state)['captureTraversalComplete'] is True
    state['edges'].append({'parentThreadId': 'selected-root', 'childThreadId': 'accepted-child',
                           'itemId': 'native-child', 'referenceKind': 'subAgentActivity.agentThreadId',
                           'requiresAncestry': True, 'status': 'accepted'})
    assert m.build_share(output, state)['captureTraversalComplete'] is False
    state['threads']['accepted-child'] = {'done': True}
    assert m.build_share(output, state)['captureTraversalComplete'] is True
`));

test("cursor failures, scope changes and mutating methods fail closed", () => fixture(String.raw`
progress = {}
m.next_page({'data': [], 'nextCursor': 'repeat'}, progress)
for page in ({'data': [], 'nextCursor': 'repeat'}, {'data': []}):
    try:
        m.next_page(page, progress)
        raise AssertionError('invalid page accepted')
    except m.ExportError:
        pass
try:
    m.thread_id('../escape')
    raise AssertionError('unsafe identity accepted')
except m.ExportError:
    pass
async def check():
    try:
        await m.HostedClient([]).call('thread/resume', {})
        raise AssertionError('mutating method accepted')
    except m.ExportError:
        pass
    with tempfile.TemporaryDirectory(dir=root/'scratch') as directory:
        output = pathlib.Path(directory)
        exporter = m.Exporter(FakeClient(), output, threads=['archived-a'])
        exporter.checkpoint()
        assert (output/'_private/state.json').stat().st_mode & 0o777 == 0o600
        try:
            m.Exporter(FakeClient(), output, threads=['other-root'], resume=True)
            raise AssertionError('resume broadened scope')
        except m.ExportError:
            pass
asyncio.run(check())
`));

test("private output inside the checkout must be a git-ignored path", () => fixture(String.raw`
m.refuse_tracked_output(root/'scratch/codex-history-probe')
try:
    m.refuse_tracked_output(root/'docs/codex-history-probe')
    raise AssertionError('tracked output accepted')
except m.ExportError as error:
    assert str(error) == 'output_not_gitignored'
with tempfile.TemporaryDirectory() as outside:
    m.refuse_tracked_output(pathlib.Path(outside)/'export')
`));
