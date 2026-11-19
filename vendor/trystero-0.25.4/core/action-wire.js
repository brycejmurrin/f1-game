import { all, alloc, decodeBytes, encodeBytes, fromJson, libName, mkErr, noOp, resetTimer, toJson } from "./utils.js";
//#region src/action-wire.ts
const TypedArray = Object.getPrototypeOf(Uint8Array);
const typeByteLimit = 32;
const typeIndex = 0;
const nonceIndex = 32;
const tagIndex = 34;
const progressIndex = 35;
const payloadIndex = 36;
const chunkSize = 16 * 2 ** 10 - payloadIndex;
const oneByteMax = 255;
const twoByteMax = 65535;
const buffLowEvent = "bufferedamountlow";
const channelCloseEvent = "close";
const channelErrorEvent = "error";
const backpressureWaitTimeoutMs = 1e4;
// Apex local hardening: bound incomplete/deferred input owned by a remote peer.
// Keep generous room for legitimate file actions; the game uses much smaller frames.
const receiveTimeoutMs = 30000;
const maxMessageBytes = 16 * 1024 * 1024;
const maxPeerBytes = 32 * 1024 * 1024;
const maxPeerMessages = 64;
const maxDeferredBytes = 8 * 1024 * 1024;
const maxDeferredMessages = 128;
const toByteArray = (value) => value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
const waitForBufferedAmountLow = (channel, timeoutMs = backpressureWaitTimeoutMs) => {
	if (channel.readyState !== "open" || channel.bufferedAmount <= channel.bufferedAmountLowThreshold) return Promise.resolve(channel.readyState === "open");
	return new Promise((res) => {
		let settled = false;
		let timeout = null;
		const finish = (didDrain) => {
			if (settled) return;
			settled = true;
			channel.removeEventListener(buffLowEvent, onBufferLow);
			channel.removeEventListener(channelCloseEvent, onCloseOrError);
			channel.removeEventListener(channelErrorEvent, onCloseOrError);
			resetTimer(timeout);
			res(didDrain);
		};
		const onBufferLow = () => finish(true);
		const onCloseOrError = () => finish(false);
		channel.addEventListener(buffLowEvent, onBufferLow);
		channel.addEventListener(channelCloseEvent, onCloseOrError);
		channel.addEventListener(channelErrorEvent, onCloseOrError);
		timeout = setTimeout(() => finish(false), timeoutMs);
		if (channel.readyState !== "open") {
			finish(false);
			return;
		}
		if (channel.bufferedAmount <= channel.bufferedAmountLowThreshold) finish(true);
	});
};
const createActionWireManager = ({ getPeer, getPeerIds, canReceiveFromPeer, throwIfAborted }) => {
	const actions = Object.create(null);
	const actionsCache = Object.create(null);
	const pendingTransmissions = new Map();
	const pendingActionPayloads = new Map();
	let deferredBytes = 0, deferredCount = 0;
	const expire = (f) => {
		const timer = setTimeout(f, receiveTimeoutMs);
		timer?.unref?.(); // Node fixtures must not be held open by remote input.
		return timer;
	};
	const forgetTransmission = (id, key) => {
		const peer = pendingTransmissions.get(id), target = peer?.messages.get(key);
		if (!target) return;
		clearTimeout(target.timer);
		peer.bytes -= target.bytes;
		peer.messages.delete(key);
		if (!peer.messages.size && !peer.exhausted) pendingTransmissions.delete(id);
	};
	const blockTransmission = (id, key) => {
		const peer = pendingTransmissions.get(id), target = peer?.messages.get(key);
		if (!target) return;
		clearTimeout(target.timer);
		peer.bytes -= target.bytes; target.bytes = 0;
		target.chunks = []; target.meta = void 0; target.blocked = true;
		// Keep this bounded key until its final frame or peer cleanup. Deleting it
		// on expiry lets a late final chunk publish a silently truncated suffix.
	};
	const forgetDeferred = (type, entry) => {
		const pending = pendingActionPayloads.get(type);
		const i = pending?.indexOf(entry) ?? -1;
		if (i < 0) return;
		clearTimeout(entry.timer);
		pending.splice(i, 1);
		deferredBytes -= entry.bytes; deferredCount--;
		if (!pending.length) pendingActionPayloads.delete(type);
	};
	const iterate = (targets, f, { includePending = false } = {}) => (targets ? Array.isArray(targets) ? targets : [targets] : getPeerIds(includePending)).flatMap((id) => {
		const peer = getPeer(id, includePending);
		if (!peer) {
			console.warn(`${libName}: no peer with id ${id} found`);
			return [];
		}
		return [Promise.resolve(f(id, peer))];
	});
	const makeInternalAction = (type, options = {}) => {
		const cached = actionsCache[type];
		if (actions[type] && cached) {
			const cachedOptions = actions[type].options;
			if (cachedOptions.sendToPending !== Boolean(options.sendToPending) || cachedOptions.receiveWhilePending !== Boolean(options.receiveWhilePending)) throw mkErr(`action type "${type}" cannot be redefined`);
			return cached;
		}
		if (!type) throw mkErr("action type argument is required");
		const typeBytes = encodeBytes(type);
		if (typeBytes.byteLength > typeByteLimit) throw mkErr(`action type string "${type}" (${typeBytes.byteLength}b) exceeds byte limit (${typeByteLimit}). Hint: choose a shorter name.`);
		const normalizedOptions = {
			sendToPending: Boolean(options.sendToPending),
			receiveWhilePending: Boolean(options.receiveWhilePending)
		};
		const typeBytesPadded = new Uint8Array(typeByteLimit);
		typeBytesPadded.set(typeBytes);
		let nonce = 0;
		actions[type] = {
			onComplete: noOp,
			onProgress: noOp,
			setOnComplete: (f) => {
				actions[type].onComplete = f;
				const pending = pendingActionPayloads.get(type);
				if (pending?.length) {
					const ready = [...pending];
					ready.forEach(entry => forgetDeferred(type, entry));
					ready.forEach(({ payload, peerId, metadata }) => f(payload, peerId, metadata));
				}
			},
			setOnProgress: (f) => {
				actions[type].onProgress = f;
			},
			send: async (data, targets, meta, onProgress, signal) => {
				throwIfAborted(signal);
				const dataType = typeof data;
				if (dataType === "undefined") throw mkErr("action data cannot be undefined");
				const isJson = dataType !== "string";
				const isBlob = data instanceof Blob;
				const isBinary = isBlob || data instanceof ArrayBuffer || data instanceof TypedArray;
				const hasMeta = meta !== void 0;
				const buffer = isBinary ? toByteArray(isBlob ? await data.arrayBuffer() : data) : encodeBytes(isJson ? toJson(data) : data);
				const metaEncoded = hasMeta ? encodeBytes(toJson(meta)) : null;
				const chunkTotal = Math.ceil(buffer.byteLength / chunkSize) + (hasMeta ? 1 : 0) || 1;
				const chunks = alloc(chunkTotal, (_, i) => {
					const isLast = i === chunkTotal - 1;
					const isMeta = Boolean(hasMeta && i === 0);
					const chunk = new Uint8Array(payloadIndex + (isMeta ? metaEncoded?.byteLength ?? 0 : isLast ? buffer.byteLength - chunkSize * (chunkTotal - (hasMeta ? 2 : 1)) : chunkSize));
					chunk.set(typeBytesPadded);
					chunk.set([nonce >> 8, nonce & oneByteMax], nonceIndex);
					chunk.set([Number(isLast) | Number(isMeta) << 1 | Number(isBinary) << 2 | Number(isJson) << 3], tagIndex);
					chunk.set([Math.round((i + 1) / chunkTotal * oneByteMax)], progressIndex);
					chunk.set(hasMeta ? isMeta ? metaEncoded ?? /* @__PURE__ */ new Uint8Array() : buffer.subarray((i - 1) * chunkSize, i * chunkSize) : buffer.subarray(i * chunkSize, (i + 1) * chunkSize), payloadIndex);
					return chunk;
				});
				nonce = nonce + 1 & twoByteMax;
				await all(iterate(targets, async (id, peer) => {
					const { channel } = peer;
					let chunkN = 0;
					while (chunkN < chunkTotal) {
						throwIfAborted(signal);
						const chunk = chunks[chunkN];
						if (!chunk) break;
						if (channel && channel.bufferedAmount > channel.bufferedAmountLowThreshold) {
							const didDrain = await waitForBufferedAmountLow(channel);
							throwIfAborted(signal);
							if (!didDrain) break;
						}
						const currentPeer = getPeer(id, normalizedOptions.sendToPending);
						if (!currentPeer || currentPeer !== peer) break;
						peer.sendData(chunk);
						chunkN++;
						const progressByte = chunk[progressIndex] ?? oneByteMax;
						onProgress?.(progressByte / oneByteMax, id, meta);
					}
				}, { includePending: normalizedOptions.sendToPending }));
				return [];
			},
			options: normalizedOptions
		};
		return actionsCache[type] = {
			send: actions[type].send,
			onMessage: actions[type].setOnComplete,
			onProgress: actions[type].setOnProgress
		};
	};
	const handleData = (id, data) => {
		const buffer = new Uint8Array(data);
		if (buffer.byteLength < payloadIndex || buffer.byteLength > maxMessageBytes) return;
		const type = decodeBytes(buffer.subarray(typeIndex, nonceIndex)).replaceAll("\0", "");
		if (!type) return;
		const action = actions[type];
		if (!canReceiveFromPeer(id, Boolean(action?.options.receiveWhilePending))) return;
		const nonce = buffer[nonceIndex] << 8 | buffer[33];
		const tag = buffer[tagIndex], progress = buffer[progressIndex];
		if (tag & ~15) return;
		const payload = buffer.subarray(payloadIndex);
		const isLast = Boolean(tag & 1), isMeta = Boolean(tag & 2);
		const isBinary = Boolean(tag & 4), isJson = Boolean(tag & 8);
		const key = type + "\0" + nonce;
		let peer = pendingTransmissions.get(id);
		if (!peer) { peer = { messages: new Map(), bytes: 0 }; pendingTransmissions.set(id, peer); }
		let target = peer.messages.get(key);
		if (!target) {
			// Once a start was dropped, this protocol has no first-chunk marker
			// that could distinguish its late suffix from a new complete message.
			if (peer.exhausted || peer.messages.size >= maxPeerMessages) { peer.exhausted = true; return; }
			target = { chunks: [], bytes: 0, timer: expire(() => blockTransmission(id, key)) };
			peer.messages.set(key, target);
		}
		if (target.blocked) { if (isLast) forgetTransmission(id, key); return; }
		if (target.bytes + buffer.byteLength > maxMessageBytes || peer.bytes + buffer.byteLength > maxPeerBytes) {
			// Retain only a bounded tombstone until completion: later chunks must not
			// re-create this message and publish a truncated suffix.
			blockTransmission(id, key);
			return;
		}
		target.bytes += buffer.byteLength; peer.bytes += buffer.byteLength;
		try {
			if (isMeta) target.meta = fromJson(decodeBytes(payload));
			else target.chunks.push(payload);
		} catch (_) { forgetTransmission(id, key); return; }
		action?.onProgress(progress / oneByteMax, id, target.meta);
		if (!isLast) return;
		const full = new Uint8Array(target.chunks.reduce((a, c) => a + c.byteLength, 0));
		target.chunks.reduce((a, c) => { full.set(c, a); return a + c.byteLength; }, 0);
		forgetTransmission(id, key);
		let payloadValue;
		try { payloadValue = isBinary ? full : isJson ? fromJson(decodeBytes(full)) : decodeBytes(full); }
		catch (_) { return; }
		if (action) { action.onComplete(payloadValue, id, target.meta); return; }
		if (deferredCount >= maxDeferredMessages || deferredBytes + target.bytes > maxDeferredBytes) return;
		const entry = { payload: payloadValue, peerId: id, metadata: target.meta, bytes: target.bytes };
		entry.timer = expire(() => forgetDeferred(type, entry));
		let pending = pendingActionPayloads.get(type);
		if (!pending) { pending = []; pendingActionPayloads.set(type, pending); }
		pending.push(entry); deferredBytes += entry.bytes; deferredCount++;
	};
	return {
		makeInternalAction,
		handleData,
		clearPeer: (id) => {
			const peer = pendingTransmissions.get(id);
			if (peer) for (const key of peer.messages.keys()) forgetTransmission(id, key);
			pendingTransmissions.delete(id);
			for (const [type, pending] of pendingActionPayloads) {
				for (const entry of [...pending]) if (entry.peerId === id) forgetDeferred(type, entry);
			}
		}
	};
};
//#endregion
export { createActionWireManager };

//# sourceMappingURL=action-wire.mjs.map
