#!/usr/bin/env python3
"""Hosted Codex history transport; --control separately enables start/message.
Uses the existing CLI login, fixed WSS origin and no redirects. Protocol references:
https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md
https://websockets.readthedocs.io/en/16.0/reference/asyncio/client.html
"""
# @doc Bounded Codex Cloud history and explicit --control writes with replay receipts.
import asyncio
import base64
import hashlib
import json
import logging
import math
import os
from pathlib import Path
import re
import sys

ENDPOINT = 'wss://codex-cloud-backend.chatgpt.com/'
OPTIONS = {'capabilities': set(), 'list': {'limit', 'cursor', 'archived'}, 'status': set(), 'transcript': {'limit', 'cursor', 'only', 'maxBytes'}}
METHODS = {'initialize', 'thread/list', 'thread/read', 'thread/items/list'}
CONTROL_METHODS = {'initialize', 'thread/start', 'thread/read', 'thread/resume', 'turn/start'}
UUID = re.compile(r'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$', re.I)
class Failure(Exception):
    def __init__(self, code, fix=''):
        self.code, self.fix = code, fix
        super().__init__(code)

def validate(request):
    if type(request) is not dict or set(request) - {'verb', 'id', 'options'}:
        raise Failure('bad_args')
    verb, options = request.get('verb', 'capabilities'), request.get('options', {})
    if type(verb) is not str or verb not in OPTIONS or type(options) is not dict or set(options) - OPTIONS[verb]:
        raise Failure('bad_args')
    needs_id = verb in {'status', 'transcript'}
    if needs_id and (type(request.get('id')) is not str or not UUID.fullmatch(request['id'])):
        raise Failure('bad_args')
    if not needs_id and 'id' in request:
        raise Failure('bad_args')
    for key, low, high in [('limit', 1, 20), ('maxBytes', 256, 8192)]:
        if key in options:
            value = options[key]
            if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high or int(value) != value:
                raise Failure('bad_args')
            options[key] = int(value)
    if 'cursor' in options and (type(options['cursor']) is not str or not options['cursor'] or len(options['cursor'].encode()) > 8192):
        raise Failure('bad_args')
    if 'archived' in options and type(options['archived']) is not bool:
        raise Failure('bad_args')
    if 'only' in options and (type(options['only']) is not str or options['only'] not in {'chat', 'all'}):
        raise Failure('bad_args')
    return {'verb': verb, 'options': options, **({'id': request['id'].lower()} if needs_id else {})}

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')

def digest(value):
    return hashlib.sha256(value).hexdigest()

def provider_cursor(value):
    if value is not None and (type(value) is not str or not value or len(value.encode()) > 2048):
        raise Failure('invalid_provider_cursor')
    return value

def decode_cursor(token, query):
    if token is None:
        return {'p': None, 'o': 0, 'h': None, 'q': digest(canonical(query))}
    try:
        if not token.startswith('v1.') or not re.fullmatch(r'[A-Za-z0-9_-]+', token[3:]):
            raise ValueError()
        payload = token[3:]
        state = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
        if type(state) is not dict or set(state) != {'p', 'o', 'h', 'q'}:
            raise ValueError()
        if state['q'] != digest(canonical(query)) or type(state['o']) is not int or state['o'] < 0:
            raise ValueError()
        if state['h'] is not None and not re.fullmatch('[a-f0-9]{64}', state['h']):
            raise ValueError()
        if state['o'] and state['h'] is None:
            raise ValueError()
        provider_cursor(state['p'])
        return state
    except (ValueError, TypeError, KeyError, Failure):
        raise Failure('bad_cursor', 'Keep the id, limit and only options unchanged.') from None

def encode_cursor(state):
    return 'v1.' + base64.urlsafe_b64encode(canonical(state)).decode().rstrip('=')

def chat_item(entry):
    item = entry['item']
    common = {'id': item.get('id'), 'turnId': entry.get('turnId'), 'type': item.get('type')}
    if item.get('type') == 'agentMessage':
        return {**common, 'role': 'assistant', 'text': item.get('text', ''), 'phase': item.get('phase')}
    if item.get('type') == 'userMessage':
        text = '\n'.join(c.get('text', '') if c.get('type') == 'text' else '[attachment/structured input: ' + str(c.get('type', 'unknown')) + ']' for c in item.get('content', []))
        return {**common, 'role': 'user', 'text': text}
    return None

