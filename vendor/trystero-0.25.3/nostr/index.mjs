import { schnorr } from "@noble/secp256k1";
import { createRelayManager, createTopicStrategy, fromJson, genId, getRelays, hashWith, libName, makeSocket, pauseRelayReconnection, resumeRelayReconnection, selfId, strToNum, toHex, toJson } from "@trystero-p2p/core";
//#region src/index.ts
const relayManager = createRelayManager((client) => client.socket);
const defaultRedundancy = 5;
const tag = "x";
const eventMsgType = "EVENT";
const { secretKey, publicKey } = schnorr.keygen();
const pubkey = toHex(publicKey);
const subIdToTopic = {};
const msgHandlers = {};
const kindCache = {};
const maxTopicsPerSubscription = 250;
const now = () => Math.floor(Date.now() / 1e3);
const topicToKind = (topic) => kindCache[topic] ??= strToNum(topic, 1e4) + 2e4;
const createEvent = async (topic, content) => {
	const payload = {
		kind: topicToKind(topic),
		tags: [[tag, topic]],
		created_at: now(),
		content,
		pubkey
	};
	const id = await hashWith("SHA-256", toJson([
		0,
		payload.pubkey,
		payload.created_at,
		payload.kind,
		payload.tags,
		payload.content
	]));
	return toJson([eventMsgType, {
		...payload,
		id: toHex(id),
		sig: toHex(await schnorr.signAsync(id, secretKey))
	}]);
};
const subscribe = (subId, topic) => {
	subIdToTopic[subId] = topic;
	return toJson([
		"REQ",
		subId,
		{
			kinds: [topicToKind(topic)],
			since: now(),
			["#x"]: [topic]
		}
	]);
};
const batchers = {};
const batchAdd = (client, topic, handler) => {
	const batcher = batchers[client.url] ??= {
		subIds: [],
		topics: /* @__PURE__ */ new Map(),
		updateTimer: null
	};
	batcher.topics.set(topic, handler);
	scheduleBatchFlush(client, batcher);
};
const batchRemove = (client, topic) => {
	const batcher = batchers[client.url];
	if (!batcher) return;
	batcher.topics.delete(topic);
	if (batcher.topics.size === 0) {
		if (batcher.updateTimer !== null) {
			clearTimeout(batcher.updateTimer);
			batcher.updateTimer = null;
		}
		batcher.subIds.forEach((subId) => client.send(toJson(["CLOSE", subId])));
		delete batchers[client.url];
	} else scheduleBatchFlush(client, batcher);
};
const scheduleBatchFlush = (client, batcher) => {
	if (batcher.updateTimer !== null) return;
	batcher.updateTimer = setTimeout(() => {
		batcher.updateTimer = null;
		flushBatch(client);
	}, 0);
};
const flushBatch = (client) => {
	const batcher = batchers[client.url];
	if (!batcher || batcher.topics.size === 0) return;
	const topics = [...batcher.topics.keys()];
	const chunks = [];
	const since = now();
	for (let i = 0; i < topics.length; i += maxTopicsPerSubscription) chunks.push(topics.slice(i, i + maxTopicsPerSubscription));
	while (batcher.subIds.length > chunks.length) {
		const subId = batcher.subIds.pop();
		if (subId) client.send(toJson(["CLOSE", subId]));
	}
	chunks.forEach((chunk, i) => {
		const subId = batcher.subIds[i] ??= genId(64);
		client.send(toJson([
			"REQ",
			subId,
			{
				kinds: [...new Set(chunk.map(topicToKind))],
				since,
				["#x"]: chunk
			}
		]));
	});
};
const resubscribeOnReconnect = (client) => {
	const batcher = batchers[client.url];
	if (batcher && batcher.topics.size > 0) flushBatch(client);
};
const joinRoom = createTopicStrategy({
	init: (config) => getRelays(config, defaultRelayUrls, defaultRedundancy, true).map((url) => {
		const client = relayManager.register(url, () => makeSocket(url, (data) => {
			const [msgType, subId, payload, relayMsg] = fromJson(data);
			if (msgType !== eventMsgType) {
				const prefix = `${libName}: relay failure from ${client.url} - `;
				if (config.relayConfig?.warnOnRelayFailure !== false) {
					if (msgType === "NOTICE") console.warn(prefix + subId);
					else if (msgType === "OK" && !payload) console.warn(prefix + relayMsg);
				}
				return;
			}
			if (payload && typeof payload === "object" && "content" in payload) {
				const { content } = payload;
				const handler = msgHandlers[subId];
				if (handler) {
					handler(subIdToTopic[subId] ?? "", content);
					return;
				}
				const batcher = batchers[client.url];
				if (batcher?.subIds.includes(subId) && payload.tags) {
					const topicTag = payload.tags.find((t) => t[0] === tag);
					if (topicTag?.[1]) batcher.topics.get(topicTag[1])?.(topicTag[1], content);
				}
			}
		}, () => resubscribeOnReconnect(client)));
		return client.ready;
	}),
	subscribeTopic: (client, topic, onMessage) => {
		const handler = (topic, data) => void onMessage(topic, data);
		batchAdd(client, topic, handler);
		return () => {
			batchRemove(client, topic);
		};
	},
	publishTopic: async (client, topic, msg) => client.send(await createEvent(topic, typeof msg === "string" ? msg : toJson(msg)))
});
const getRelaySockets = relayManager.getSockets;
const defaultRelayUrls = [
	"basspistol.org",
	"bucket.coracle.social",
	"chorus.almostmachines.dev",
	"chorus.pjv.me",
	"communities.nos.social",
	"ftp.halifax.rwth-aachen.de/nostr",
	"hol.is",
	"hornetstorage.net/relay",
	"koru.bitcointxoko.org",
	"nos.lol",
	"nostr-01.uid.ovh",
	"nostr-01.yakihonne.com",
	"nostr-relay.corb.net",
	"nostr.data.haus",
	"nostr.islandarea.net",
	"nostr.sathoarder.com",
	"nostr.self-determined.de",
	"nostr.tegila.com.br",
	"nostr.vulpem.com",
	"purplerelay.com",
	"relay-can.zombi.cloudrodion.com",
	"relay-rpi.edufeed.org",
	"relay.agorist.space",
	"relay.angor.io",
	"relay.artio.inf.unibe.ch",
	"relay.binaryrobot.com",
	"relay.damus.io",
	"relay.froth.zone",
	"relay.libernet.app",
	"relay.mostr.pub",
	"relay.mostro.network",
	"relay.nostr.place",
	"relay.nostrdice.com",
	"relay.notoshi.win",
	"relay.sigit.io",
	"relay02.lnfi.network",
	"relay2.angor.io",
	"schnorr.me",
	"slick.mjex.me",
	"social.amanah.eblessing.co",
	"staging.yabu.me",
	"strfry.openhoofd.nl",
	"strfry.shock.network",
	"testnet-relay.samt.st",
	"top.testrelay.top",
	"x.kojira.io",
	"yabu.me/v2"
].map((url) => "wss://" + url);
//#endregion
export { createEvent, defaultRelayUrls, getRelaySockets, joinRoom, pauseRelayReconnection, resumeRelayReconnection, selfId, subscribe };

//# sourceMappingURL=index.mjs.map