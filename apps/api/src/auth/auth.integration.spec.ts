import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { AccountRole } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import { RetailersService } from "../retailers/retailers.service.js";
import { AppModule } from "../app.module.js";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AuthService } from "./auth.service.js";
import { AccountRoleGuard } from "./account-role.guard.js";
import { OidcAuthGuard } from "./oidc-auth.guard.js";
import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";

const prisma = new PrismaService();
const auth = new AuthService(prisma);
const retailers = new RetailersService(prisma);
const suffix = randomUUID();
const customerIdentity = {
  providerId: "supabase-test",
  subject: `customer-${suffix}`,
  email: `customer-${suffix}@example.invalid`,
  emailVerified: false,
};
const retailerIdentity = {
  providerId: "supabase-test",
  subject: `retailer-${suffix}`,
  email: `retailer-${suffix}@example.invalid`,
  emailVerified: false,
};
const userIds: string[] = [];
const retailerIds: string[] = [];

before(async () => prisma.$connect());

after(async () => {
  if (userIds.length) {
    await prisma.$transaction(async (transaction) => {
      await transaction.retailerMembership.deleteMany({
        where: { retailerId: { in: retailerIds } },
      });
      await transaction.retailer.deleteMany({ where: { id: { in: retailerIds } } });
      await transaction.userAccountRole.deleteMany({ where: { userId: { in: userIds } } });
      await transaction.userProfile.deleteMany({ where: { userId: { in: userIds } } });
      await transaction.user.deleteMany({ where: { id: { in: userIds } } });
    });
  }
  await prisma.$disconnect();
});

test("Supabase identity provisions PostgreSQL customer profile and retailer role safely", async () => {
  const customer = await auth.resolveIdentity(customerIdentity);
  userIds.push(customer.userId);
  assert.deepEqual(customer.roles, [AccountRole.CUSTOMER]);
  assert.equal(customer.email, customerIdentity.email);
  assert.equal(customer.emailVerified, false);

  const profile = await prisma.userProfile.findUnique({ where: { userId: customer.userId } });
  assert.ok(profile, "first authenticated request creates a local profile");
  await auth.updateProfile(customer, "Test Customer");
  const savedProfile = await prisma.userProfile.findUniqueOrThrow({
    where: { userId: customer.userId },
  });
  assert.equal(savedProfile.displayName, "Test Customer");

  const retailerPrincipal = await auth.resolveIdentity(retailerIdentity);
  userIds.push(retailerPrincipal.userId);
  const retailer = await retailers.createRetailer(retailerPrincipal, {
    displayName: `Test Retailer ${suffix.slice(0, 8)}`,
  });
  retailerIds.push(retailer.id);

  const refreshedRetailer = await auth.resolveIdentity(retailerIdentity);
  assert.deepEqual(
    [...refreshedRetailer.roles].sort(),
    [AccountRole.CUSTOMER, AccountRole.RETAILER].sort(),
  );
  const mine = await retailers.listMyRetailers(refreshedRetailer);
  assert.equal(mine.length, 1);
  assert.equal(mine[0]?.id, retailer.id);

  const repeatLogin = await auth.resolveIdentity(customerIdentity);
  assert.equal(repeatLogin.userId, customer.userId);
  assert.deepEqual(repeatLogin.roles, [AccountRole.CUSTOMER]);

  await assert.rejects(
    retailers.listStores(customer, retailer.id),
    (error: unknown) =>
      typeof error === "object" && error !== null &&
      "getStatus" in error && typeof error.getStatus === "function" &&
      error.getStatus() === 404,
  );
});

test("retailer role guard rejects a customer principal", () => {
  const reflector = {
    getAllAndOverride: () => [AccountRole.RETAILER],
  } as unknown as Reflector;
  const guard = new AccountRoleGuard(reflector);
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ authPrincipal: { userId: "customer", roles: [AccountRole.CUSTOMER] } }),
    }),
  } as unknown as ExecutionContext;
  assert.throws(() => guard.canActivate(context), { message: "This account does not have the required role." });
});

test("admin role guard requires the provider-verified AAL2 claim", () => {
  const reflector = { getAllAndOverride: () => [AccountRole.ADMIN] } as unknown as Reflector;
  const guard = new AccountRoleGuard(reflector);
  const makeContext = (assuranceLevel: string) => ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ authPrincipal: { userId: "admin", roles: [AccountRole.ADMIN], assuranceLevel } }) }),
  }) as unknown as ExecutionContext;
  assert.throws(() => guard.canActivate(makeContext("aal1")), { message: "Administrator access requires a verified second factor." });
  assert.equal(guard.canActivate(makeContext("aal2")), true);
});