def transcript_page(page, query, state, budget):
    selected = [chat_item(e) if query['only'] == 'chat' else e for e in page['data']]
    selected = [e for e in selected if e is not None]
    data = b''.join(canonical(e) + b'\n' for e in selected)
    fingerprint, offset = digest(data), state['o']
    if state['h'] is not None and state['h'] != fingerprint:
        raise Failure('stale_cursor', 'This page changed; restart transcript without its cursor.')
    if offset > len(data):
        raise Failure('bad_cursor')
    try:
        data[:offset].decode('utf-8')
    except UnicodeDecodeError:
        raise Failure('bad_cursor') from None
    text = data[offset:offset + budget].decode('utf-8', errors='ignore')
    end = offset + len(text.encode('utf-8'))
    next_provider = provider_cursor(page.get('nextCursor'))
    if end < len(data):
        next_state = {**state, 'o': end, 'h': fingerprint}
    elif next_provider is not None:
        if next_provider == state['p']:
            raise Failure('repeated_cursor')
        next_state = {'p': next_provider, 'o': 0, 'h': None, 'q': state['q']}
    else:
        next_state = None
    return {'text': text, 'format': 'jsonl-fragment', 'encoding': 'utf-8', 'offset': offset, 'bytesReturned': end - offset,
            'pageBytes': len(data), 'selectedItems': len(selected), 'providerItems': len(page['data']),
            'nextCursor': encode_cursor(next_state) if next_state else None, 'snapshot': True, 'untrustedContent': True}

def clipped(value, maximum):
    data = str(value or '').encode('utf-8')
    return data[:maximum].decode('utf-8', errors='ignore')

def summary(thread):
    return {'id': clipped(thread.get('id'), 80), 'name': clipped(thread.get('name'), 160),
            'status': clipped(thread.get('status', {}).get('type'), 64), 'createdAt': thread.get('createdAt'),
            'updatedAt': thread.get('updatedAt'), 'historyMode': clipped(thread.get('historyMode'), 32)}

