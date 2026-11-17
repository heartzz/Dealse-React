import type { AccountRole } from "../generated/prisma/enums.js";

export interface AuthPrincipal {
  userId: string;
  providerId: string;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  assuranceLevel?: string;
  roles: AccountRole[];
  displayName: string | null;
}

export interface AuthenticatedRequest {
  headers: { authorization?: string };
  url?: string;
  authPrincipal?: AuthPrincipal;
}
