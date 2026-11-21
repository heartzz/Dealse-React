import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { AccountRole, UserStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import { AuthService } from "../auth/auth.service.js";
import { AdminService } from "./admin.service.js";
import { AdminCustomerQueryDto } from "./dto/admin.dto.js";
import { DealsService } from "../deals/deals.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";

const prisma = new PrismaService();
const auth = new AuthService(prisma);
const admin = new AdminService(prisma, new DealsService(prisma, new NotificationsService(prisma)));
const suffix = randomUUID();
const userIds: string[] = [];
let customerId = "";

before(async () => {
  await prisma.$connect();
  const customer = await auth.resolveIdentity({ providerId: "admin-customer-test", subject: `customer-${suffix}`, email: `customer-${suffix}@example.invalid`, emailVerified: true });
  const retailer = await prisma.user.create({ data: {
    authProvider: "admin-customer-test", authSubject: `retailer-${suffix}`, emailNormalized: `retailer-${suffix}@example.invalid`,
    profile: { create: {} }, accountRoles: { create: { role: AccountRole.RETAILER } },
  } });
  userIds.push(customer.userId, retailer.id);
  customerId = customer.userId;
  await prisma.userProfile.update({ where: { userId: customer.userId }, data: { displayName: `Customer ${suffix.slice(0, 8)}` } });
  await prisma.user.update({ where: { id: customer.userId }, data: { status: UserStatus.SUSPENDED } });
});

after(async () => {
  if (userIds.length) await prisma.$transaction(async (tx) => {
    await tx.userAccountRole.deleteMany({ where: { userId: { in: userIds } } });
    await tx.userProfile.deleteMany({ where: { userId: { in: userIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  });
  await prisma.$disconnect();
});

test("customer administration list includes only customer-role users and supports status/search filters", async () => {
  const base = Object.assign(new AdminCustomerQueryDto(), { page: 1, limit: 20 });
  const suspended = await admin.listCustomers(Object.assign(new AdminCustomerQueryDto(), { ...base, status: UserStatus.SUSPENDED, q: suffix.slice(0, 8) }));
  assert.equal(suspended.items.length, 1);
  assert.equal((suspended.items[0] as { id: string }).id, customerId);
  const allMatches = await admin.listCustomers(Object.assign(new AdminCustomerQueryDto(), { ...base, q: suffix.slice(0, 8) }));
  assert.equal(allMatches.total, 1, "retailer-only identity is not listed as a customer");
});
