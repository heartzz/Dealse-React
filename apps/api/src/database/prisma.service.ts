import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";
import type { PoolConfig } from "pg";
import { PrismaClient } from "../generated/prisma/client.js";

export const AIVEN_CA_CERT_PATH = "/etc/secrets/aiven-ca.pem";

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
  if (nodeEnvironment !== "production") return { connectionString };

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
    ssl: {
      ca: readFileSync(caCertificatePath, "utf8"),
      rejectUnauthorized: true,
    },
  };
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL must be configured in apps/api/.env.");
    }

    super({ adapter: new PrismaPg(createPostgresPoolConfig(connectionString)) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
