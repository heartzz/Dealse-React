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

test("echoes request ID and logs only endpoint, method, status and category", () => {
  const header = "11111111-2222-4333-8444-555555555555";
  const logged: unknown[] = [];
  const originalInfo = console.info;
  console.info = (...values: unknown[]) => logged.push(values);
  let finished: (() => void) | undefined;
  let responseId = "";
  let nextCalled = false;
  const request = { method: "GET", path: "/api/v1/admin/retailers", url: "/api/v1/admin/retailers?q=private", headers: { "x-request-id": header } };
  const response = {
    statusCode: 403,
    setHeader: (_name: string, value: string) => { responseId = value; },
    on: (_event: "finish", listener: () => void) => { finished = listener; },
  };

  try {
    requestDiagnostics(request, response, () => { nextCalled = true; });
    finished?.();
  } finally {
    console.info = originalInfo;
  }

  assert.equal(responseId, header);
  assert.equal(nextCalled, true);
  assert.deepEqual(logged, [["[DealSe API] request completed", {
    endpoint: "/api/v1/admin/retailers",
    method: "GET",
    status: 403,
    requestId: header,
    category: "forbidden",
  }]]);
});
