import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountRole, UserStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import { AuthService } from "./auth.service.js";

test("repeat authenticated requests do not write identity rows or start transactions", async () => {
  const storedUser = {
    id: "test-user-id",
    status: UserStatus.ACTIVE,
    emailNormalized: "slow-auth@example.invalid",
    emailVerifiedAt: null,
    profile: { displayName: null },
    accountRoles: [{ role: AccountRole.CUSTOMER }],
  };
  let updateCalls = 0;
  let transactionCalls = 0;
  const prismaMock = {
    user: {
      findUnique: async () => storedUser,
      update: async () => {
        updateCalls += 1;
        return storedUser;
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

  assert.equal(updateCalls, 0, "an unchanged identity must not issue a write per API request");
  assert.equal(transactionCalls, 0);
  assert.equal(principal.userId, storedUser.id);
  assert.deepEqual(principal.roles, [AccountRole.CUSTOMER]);
  assert.equal(principal.assuranceLevel, undefined);
});

test("identity attribute changes update only the provider fields and preserve assigned roles", async () => {
  const storedUser = {
    id: "mapped-user-id",
    status: UserStatus.ACTIVE,
    emailNormalized: "old-email@example.invalid",
    emailVerifiedAt: null,
    profile: { displayName: "Retail owner" },
    accountRoles: [{ role: AccountRole.CUSTOMER }, { role: AccountRole.RETAILER }, { role: AccountRole.ADMIN }],
  };
  let updateData: Record<string, unknown> | undefined;
  const prismaMock = {
    user: {
      findUnique: async () => storedUser,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updateData = data;
        return { ...storedUser, emailNormalized: String(data.emailNormalized), emailVerifiedAt: data.emailVerifiedAt as Date };
      },
    },
  };
  const auth = new AuthService(prismaMock as unknown as PrismaService);
  const principal = await auth.resolveIdentity({
    providerId: "supabase-test",
    subject: "mapped-subject",
    email: "new-email@example.invalid",
    emailVerified: true,
    assuranceLevel: "aal2",
  });

  assert.deepEqual(updateData, {
    emailNormalized: "new-email@example.invalid",
    emailVerifiedAt: updateData?.emailVerifiedAt,
  });
  assert.ok(updateData?.emailVerifiedAt instanceof Date);
  assert.equal("lastSignedInAt" in (updateData ?? {}), false);
  assert.equal("profile" in (updateData ?? {}), false);
  assert.equal("accountRoles" in (updateData ?? {}), false);
  assert.equal(principal.userId, storedUser.id);
  assert.deepEqual(principal.roles, [AccountRole.CUSTOMER, AccountRole.RETAILER, AccountRole.ADMIN]);
  assert.equal(principal.assuranceLevel, "aal2");
});

test("inactive identities are rejected without mutating their records", async () => {
  let updateCalls = 0;
  const prismaMock = {
    user: {
      findUnique: async () => ({
        id: "inactive-user-id",
        status: UserStatus.SUSPENDED,
        emailNormalized: "inactive@example.invalid",
        emailVerifiedAt: null,
        profile: { displayName: null },
        accountRoles: [{ role: AccountRole.CUSTOMER }],
      }),
      update: async () => { updateCalls += 1; throw new Error("must not update inactive users"); },
    },
  };
  const auth = new AuthService(prismaMock as unknown as PrismaService);
  await assert.rejects(() => auth.resolveIdentity({
    providerId: "supabase-test",
    subject: "inactive-subject",
    email: "inactive@example.invalid",
    emailVerified: true,
  }), /This account is not active/);
  assert.equal(updateCalls, 0);
});