class HostedReader:
    def __init__(self, allowed_methods=None):
        self.ws, self.seq, self.account = None, 0, None
        self.allowed_methods = METHODS if allowed_methods is None else frozenset(allowed_methods)
    async def __aenter__(self):
        try:
            import websockets
        except ImportError:
            raise Failure('dependency_missing', 'Install websockets==16.0 on the server Python environment.') from None
        logging.getLogger('websockets').disabled = True
        class NoRedirect(websockets.connect):
            def process_redirect(self, error):
                return error
        try:
            proc = await asyncio.create_subprocess_exec(os.environ.get('APEX_CODEX_BIN', 'codex'), 'app-server', '--stdio',
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
        except FileNotFoundError:
            raise Failure('codex_unavailable', 'Install and sign in to Codex CLI on the MCP server host.') from None
        async def local(number, method, params):
            proc.stdin.write(canonical({'id': number, 'method': method, 'params': params}) + b'\n')
            await proc.stdin.drain()
            async with asyncio.timeout(10):
                while True:
                    line = await proc.stdout.readline()
                    if not line:
                        raise Failure('auth_unavailable')
                    value = json.loads(line)
                    if value.get('id') == number:
                        if 'error' in value:
                            raise Failure('auth_unavailable')
                        return value.get('result', {})
        try:
            await local(0, 'initialize', {'clientInfo': {'name': 'apex_codex_history', 'version': '1.0'}, 'capabilities': {'experimentalApi': True}})
            proc.stdin.write(b'{"method":"initialized","params":{}}\n')
            await proc.stdin.drain()
            auth = await local(1, 'getAuthStatus', {'includeToken': True, 'refreshToken': False})
            token = auth.get('authToken')
            if auth.get('authMethod') != 'chatgpt' or not token:
                raise Failure('chatgpt_login_required', 'Use the existing Codex CLI login on the MCP server host.')
            try:
                segment = token.split('.')[1]
                claims = json.loads(base64.urlsafe_b64decode(segment + '=' * (-len(segment) % 4)))
                account = claims['https://api.openai.com/auth']['chatgpt_account_id']
                self.account = account
            except Exception:
                raise Failure('account_routing_unavailable') from None
            self.ws = await NoRedirect(ENDPOINT, additional_headers={'Authorization': 'Bearer ' + token, 'ChatGPT-Account-ID': account},
                user_agent_header='apex-codex-history/1.0', open_timeout=10, close_timeout=2,
                max_size=128 << 20, max_queue=2, ping_interval=None)
        finally:
            proc.stdin.close()
            try:
                await asyncio.wait_for(proc.wait(), 3)
            except TimeoutError:
                proc.terminate()
                await proc.wait()
        try:
            await self.call('initialize', {'clientInfo': {'name': 'apex_codex_history', 'version': '1.0'}, 'capabilities': {'experimentalApi': True}})
            await self.ws.send('{"method":"initialized","params":{}}')
        except BaseException:
            await self.ws.close()
            raise
        return self
    async def __aexit__(self, *_):
        if self.ws:
            await self.ws.close()
    async def call(self, method, params):
        if method not in self.allowed_methods:
            raise Failure('read_only')
        self.seq += 1
        number = self.seq
        await self.ws.send(canonical({'id': number, 'method': method, 'params': params}).decode())
        async with asyncio.timeout(20):
            while True:
                value = json.loads(await self.ws.recv())
                if value.get('id') != number or not ('result' in value or 'error' in value):
                    continue
                if 'error' in value:
                    raise Failure('rpc_rejected_' + str(value['error'].get('code')))
                return value.get('result', {})

async def route(request, factory=HostedReader):
    request = validate(request)
    verb, options = request['verb'], request['options']
    if verb == 'capabilities':
        return {'ok': True, 'verb': verb, 'readOnly': True, 'verbs': list(OPTIONS)}
    limit = options.get('limit', 10)
    query = {'id': request.get('id'), 'limit': limit, 'only': options.get('only', 'chat')}
    state = decode_cursor(options.get('cursor'), query) if verb == 'transcript' else None
    async with factory() as reader:
        if verb == 'list':
            cursor = provider_cursor(options.get('cursor'))
            page = await reader.call('thread/list', {'limit': limit, 'archived': options.get('archived', False), **({'cursor': cursor} if cursor else {})})
            out = {'sessions': [summary(t) for t in page['data']], 'nextCursor': provider_cursor(page.get('nextCursor')), 'archived': options.get('archived', False)}
        elif verb == 'status':
            value = await reader.call('thread/read', {'threadId': request['id'], 'includeTurns': False})
            out = summary(value['thread'])
        else:
            page = await reader.call('thread/items/list', {'threadId': request['id'], 'limit': limit, 'sortDirection': 'asc', **({'cursor': state['p']} if state['p'] else {})})
            out = transcript_page(page, query, state, options.get('maxBytes', 4096))
    return {'ok': True, 'verb': verb, 'readOnly': True, 'out': out}

def validate_control(request):
    if type(request) is not dict or set(request) - {'verb', 'id', 'options'}:
        raise Failure('bad_args')
    verb, options = request.get('verb'), request.get('options', {})
    if type(verb) is not str or verb not in {'start', 'message'} or type(options) is not dict or set(options) - {'requestId', 'text'}:
        raise Failure('bad_args')
    if type(options.get('requestId')) is not str or not UUID.fullmatch(options['requestId']):
        raise Failure('bad_args')
    if verb == 'message':
        if type(request.get('id')) is not str or not UUID.fullmatch(request['id']) or 'text' not in options:
            raise Failure('bad_args')
    elif 'id' in request:
        raise Failure('bad_args')
    if 'text' in options and (type(options['text']) is not str or not options['text'].strip() or len(options['text'].encode()) > 8192):
        raise Failure('bad_args')
    return {'verb': verb, **({'id': request['id'].lower()} if verb == 'message' else {}),
            'options': {**options, 'requestId': options['requestId'].lower()}}

def save_receipt(file, value):
    # Replace atomically; no prompts, bearer tokens or provider diagnostics are persisted.
    temporary = file.with_suffix('.' + str(os.getpid()) + '.tmp')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(canonical(value))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, file)
    finally:
        temporary.unlink(missing_ok=True)

