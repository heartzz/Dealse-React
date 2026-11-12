import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import { createInterface } from "node:readline";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { AccountRole, AdminAccountStatus, AdminRole, UserStatus } from "../src/generated/prisma/enums.js";
import { assertAllowedBootstrapDatabaseTarget, assertDevelopmentBootstrapEnvironment } from "./bootstrap-root-admin-guards.js";

function requiredSetting(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required; no database changes were made.`);
  return value;
}

function secureEqual(input: string, configured: string): boolean {
  const left = Buffer.from(input, "utf8");
  const right = Buffer.from(configured, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readBootstrapSecret(): Promise<string> {
  const input = process.stdin;
  if (input.isTTY && typeof input.setRawMode === "function") {
    process.stderr.write("Bootstrap secret (input hidden): ");
    input.setRawMode(true);
    input.setEncoding("utf8");
    input.resume();
    return new Promise<string>((resolve, reject) => {
      let value = "";
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        input.off("data", onData);
        input.off("error", onError);
        input.off("end", onEnd);
        input.setRawMode(false);
        input.pause();
        process.stderr.write("\n");
        if (error) reject(error);
        else resolve(value);
      };
      const onData = (chunk: string | Buffer) => {
        for (const character of chunk.toString("utf8")) {
          if (character === "\r" || character === "\n") { finish(); return; }
          if (character === "\u0003") { finish(new Error("Bootstrap input cancelled.")); return; }
          if (character === "\u007f" || character === "\b") value = Array.from(value).slice(0, -1).join("");
          else if (character >= " ") value += character;
        }
      };
      const onError = (error: Error) => finish(error);
      const onEnd = () => finish(new Error("Bootstrap secret input ended unexpectedly."));
      input.on("data", onData);
      input.once("error", onError);
      input.once("end", onEnd);
    });
  }

  const lines = createInterface({ input, terminal: false });
  try {
    const line = await new Promise<string>((resolve, reject) => {
      lines.once("line", resolve);
      lines.once("error", reject);
    });
    return line.trim();
  } finally { lines.close(); }
}

async function main() {
  assertDevelopmentBootstrapEnvironment(process.env.NODE_ENV, process.env.ADMIN_BOOTSTRAP_ENV);
  const provider = requiredSetting("ADMIN_BOOTSTRAP_AUTH_PROVIDER");
  const subject = requiredSetting("ADMIN_BOOTSTRAP_AUTH_SUBJECT");
  const configuredSecret = requiredSetting("ADMIN_BOOTSTRAP_SECRET");
  if (configuredSecret.length < 32) throw new Error("ADMIN_BOOTSTRAP_SECRET must contain at least 32 characters; no database changes were made.");
  const connectionString = requiredSetting("DATABASE_URL");
  assertAllowedBootstrapDatabaseTarget(connectionString);
  const suppliedSecret = await readBootstrapSecret();
  if (!secureEqual(suppliedSecret, configuredSecret)) throw new Error("Bootstrap authorization failed; no database changes were made.");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.adminBootstrap.findUnique({ where: { id: 1 }, select: { userId: true } });
      if (existing) {
        const sameRoot = existing.userId === (await tx.user.findUnique({ where: { authProvider_authSubject: { authProvider: provider, authSubject: subject } }, select: { id: true } }))?.id;
        if (sameRoot) return;
        throw new Error("The one-time Root Admin bootstrap has already been used.");
      }

      const user = await tx.user.findUnique({
        where: { authProvider_authSubject: { authProvider: provider, authSubject: subject } },
        select: { id: true, status: true },
      });
      if (!user || user.status !== UserStatus.ACTIVE) throw new Error("The configured trusted identity must already exist as an active DealSe user.");
      const existingAdmin = await tx.adminAccount.findUnique({ where: { userId: user.id }, select: { userId: true } });
      if (existingAdmin) throw new Error("The trusted identity already has an administrator record; bootstrap was not applied.");

      const establishedAt = new Date();
      await tx.adminAccount.create({ data: { userId: user.id, role: AdminRole.ROOT_ADMIN, status: AdminAccountStatus.ACTIVE, acceptedAt: establishedAt } });
      await tx.userAccountRole.upsert({
        where: { userId_role: { userId: user.id, role: AccountRole.ADMIN } },
        create: { userId: user.id, role: AccountRole.ADMIN },
        update: {},
      });
      await tx.adminBootstrap.create({ data: { id: 1, userId: user.id, establishedAt } });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorType: "system-bootstrap",
          actorAdminRole: AdminRole.ROOT_ADMIN,
          action: "admin.bootstrap.root_established",
          entityType: "admin_account",
          entityId: user.id,
          afterSnapshot: { role: AdminRole.ROOT_ADMIN, status: AdminAccountStatus.ACTIVE },
        },
      });
    });
    process.stdout.write("Root Admin bootstrap verified or established for the configured identity.\n");
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write("Root Admin bootstrap failed; no success was reported. Check the local development configuration and retry.\n");
  process.exitCode = 1;
});
