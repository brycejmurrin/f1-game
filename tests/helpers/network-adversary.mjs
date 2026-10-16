/* Deterministic fetch/response fault injection for unit tests.
 *
 * A real proxy is a poor adversary: timing and socket buffering make a test
 * flaky, and it cannot reliably deliver two responses in the opposite order.
 * This harness separates headers from the body and exposes every delivery
 * decision to the test.  It is deliberately small and browser-shaped so
 * callers can install `adversary.fetch` as their fetch implementation.
 */

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

export class NetworkAdversary {
  #nextId = 1;
  #requests = new Map();

  constructor({ ResponseCtor = globalThis.Response } = {}) {
    if (typeof ResponseCtor !== "function") throw new TypeError("NetworkAdversary needs Response");
    this.Response = ResponseCtor;
    this.fetch = this.fetch.bind(this);
  }

  fetch(url, init = {}) {
    const id = this.#nextId++;
    const headers = deferred();
    const request = {
      id,
      url: String(url),
      init,
      headers,
      body: null,
      settled: false,
      aborted: false,
    };
    this.#requests.set(id, request);
    const signal = init?.signal;
    if (signal?.aborted) this.fail(id, signal.reason || new DOMException("Aborted", "AbortError"));
    else signal?.addEventListener("abort", () => this.abort(id, signal.reason), { once: true });
    return headers.promise;
  }

  requests() { return [...this.#requests.values()]; }

  request(id) {
    const request = this.#requests.get(id);
    if (!request) throw new Error(`unknown adversary request ${id}`);
    return request;
  }

  /** Deliver response headers while intentionally leaving the body pending. */
  respondHeaders(id, { status = 200, statusText = "", headers = {} } = {}) {
    const request = this.request(id);
    if (request.settled) throw new Error(`request ${id} already settled`);
    const stream = new ReadableStream({
      start: controller => { request.body = controller; },
      cancel: reason => { request.bodyCancelled = reason; },
    });
    request.settled = true;
    request.response = new this.Response(stream, { status, statusText, headers });
    request.headers.resolve(request.response);
    return request.response;
  }

  push(id, chunk) {
    const request = this.request(id);
    if (!request.body) throw new Error(`request ${id} has no delivered body`);
    request.body.enqueue(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
  }

  end(id) {
    const request = this.request(id);
    if (!request.body) throw new Error(`request ${id} has no delivered body`);
    request.body.close();
  }

  errorBody(id, error = new Error("network body disconnected")) {
    const request = this.request(id);
    if (!request.body) throw new Error(`request ${id} has no delivered body`);
    request.body.error(error);
  }

  fail(id, error = new TypeError("network request failed")) {
    const request = this.request(id);
    if (request.settled) throw new Error(`request ${id} already settled`);
    request.settled = true;
    request.headers.reject(error);
  }

  abort(id, reason = new DOMException("Aborted", "AbortError")) {
    const request = this.request(id);
    request.aborted = true;
    if (!request.settled) this.fail(id, reason);
    else request.body?.error(reason);
  }
}

