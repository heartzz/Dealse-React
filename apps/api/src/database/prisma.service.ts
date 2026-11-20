import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import type { PoolConfig } from "pg";
import { PrismaClient } from "../generated/prisma/client.js";
import type { PrismaClient as PrismaClientWithQueryEvents } from "../generated/prisma/client.js";

export const AIVEN_CA_CERT_PATH = "/etc/secrets/aiven-ca.pem";
export const POSTGRES_POOL_MAX = 10;
const SLOW_QUERY_LOG_THRESHOLD_MS = 500;

const sslConnectionParameters = [
  "ssl",
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "sslnegotiation",
  "uselibpqcompat",
] as const;

export function createPostgresPoolConfig(
  connectionString: string,
  nodeEnvironment = process.env.NODE_ENV,
  caCertificatePath = AIVEN_CA_CERT_PATH,
): PoolConfig {
  if (nodeEnvironment !== "production") {
    return { connectionString, max: POSTGRES_POOL_MAX };
  }

  // node-postgres parses SSL query parameters after merging PoolConfig, so a
  // URL's sslmode=require can replace driver-level TLS settings. In production
  // use one explicit, verified CA configuration instead. Node TLS keeps its
  // default hostname check because checkServerIdentity is not overridden.
  const normalizedUrl = new URL(connectionString);
  for (const parameter of sslConnectionParameters) {
    normalizedUrl.searchParams.delete(parameter);
  }

  return {
    connectionString: normalizedUrl.toString(),
    max: POSTGRES_POOL_MAX,
    ssl: {
      ca: readFileSync(caCertificatePath, "utf8"),
      rejectUnauthorized: true,
    },
  };
}

function poolSnapshot(pool: Pool) {
  return {
    maxConnections: pool.options.max,
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingRequests: pool.waitingCount,
  };
}

function safeDatabaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error) || typeof error.code !== "string") return null;
  return /^[a-z0-9_-]{1,32}$/i.test(error.code) ? error.code : null;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL must be configured in apps/api/.env.");
    }

    const pool = new Pool(createPostgresPoolConfig(connectionString));
    super({
      adapter: new PrismaPg(pool, {
        disposeExternalPool: true,
        onPoolError: (error) => {
          console.error("[DealSe DB] PostgreSQL pool error", {
            code: safeDatabaseErrorCode(error),
            ...poolSnapshot(pool),
          });
        },
        onConnectionError: (error) => {
          console.error("[DealSe DB] PostgreSQL connection error", {
            code: safeDatabaseErrorCode(error),
            ...poolSnapshot(pool),
          });
        },
      }),
      log: [{ emit: "event", level: "query" }],
    });
    this.pool = pool;

    // This one Pool instance is shared by the Prisma adapter for this API
    // process. Waiting counts expose local pool pressure without logging SQL,
    // credentials, request bodies, or user data.
    let lastQueueWarningAt = 0;
    pool.on("acquire", () => {
      const now = Date.now();
      if (pool.waitingCount > 0 && now - lastQueueWarningAt >= 5_000) {
        lastQueueWarningAt = now;
        console.warn("[DealSe DB] PostgreSQL pool has queued acquisitions", poolSnapshot(pool));
      }
    });
    const queryEvents = this as unknown as PrismaClientWithQueryEvents<"query">;
    queryEvents.$on("query", (event) => {
      if (event.duration >= SLOW_QUERY_LOG_THRESHOLD_MS) {
        console.warn("[DealSe DB] slow Prisma query", {
          durationMs: event.duration,
          ...poolSnapshot(pool),
        });
      }
    });
  }

  poolDiagnostics() {
    return poolSnapshot(this.pool);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
