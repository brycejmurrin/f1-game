"""Hermetic contract fixtures for the hosted Codex reader; no login/network."""
import asyncio
import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import AsyncMock, patch
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('codex_cloud', ROOT / 'tools/ci/codex-cloud.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
ID = '11111111-2222-3333-4444-555555555555'

def entry(text, kind='agentMessage'):
    return {'turnId': 'turn1', 'item': {'id': 'item1', 'type': kind, 'text': text}}

class Contracts(unittest.IsolatedAsyncioTestCase):
    def control_reader(self, account='account-a', failure=None, gate=None):
        calls = []
        class Reader:
            async def __aenter__(self):
                self.account = account
                return self
            async def __aexit__(self, *_):
                pass
            async def call(self, method, params):
                calls.append((method, params))
                if gate and method == 'thread/start':
                    await gate.wait()
                if method == (failure[0] if isinstance(failure, tuple) else failure):
                    if isinstance(failure, tuple):
                        raise module.Failure(failure[1])
                    raise TimeoutError()
                if method in {'thread/start', 'thread/resume'}:
                    return {'thread': {'id': ID}}
                if method == 'turn/start':
                    return {'turn': {'id': 'turn-1', 'status': 'inProgress'}}
                raise AssertionError(method)
        return Reader, calls

    def test_control_validation_is_closed_and_text_is_byte_bounded(self):
        for value in [None, {'verb': 'delete'}, {'verb': 'start', 'id': ID, 'options': {'requestId': ID}},
                      {'verb': 'start', 'options': {}}, {'verb': 'message', 'id': ID, 'options': {'requestId': ID}},
                      {'verb': 'message', 'id': ID, 'options': {'requestId': ID, 'text': ' '}},
                      {'verb': 'start', 'options': {'requestId': ID, 'approvalPolicy': 'never'}},
                      {'verb': 'start', 'options': {'requestId': ID, 'text': '🏎' * 2049}}]:
            with self.assertRaises(module.Failure):
                module.validate_control(value)

    async def test_control_start_and_replay_never_duplicate_writes(self):
        factory, calls = self.control_reader()
        request = {'verb': 'start', 'options': {'requestId': ID, 'text': 'private prompt'}}
        with tempfile.TemporaryDirectory(dir=ROOT / 'scratch') as directory:
            first = await module.control_route(request, factory, directory)
            second = await module.control_route(request, factory, directory)
            self.assertTrue(first['accepted'])
            self.assertFalse(first['out']['completed'])
            self.assertTrue(second['replayed'])
            self.assertEqual([m for m, _ in calls], ['thread/start', 'turn/start'])
            self.assertEqual(calls[0][1], {'ephemeral': False})
            self.assertEqual(calls[1][1]['clientUserMessageId'], ID)
            receipt = next(Path(directory).rglob('*.json'))
            self.assertNotIn('private prompt', receipt.read_text())
            self.assertEqual(receipt.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(module.Failure) as failure:
                await module.control_route({'verb': 'start', 'options': {'requestId': ID, 'text': 'changed'}}, factory, directory)
            self.assertEqual(failure.exception.code, 'request_id_conflict')
            self.assertEqual(len(calls), 2)

    async def test_control_message_preserves_settings_and_account_scopes_receipts(self):
        request = {'verb': 'message', 'id': ID, 'options': {'requestId': ID, 'text': 'hello'}}
        with tempfile.TemporaryDirectory(dir=ROOT / 'scratch') as directory:
            for account in ['account-a', 'account-b']:
                factory, calls = self.control_reader(account)
                self.assertTrue((await module.control_route(request, factory, directory))['ok'])
                self.assertEqual(calls[0], ('thread/resume', {'threadId': ID, 'excludeTurns': True}))
                self.assertEqual(set(calls[1][1]), {'threadId', 'input', 'clientUserMessageId'})
            self.assertEqual(len(list(Path(directory).rglob('*.json'))), 2)

    async def test_control_ambiguous_delivery_retains_created_id_and_does_not_retry(self):
        factory, calls = self.control_reader(failure='turn/start')
        request = {'verb': 'start', 'options': {'requestId': ID, 'text': 'hello'}}
        with tempfile.TemporaryDirectory(dir=ROOT / 'scratch') as directory:
            result = await module.control_route(request, factory, directory)
            replay = await module.control_route(request, factory, directory)
            self.assertFalse(result['ok'])
            self.assertTrue(result['outcomeUnknown'])
            self.assertEqual(result['out']['threadId'], ID)
            self.assertEqual(result['out']['stage'], 'sending')
            self.assertTrue(replay['replayed'])
            self.assertEqual(len(calls), 2)

    async def test_control_concurrent_same_request_observes_pending_receipt(self):
        gate = asyncio.Event()
        factory, calls = self.control_reader(gate=gate)
        request = {'verb': 'start', 'options': {'requestId': ID}}
        with tempfile.TemporaryDirectory(dir=ROOT / 'scratch') as directory:
            first = asyncio.create_task(module.control_route(request, factory, directory))
            await asyncio.sleep(0)
            second = await module.control_route(request, factory, directory)
            self.assertTrue(second['outcomeUnknown'])
            self.assertTrue(second['replayed'])
            gate.set()
            self.assertTrue((await first)['ok'])
            self.assertEqual([m for m, _ in calls], ['thread/start'])

    async def test_control_invalid_request_is_rejected_before_auth(self):
        factory = AsyncMock()
        with self.assertRaises(module.Failure):
            await module.control_route({'verb': 'message'}, factory)
        factory.assert_not_called()

    async def test_control_only_parse_rejections_are_known_not_admitted(self):
        for code, unknown in [('-32601', False), ('-32602', False), ('-32603', True)]:
            factory, _ = self.control_reader(failure=('turn/start', 'rpc_rejected_' + code))
            with tempfile.TemporaryDirectory(dir=ROOT / 'scratch') as directory:
                result = await module.control_route({'verb': 'start', 'options': {'requestId': ID, 'text': 'hi'}}, factory, directory)
                self.assertFalse(result['ok'])
                self.assertEqual(result['outcomeUnknown'], unknown)
                self.assertEqual(result['out']['threadId'], ID)

    async def test_control_cancelled_claim_is_not_redispatched(self):
        gate = asyncio.Event()
        factory, calls = self.control_reader(gate=gate)
        request = {'verb': 'start', 'options': {'requestId': ID}}
        with tempfile.TemporaryDirectory(dir=ROOT / 'scratch') as directory:
            task = asyncio.create_task(module.control_route(request, factory, directory))
            await asyncio.sleep(0)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            replay = await module.control_route(request, factory, directory)
            self.assertTrue(replay['outcomeUnknown'])
            self.assertTrue(replay['replayed'])
            self.assertEqual(len(calls), 1)

    async def test_control_final_receipt_failure_never_returns_contradictory_success(self):
        factory, calls = self.control_reader()
        original = module.save_receipt
        failed = False
        def failing_save(file, record):
            nonlocal failed
            if record['result']['ok'] and not failed:
                failed = True
                raise OSError('fixture transient receipt write failure')
            return original(file, record)
        request = {'verb': 'start', 'options': {'requestId': ID, 'text': 'hi'}}
        with tempfile.TemporaryDirectory(dir=ROOT / 'scratch') as directory:
            with patch.object(module, 'save_receipt', failing_save):
                result = await module.control_route(request, factory, directory)
            self.assertFalse(result['ok'])
            self.assertNotIn('accepted', result)
            self.assertEqual(result['out']['turnId'], 'turn-1')
            replay = await module.control_route(request, factory, directory)
            self.assertFalse(replay['ok'])
            self.assertTrue(replay['replayed'])
            self.assertEqual(len(calls), 2)

    def test_closed_arguments_and_bounds(self):
        for request in [None, [], {'verb': []}, {'verb': 'send'}, {'verb': 'list', 'id': ID}, {'verb': 'status'},
                        {'verb': 'status', 'id': '../../auth.json'}, {'verb': 'list', 'options': None},
                        {'verb': 'list', 'options': {'limit': True}}, {'verb': 'list', 'options': {'limit': 21}},
                        {'verb': 'transcript', 'id': ID, 'options': {'maxBytes': 255}}, {'verb': 'transcript', 'id': ID, 'options': {'only': []}},
                        {'verb': 'list', 'options': {'token': 'secret'}}, {'verb': 'status', 'id': ID, 'options': {'cursor': 'c'}}]:
            with self.subTest(request=request), self.assertRaises(module.Failure):
                module.validate(copy.deepcopy(request))
        self.assertEqual(module.validate({'verb': 'list', 'options': {'limit': 1.0}})['options']['limit'], 1)

    def test_utf8_fragments_reassemble_without_loss(self):
        page = {'data': [entry('🏎️ α中' * 200)], 'nextCursor': None}
        query = {'id': ID, 'limit': 10, 'only': 'chat'}
        cursor, parts = None, []
        for _ in range(100):
            state = module.decode_cursor(cursor, query)
            out = module.transcript_page(page, query, state, 256)
            self.assertLessEqual(len(out['text'].encode()), 256)
            parts.append(out['text']); cursor = out['nextCursor']
            if cursor is None: break
        self.assertIsNone(cursor)
        record = json.loads(''.join(parts))
        self.assertEqual(record['text'], page['data'][0]['item']['text'])

    def test_changed_page_and_changed_query_are_explicit(self):
        query = {'id': ID, 'limit': 10, 'only': 'chat'}
        out = module.transcript_page({'data': [entry('x' * 2000)]}, query, module.decode_cursor(None, query), 256)
        with self.assertRaises(module.Failure) as caught:
            module.transcript_page({'data': [entry('y' * 2000)]}, query, module.decode_cursor(out['nextCursor'], query), 256)
        self.assertEqual(caught.exception.code, 'stale_cursor')
        with self.assertRaises(module.Failure):
            module.decode_cursor(out['nextCursor'], {**query, 'only': 'all'})

    def test_filtered_empty_page_advances_and_repeated_cursor_refuses(self):
        query = {'id': ID, 'limit': 10, 'only': 'chat'}
        page = {'data': [entry('raw', 'commandExecution')], 'nextCursor': 'provider2'}
        out = module.transcript_page(page, query, module.decode_cursor(None, query), 256)
        self.assertEqual(out['text'], '')
        state = module.decode_cursor(out['nextCursor'], query)
        self.assertEqual(state['p'], 'provider2')
        with self.assertRaises(module.Failure): module.transcript_page(page, query, state, 256)

    def test_cursor_validation_and_codepoint_boundary(self):
        query = {'id': ID, 'limit': 10, 'only': 'chat'}
        for token in ['../secret', 'v1.@@', 'v1.e30']:
            with self.assertRaises(module.Failure): module.decode_cursor(token, query)
        page = {'data': [entry('🏎' * 50)]}
        data = module.canonical(module.chat_item(page['data'][0])) + b'\n'
        index = data.index('🏎'.encode()) + 1
        with self.assertRaises(module.Failure):
            module.transcript_page(page, query, {**module.decode_cursor(None, query), 'o': index, 'h': module.digest(data)}, 256)

    def test_raw_records_are_not_silently_projected(self):
        query = {'id': ID, 'limit': 10, 'only': 'all'}
        page = {'data': [entry('raw tool payload', 'commandExecution')]}
        out = module.transcript_page(page, query, module.decode_cursor(None, query), 8192)
        self.assertEqual(json.loads(out['text']), page['data'][0])
        self.assertIsNone(out['nextCursor'])

    async def test_rpc_rejects_mutation_and_ignores_unsolicited_request(self):
        reader = module.HostedReader(); reader.ws = AsyncMock()
        for method in ['turn/start', 'thread/resume', 'thread/archive', 'account/logout']:
            with self.assertRaises(module.Failure): await reader.call(method, {})
        reader.ws.send.assert_not_called()
        reader.ws.recv.side_effect = [json.dumps({'id': 1, 'method': 'server/request'}), json.dumps({'id': 1, 'result': {'data': [1]}})]
        self.assertEqual(await reader.call('thread/list', {}), {'data': [1]})

    async def test_status_and_list_use_only_read_rpcs(self):
        source = AsyncMock(); source.call.return_value = {'thread': {'id': ID, 'name': 'n', 'status': {'type': 'idle'}}}
        manager = AsyncMock(); manager.__aenter__.return_value = source
        result = await module.route({'verb': 'status', 'id': ID}, factory=lambda: manager)
        self.assertTrue(result['ok'])
        source.call.assert_awaited_once_with('thread/read', {'threadId': ID, 'includeTurns': False})
        source.call.reset_mock(); source.call.return_value = {'data': [], 'nextCursor': None}
        await module.route({'verb': 'list', 'options': {'archived': True, 'cursor': 'next'}}, factory=lambda: manager)
        source.call.assert_awaited_once_with('thread/list', {'limit': 10, 'archived': True, 'cursor': 'next'})

    async def test_bad_cursor_fails_before_authentication(self):
        factory = AsyncMock()
        with self.assertRaises(module.Failure):
            await module.route({'verb': 'transcript', 'id': ID, 'options': {'cursor': 'bad'}}, factory=factory)
        factory.assert_not_called()

if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromTestCase(Contracts))
    print(json.dumps({'ok': result.wasSuccessful(), 'tests': result.testsRun}))
    sys.exit(0 if result.wasSuccessful() else 1)
