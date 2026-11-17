import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountRole, UserStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import { AuthService } from "./auth.service.js";

test("identity resolution succeeds when a database operation takes longer than the old interactive transaction timeout", async () => {
  const startedAt = new Date();
  const storedUser = {
    id: "test-user-id",
    status: UserStatus.ACTIVE,
    emailNormalized: "slow-auth@example.invalid",
    emailVerifiedAt: null,
    profile: { displayName: null },
    accountRoles: [{ role: AccountRole.CUSTOMER }],
  };
  let transactionCalls = 0;
  const prismaMock = {
    user: {
      findUnique: async () => storedUser,
      update: async ({ data }: { data: { lastSignedInAt: Date } }) => {
        await new Promise((resolve) => setTimeout(resolve, 5_850));
        return { ...storedUser, lastSignedInAt: data.lastSignedInAt };
      },
    },
    $transaction: async () => {
      transactionCalls += 1;
      throw new Error("identity resolution must not open an interactive transaction");
    },
  };
  const auth = new AuthService(prismaMock as unknown as PrismaService);

  const principal = await auth.resolveIdentity({
    providerId: "supabase-test",
    subject: "slow-auth-subject",
    email: "slow-auth@example.invalid",
    emailVerified: false,
  });

  assert.ok(Date.now() - startedAt.getTime() > 5_000, "the simulated database operation exceeds Prisma's prior default timeout");
  assert.equal(transactionCalls, 0);
  assert.equal(principal.userId, storedUser.id);
  assert.deepEqual(principal.roles, [AccountRole.CUSTOMER]);
});
