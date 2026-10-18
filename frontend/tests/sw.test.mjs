import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
function worker() {
  const handlers = {}, stores = new Map(), deleted = [], fetched = [];
  const key = (request) => typeof request === "string" ? `https://test.example${request}` : request.url;
  const cache = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const values = stores.get(name);
    return {
      add: async (url) => values.set(key(url), new Response("offline")),
      put: async (request, response) => values.set(key(request), response),
      match: async (request) => values.get(key(request))?.clone(),
      keys: async () => [...values.keys()].map((url) => new Request(url)),
      delete: async (request) => values.delete(key(request)),
    };
  };
  const state = { response: () => new Response("asset", { headers: { "content-length": "5" } }), offline: false };
  vm.runInNewContext(source, {
    self: { location: { origin: "https://test.example" }, addEventListener: (type, handler) => handlers[type] = handler,
      skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: { open: async (name) => cache(name), keys: async () => [...stores.keys()],
      delete: async (name) => { deleted.push(name); return stores.delete(name); } },
    fetch: async (request) => { fetched.push(key(request)); if (state.offline) throw new Error("offline"); return state.response(); },
    URL, Response, Promise,
  });
  async function dispatch(type, request) {
    const pending = [];
    let response;
    handlers[type]({ request, waitUntil: (p) => pending.push(p), respondWith: (p) => response = p });
    const result = response ? await response : undefined;
    await Promise.all(pending);
    return result;
  }
  return { stores, deleted, fetched, state, dispatch };
}
const request = (path, mode = "cors", method = "GET") => ({ url: `https://test.example${path}`, mode, method });

test("API and POST requests bypass the service worker cache", async () => {
  const w = worker();
  for (const req of [request("/api/dashboard"), request("/api/leads"), request("/api", "navigate"), request("/_next/static/a.js", "cors", "POST")]) {
    assert.equal(await w.dispatch("fetch", req), undefined);
  }
  assert.equal(w.fetched.length, 0);
  assert.equal(w.stores.size, 0);
});
test("activation clears only old app caches, including previously cached pages", async () => {
  const w = worker();
  w.stores.set("kb-v1", new Map()); w.stores.set("unrelated-app", new Map());
  await w.dispatch("install"); await w.dispatch("activate");
  assert.deepEqual(w.deleted, ["kb-v1"]);
  assert.ok(w.stores.has("unrelated-app"));
});
test("customer navigation is never cached and offline fallback is generic", async () => {
  const w = worker(); await w.dispatch("install");
  w.state.response = () => new Response("private dashboard");
  assert.equal(await (await w.dispatch("fetch", request("/dashboard", "navigate"))).text(), "private dashboard");
  assert.equal(w.stores.get("kb-public-v2").size, 1);
  w.state.offline = true;
  assert.equal(await (await w.dispatch("fetch", request("/dashboard", "navigate"))).text(), "offline");
});
test("asset cache bounds entries and skips query variants", async () => {
  const w = worker(); await w.dispatch("install");
  for (let i = 0; i < 70; i++) await w.dispatch("fetch", request(`/_next/static/${i}.js`));
  assert.equal(w.stores.get("kb-public-v2").size, 65);
  assert.ok(w.stores.get("kb-public-v2").has("https://test.example/offline.html"));
  assert.equal(await w.dispatch("fetch", request("/_next/static/a.js?unique=1")), undefined);
});
test("private, no-store, oversized and missing-length assets are not cached", async () => {
  const w = worker(); await w.dispatch("install");
  const cases = [{ "cache-control": "private", "content-length": "5" }, { "cache-control": "no-store", "content-length": "5" },
    { "content-length": "2097153" }, {}];
  for (const [i, headers] of cases.entries()) {
    w.state.response = () => new Response("asset", { headers });
    await w.dispatch("fetch", request(`/_next/static/private-${i}.js`));
  }
  assert.equal(w.stores.get("kb-public-v2").size, 1);
});