test("NestJS accepts a signed issuer/audience-bound token and rejects a forged signature", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = {
    ...await exportJWK(publicKey),
    kid: `test-${suffix}`,
    use: "sig",
    alg: "RS256",
  };
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const previous = {
    provider: process.env.OIDC_PROVIDER_ID,
    issuer: process.env.OIDC_ISSUER,
    audience: process.env.OIDC_AUDIENCE,
    jwks: process.env.OIDC_JWKS_URL,
  };
  const issuer = "https://dealse-test.supabase.co/auth/v1";
  process.env.OIDC_PROVIDER_ID = "supabase-test";
  process.env.OIDC_ISSUER = issuer;
  process.env.OIDC_AUDIENCE = "authenticated";
  process.env.OIDC_JWKS_URL = `http://127.0.0.1:${address.port}/jwks`;

  try {
    const subject = `jwt-${suffix}`;
    const token = await new SignJWT({ email: `jwt-${suffix}@example.invalid`, aal: "aal2" })
      .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
      .setIssuer(issuer)
      .setAudience("authenticated")
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    const request: { headers: { authorization?: string }; authPrincipal?: { subject: string; userId?: string } } = {
      headers: { authorization: `Bearer ${token}` },
    };
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const guardRef: { value?: OidcAuthGuard } = {};
    const app = await NestFactory.create(AppModule, { logger: ["error"] });
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, "127.0.0.1");
    try {
      // Exercise the exact guard instance registered by APP_GUARD. Warming a
      // separate instance can hide differences in JWKS caching/configuration.
      const oidcGuard = app.get(OidcAuthGuard);
      guardRef.value = oidcGuard;
      const jwksProbe = await fetch(process.env.OIDC_JWKS_URL!);
      assert.equal(jwksProbe.status, 200, "local JWKS fixture is reachable before API verification");
      await jwksProbe.arrayBuffer();
      assert.equal(await oidcGuard.canActivate(context), true);
      assert.equal(request.authPrincipal?.subject, subject);
      if (request.authPrincipal?.userId) userIds.push(request.authPrincipal.userId);

      const apiAddress = app.getHttpServer().address();
      assert.ok(apiAddress && typeof apiAddress !== "string");
      const apiOrigin = `http://127.0.0.1:${apiAddress.port}`;
      const authorization = { Authorization: `Bearer ${token}` };

      const meResponse = await fetch(`${apiOrigin}/api/v1/auth/me`, {
        headers: authorization,
      });
      const meBody = await meResponse.text();
      assert.equal(meResponse.status, 200, meBody);
      const me = JSON.parse(meBody) as { roles: string[]; profile: { displayName: string | null } };
      assert.deepEqual(me.roles, ["customer"]);
      assert.equal(me.profile.displayName, null);

      const invalidDiscoveryQueries = [
        ["sort=best", "reject unsupported sort values"],
        ["q=", "reject empty search text"],
        ["q=" + "x".repeat(101), "reject oversized search text"],
        ["unexpected=1", "reject unknown query keys"],
        ["radiusKm=51", "bound the nearby search radius"],
        ["latitude=not-a-number&longitude=72", "reject malformed coordinates"],
        ["latitude=23", "require coordinate pairs"],
      ] as const;
      for (const [query, expectation] of invalidDiscoveryQueries) {
        const invalid = await fetch(`${apiOrigin}/api/v1/deals?${query}`);
        assert.equal(invalid.status, 400, `public discovery must ${expectation}`);
      }

      const denied = await fetch(`${apiOrigin}/api/v1/retailers/mine`, {
        headers: authorization,
      });
      assert.equal(denied.status, 403, "customer account cannot enter retailer endpoints");

      const createRetailer = await fetch(`${apiOrigin}/api/v1/retailers`, {
        method: "POST",
        headers: { ...authorization, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: `HTTP Retailer ${suffix.slice(0, 8)}` }),
      });
      assert.equal(createRetailer.status, 201);
      const retailer = await createRetailer.json() as { id: string };
      retailerIds.push(retailer.id);

      const allowed = await fetch(`${apiOrigin}/api/v1/retailers/mine`, {
        headers: authorization,
      });
      assert.equal(allowed.status, 200, "retailer account can access its retailer endpoint");

      const adminDenied = await fetch(`${apiOrigin}/api/v1/admin/overview`, { headers: authorization });
      assert.equal(adminDenied.status, 403, "retailer account cannot enter the admin workspace API");
      assert.ok(request.authPrincipal?.userId);
      await prisma.userAccountRole.create({ data: { userId: request.authPrincipal.userId, role: AccountRole.ADMIN } });
      const aal1Token = await new SignJWT({ email: `jwt-${suffix}@example.invalid`, aal: "aal1" })
        .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
        .setIssuer(issuer)
        .setAudience("authenticated")
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
      const aal1Denied = await fetch(`${apiOrigin}/api/v1/admin/overview`, {
        headers: { Authorization: `Bearer ${aal1Token}` },
      });
      assert.equal(aal1Denied.status, 403, "an admin role without verified MFA cannot use admin APIs");
      const adminAllowed = await fetch(`${apiOrigin}/api/v1/admin/overview`, { headers: authorization });
      const adminBody = await adminAllowed.text();
      assert.equal(adminAllowed.status, 200, adminBody);
      assert.deepEqual(Object.keys(JSON.parse(adminBody)).sort(), ["openReports", "pendingRetailers", "publishedDeals", "unreviewedStores"]);
    } finally {
      await app.close();
    }

    const forged = await generateKeyPair("RS256");
    const forgedToken = await new SignJWT({ email: `forged-${suffix}@example.invalid` })
      .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
      .setIssuer(issuer)
      .setAudience("authenticated")
      .setSubject(`forged-${suffix}`)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(forged.privateKey);
    request.headers.authorization = `Bearer ${forgedToken}`;
    await assert.rejects(guardRef.value!.canActivate(context), (error: unknown) =>
      typeof error === "object" && error !== null &&
      "getStatus" in error && typeof error.getStatus === "function" &&
      error.getStatus() === 401,
    );
  } finally {
    if (previous.provider === undefined) delete process.env.OIDC_PROVIDER_ID;
    else process.env.OIDC_PROVIDER_ID = previous.provider;
    if (previous.issuer === undefined) delete process.env.OIDC_ISSUER;
    else process.env.OIDC_ISSUER = previous.issuer;
    if (previous.audience === undefined) delete process.env.OIDC_AUDIENCE;
    else process.env.OIDC_AUDIENCE = previous.audience;
    if (previous.jwks === undefined) delete process.env.OIDC_JWKS_URL;
    else process.env.OIDC_JWKS_URL = previous.jwks;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
  }
});
