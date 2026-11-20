import { randomUUID } from "node:crypto";

const REQUEST_ID_PATTERN = /^[0-9a-f-]{36}$/i;

export function requestIdFrom(value: unknown): string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value) ? value : randomUUID();
}

export function requestCategory(status: number): string {
  if (status < 400) return "success";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  return status >= 500 ? "server_error" : "request_rejected";
}

function stripControlCharacters(value: string): string {
  return [...value].filter((character) => {
    const code = character.charCodeAt(0);
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
  }).join("");
}

export function requestDiagnostics(
  request: { method?: string; path?: string; url?: string; headers: Record<string, string | string[] | undefined> },
  response: { statusCode: number; setHeader(name: string, value: string): void; on(event: "finish", listener: () => void): void },
  next: () => void,
  getPoolDiagnostics?: () => Record<string, number>,
): void {
  const startedAt = performance.now();
  const requestId = requestIdFrom(request.headers["x-request-id"]);
  const endpoint = stripControlCharacters((request.path || request.url || "/").split("?", 1)[0]).slice(0, 200);
  request.headers["x-request-id"] = requestId;
  response.setHeader("X-Request-ID", requestId);
  response.on("finish", () => {
    const durationMs = Math.round(performance.now() - startedAt);
    const includePool = response.statusCode >= 500 || durationMs >= 1_000;
    console.info("[DealSe API] request completed", {
      endpoint,
      method: request.method || "UNKNOWN",
      status: response.statusCode,
      durationMs,
      requestId,
      category: requestCategory(response.statusCode),
      ...(includePool && getPoolDiagnostics ? { pool: getPoolDiagnostics() } : {}),
    });
  });
  next();
}
