"""Hermetic contract fixtures for the hosted Codex reader; no login/network."""
import asyncio
import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import AsyncMock
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('codex_cloud', ROOT / 'tools/ci/codex-cloud.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
ID = '11111111-2222-3333-4444-555555555555'

def entry(text, kind='agentMessage'):
    return {'turnId': 'turn1', 'item': {'id': 'item1', 'type': kind, 'text': text}}

class Contracts(unittest.IsolatedAsyncioTestCase):
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
