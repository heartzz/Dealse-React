import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import { AccountRole, UserStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import type { AuthPrincipal } from "./auth.types.js";

export interface VerifiedIdentity {
  providerId: string;
  subject: string;
  email?: string;
  emailVerified: boolean;
  assuranceLevel?: string;
}

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async resolveIdentity(identity: VerifiedIdentity): Promise<AuthPrincipal> {
    const where = {
      authProvider_authSubject: {
        authProvider: identity.providerId,
        authSubject: identity.subject,
      },
    };
    const include = { profile: true, accountRoles: true } as const;
    let user = await this.prisma.user.findUnique({ where, include });
    let created = false;
    if (!user) {
      try {
        user = await this.prisma.user.create({
          data: {
            authProvider: identity.providerId,
            authSubject: identity.subject,
            emailNormalized: this.normalizedEmail(identity.email),
            emailVerifiedAt: identity.emailVerified ? new Date() : null,
            lastSignedInAt: new Date(),
            profile: { create: {} },
            accountRoles: { create: { role: AccountRole.CUSTOMER } },
          },
          include,
        });
        created = true;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        user = await this.prisma.user.findUnique({ where, include });
        if (!user) throw error;
      }
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException("This account is not active.");
    }

    if (created) return this.toPrincipal(user, identity);

    // Authentication guards run on every protected API request. Keep the
    // normal path read-only: writing lastSignedInAt and upserting relations on
    // every request creates avoidable transactions and serializes concurrent
    // requests for the same user. Sync provider attributes only when changed;
    // profile/customer-role repair is limited to legacy records that lack one.
    const normalizedEmail = this.normalizedEmail(identity.email);
    const signedInAt = new Date();
    const emailChanged = Boolean(normalizedEmail && normalizedEmail !== user.emailNormalized);
    const emailVerifiedChanged = Boolean(identity.emailVerified && !user.emailVerifiedAt);
    const missingCustomerRole = !user.accountRoles.some(({ role }) => role === AccountRole.CUSTOMER);
    const missingProfile = !user.profile;
    const hasChanges = emailChanged || emailVerifiedChanged || missingCustomerRole || missingProfile;
    if (!hasChanges) return this.toPrincipal(user, identity);

    const refreshed = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(emailChanged && normalizedEmail
          ? {
              emailNormalized: normalizedEmail,
              emailVerifiedAt: identity.emailVerified ? user.emailVerifiedAt ?? signedInAt : null,
            }
          : emailVerifiedChanged ? { emailVerifiedAt: signedInAt } : {}),
        ...(missingProfile ? { profile: { create: {} } } : {}),
        ...(missingCustomerRole ? {
          accountRoles: {
            upsert: {
              where: { userId_role: { userId: user.id, role: AccountRole.CUSTOMER } },
              create: { role: AccountRole.CUSTOMER },
              update: {},
            },
          },
        } : {}),
      },
      include,
    });
    return this.toPrincipal(refreshed, identity);
  }

  async updateProfile(user: AuthPrincipal, displayName: string) {
    const profile = await this.prisma.userProfile.upsert({
      where: { userId: user.userId },
      create: { userId: user.userId, displayName: displayName.trim() },
      update: { displayName: displayName.trim() },
      select: { displayName: true, phoneE164: true, locale: true },
    });
    return { ...this.toPublicUser(user), profile };
  }

  private normalizedEmail(email?: string): string | null {
    return email?.trim().toLowerCase() || null;
  }

  private toPrincipal(
    user: Prisma.UserGetPayload<{ include: { profile: true; accountRoles: true } }>,
    identity: VerifiedIdentity,
  ): AuthPrincipal {
    return {
      userId: user.id,
      providerId: identity.providerId,
      subject: identity.subject,
      email: user.emailNormalized,
      emailVerified: user.emailVerifiedAt !== null,
      assuranceLevel: identity.assuranceLevel,
      roles: user.accountRoles.map(({ role }) => role),
      displayName: user.profile?.displayName ?? null,
    };
  }

  private toPublicUser(user: AuthPrincipal) {
    return {
      id: user.userId,
      email: user.email,
      emailVerified: user.emailVerified,
      roles: user.roles.map((role) => role.toLowerCase()),
      displayName: user.displayName,
    };
  }
}
