/* In-memory Durable Object storage for the real rendezvous Worker. Only the
 * storage boundary is faked; routes, validation, ownership and TTL stay real. */
import { Room } from "../../worker/rendezvous.js";

export function roomHarness() {
  const records = new Map();
  const calls = { get: 0, put: 0, alarm: 0, deleteAll: 0 };
  const state = {
    storage: {
      async get(key) { calls.get++; return records.get(key); },
      async put(key, value) { calls.put++; records.set(key, value); },
      async setAlarm() { calls.alarm++; },
      async deleteAll() { calls.deleteAll++; records.clear(); },
    },
  };
  return { room: new Room(state), records, calls };
}

export function roomNamespace() {
  const objects = new Map();
  function get(name) {
    if (!objects.has(name)) objects.set(name, roomHarness());
    return objects.get(name);
  }
  return {
    env: { ROOM: { idFromName: (name) => name, get: (name) => get(name).room } },
    // The HTTP client's security tests act as a hostile operator: they inspect
    // and forge stored records directly, without passing Worker validation.
    rooms: {
      get(id) { return Object.fromEntries(get("v3:" + id).records); },
      set(id, slots) {
        const records = get("v3:" + id).records;
        records.clear();
        for (const [slot, record] of Object.entries(slots)) records.set(slot, record);
        return this;
      },
    },
  };
}
