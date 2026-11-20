import assert from "node:assert/strict";
import test from "node:test";
import { requestCategory, requestDiagnostics, requestIdFrom } from "./request-diagnostics.js";

test("preserves UUID request IDs and replaces malformed values", () => {
  const valid = "11111111-2222-4333-8444-555555555555";
  assert.equal(requestIdFrom(valid), valid);
  assert.match(requestIdFrom("not-a-request-id"), /^[0-9a-f-]{36}$/i);
});

test("classifies HTTP status codes without response details", () => {
  assert.equal(requestCategory(200), "success");
  assert.equal(requestCategory(401), "unauthorized");
  assert.equal(requestCategory(403), "forbidden");
  assert.equal(requestCategory(404), "not_found");
  assert.equal(requestCategory(422), "request_rejected");
  assert.equal(requestCategory(500), "server_error");
});

test("echoes request ID and logs safe request timing without query or identity data", () => {
  const header = "11111111-2222-4333-8444-555555555555";
  const logged: unknown[] = [];
  const originalInfo = console.info;
  console.info = (...values: unknown[]) => logged.push(values);
  let finished: (() => void) | undefined;
  let responseId = "";
  let nextCalled = false;
  const pool = { maxConnections: 10, totalConnections: 4, idleConnections: 2, waitingRequests: 0 };
  const request = { method: "GET", path: "/api/v1/admin/retailers", url: "/api/v1/admin/retailers?q=private", headers: { "x-request-id": header } };
  const response = {
    statusCode: 403,
    setHeader: (_name: string, value: string) => { responseId = value; },
    on: (_event: "finish", listener: () => void) => { finished = listener; },
  };

  try {
    requestDiagnostics(request, response, () => { nextCalled = true; }, () => pool);
    finished?.();
  } finally {
    console.info = originalInfo;
  }

  assert.equal(responseId, header);
  assert.equal(nextCalled, true);
  const [message, details] = logged[0] as [string, Record<string, unknown>];
  assert.equal(message, "[DealSe API] request completed");
  assert.equal(details.endpoint, "/api/v1/admin/retailers");
  assert.equal(details.method, "GET");
  assert.equal(details.status, 403);
  assert.equal(details.requestId, header);
  assert.equal(details.category, "forbidden");
  assert.equal(typeof details.durationMs, "number");
  assert.equal("pool" in details, false, "pool details are omitted for ordinary requests");
  assert.equal(JSON.stringify(details).includes("private"), false, "query parameters are not logged");
});

test("includes only pool counters for failed API requests", () => {
  const logged: unknown[] = [];
  const originalInfo = console.info;
  console.info = (...values: unknown[]) => logged.push(values);
  let finished: (() => void) | undefined;
  try {
    requestDiagnostics(
      { method: "GET", path: "/api/v1/admin/stores", headers: {} },
      { statusCode: 500, setHeader: () => undefined, on: (_event, listener) => { finished = listener; } },
      () => undefined,
      () => ({ maxConnections: 10, totalConnections: 10, idleConnections: 0, waitingRequests: 3 }),
    );
    finished?.();
  } finally {
    console.info = originalInfo;
  }
  const details = (logged[0] as [string, Record<string, unknown>])[1];
  assert.deepEqual(details.pool, { maxConnections: 10, totalConnections: 10, idleConnections: 0, waitingRequests: 3 });
  assert.equal(Object.keys(details).some((key) => /token|email|user|query|sql|credential/i.test(key)), false);
});
