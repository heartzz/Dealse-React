import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { AccountRole, UserStatus } from "../src/generated/prisma/enums.js";

function userIdArgument(): string {
  const index = process.argv.indexOf("--user-id");
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Usage: pnpm --filter @dealse/api admin:grant-local -- --user-id <DealSe-user-UUID>");
  }
  return value;
}

function localDevelopmentDatabase(): string {
  if (process.env.NODE_ENV === "production") throw new Error("This helper is disabled in production.");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL must be configured in apps/api/.env.");
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL is invalid; no database was changed.");
  }
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (database !== "dealse_dev" || !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname.toLowerCase())) {
    throw new Error("This helper only grants roles in the local dealse_dev database.");
  }
  return connectionString;
}

async function main() {
  const userId = userIdArgument();
  const connectionString = localDevelopmentDatabase();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({ where: { id: userId, status: UserStatus.ACTIVE }, select: { id: true } });
      if (!user) throw new Error("The UUID must reference an existing active DealSe user.");
      const existing = await tx.userAccountRole.findUnique({ where: { userId_role: { userId, role: AccountRole.ADMIN } }, select: { userId: true } });
      if (existing) {
        process.stdout.write("Admin role is already assigned.\n");
        return;
      }
      await tx.userAccountRole.create({ data: { userId, role: AccountRole.ADMIN } });
      await tx.auditLog.create({
        data: {
          actorType: "system-bootstrap",
          action: "admin.bootstrap.granted",
          entityType: "user_account_role",
          entityId: userId,
          afterSnapshot: { role: AccountRole.ADMIN },
        },
      });
    });
    process.stdout.write("Admin role granted in local dealse_dev. Sign in with that user's existing Supabase account.\n");
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Admin role grant failed."}\n`);
  process.exitCode = 1;
});