async def control_route(request, factory=None, journal_dir=None):
    request = validate_control(request)
    verb, options = request['verb'], request['options']
    factory = factory or (lambda: HostedReader(CONTROL_METHODS))
    async with factory() as reader:
        if type(reader.account) is not str or not reader.account:
            raise Failure('account_routing_unavailable')
        directory = Path(journal_dir or Path(__file__).resolve().parents[2] / 'artifacts/run/codex-control') / digest(reader.account.encode())
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        file = directory / (options['requestId'] + '.json')
        fingerprint = digest(canonical(request))
        result = {'ok': False, 'verb': verb, 'readOnly': False, 'error': 'outcome_unknown', 'outcomeUnknown': True,
                  'out': {'requestId': options['requestId'], 'threadId': request.get('id'), 'stage': 'claimed'}}
        record = {'fingerprint': fingerprint, 'result': result}
        try:
            fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            try:
                saved = json.loads(file.read_bytes())
            except (ValueError, OSError):
                raise Failure('receipt_unreadable', 'Do not resend with a new requestId; inspect the host receipt.') from None
            if saved.get('fingerprint') != fingerprint:
                raise Failure('request_id_conflict', 'This requestId belongs to a different request.')
            return {**saved['result'], 'replayed': True}
        with os.fdopen(fd, 'wb') as stream:
            stream.write(canonical(record))
            stream.flush()
            os.fsync(stream.fileno())
        def checkpoint(stage):
            result['out']['stage'] = stage
            save_receipt(file, record)
        try:
            if verb == 'start':
                checkpoint('creating')
                value = await reader.call('thread/start', {'ephemeral': False})
                thread_id = value['thread']['id']
                if type(thread_id) is not str or not UUID.fullmatch(thread_id):
                    raise Failure('invalid_response')
                result['out']['threadId'] = thread_id
                result['out']['created'] = True
                checkpoint('created')
            else:
                thread_id = request['id']
                # Preserve existing settings; no permission/instruction or cwd overrides.
                checkpoint('resuming')
                value = await reader.call('thread/resume', {'threadId': thread_id, 'excludeTurns': True})
                if value['thread']['id'].lower() != thread_id:
                    raise Failure('invalid_response')
                checkpoint('resumed')
            if 'text' in options:
                checkpoint('sending')
                value = await reader.call('turn/start', {'threadId': thread_id, 'input': [
                    {'type': 'text', 'text': options['text'], 'text_elements': []}], 'clientUserMessageId': options['requestId']})
                turn = value['turn']
                if type(turn.get('id')) is not str or not turn['id']:
                    raise Failure('invalid_response')
                result['out'].update(turnId=clipped(turn['id'], 80), status=clipped(turn.get('status'), 64))
            result.update(ok=True, accepted=True, outcomeUnknown=False)
            result.pop('error', None)
            result['out'].update(stage='accepted', completed=False)
            save_receipt(file, record)
        except BaseException as error:
            # A transport failure after dispatch may have been admitted. Never retry writes.
            result['ok'] = False
            result.pop('accepted', None)
            result['error'] = error.code if isinstance(error, Failure) else 'outcome_unknown'
            result['outcomeUnknown'] = not (isinstance(error, Failure) and error.code in {'rpc_rejected_-32601', 'rpc_rejected_-32602'})
            result['fix'] = 'Replay the identical request to inspect this receipt. Do not resend with a new requestId.'
            save_receipt(file, record)
            if isinstance(error, (KeyboardInterrupt, SystemExit, asyncio.CancelledError)):
                raise
        return result

async def main():
    verb = 'unknown'
    try:
        input_limit = 65536 if sys.argv[1:] == ['--control'] else 16384
        raw = sys.stdin.buffer.read(input_limit + 1)
        if len(raw) > input_limit:
            raise Failure('input_limit')
        request = json.loads(raw)
        if isinstance(request, dict) and type(request.get('verb')) is str and request.get('verb') in {*OPTIONS, 'start', 'message'}:
            verb = request['verb']
        if sys.argv[1:] not in ([], ['--control']):
            raise Failure('bad_args')
        result = await asyncio.wait_for((control_route if sys.argv[1:] else route)(request), 55)
    except Failure as error:
        result = {'ok': False, 'verb': verb, 'error': error.code, 'fix': error.fix}
    except Exception as error:
        # Exception strings/tracebacks can contain HTTP headers or CLI output.
        status = getattr(getattr(error, 'response', None), 'status_code', None)
        code = 'http_' + str(status) if type(status) is int else 'transport_' + type(error).__name__
        result = {'ok': False, 'verb': verb, 'error': code}
    encoded = canonical(result)
    if len(encoded) > 65536:
        encoded = canonical({'ok': False, 'verb': verb, 'error': 'output_limit'})
    sys.stdout.buffer.write(encoded + b'\n')
    return 0 if result['ok'] else 1
if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
