import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { RemoteJWKSetOptions } from "jose";
import { AuthService, type VerifiedIdentity } from "./auth.service.js";
import type { AuthenticatedRequest } from "./auth.types.js";
import { IS_OPTIONAL_AUTH_ROUTE } from "./optional-auth-route.decorator.js";
import { IS_PUBLIC_ROUTE } from "./public-route.decorator.js";

interface OidcSettings {
  providerId: string;
  issuer: string;
  audience: string;
  jwksUrl: URL;
}

const jwksOptions: RemoteJWKSetOptions = {
  timeoutDuration: 5_000,
  cooldownDuration: 30_000,
  cacheMaxAge: 10 * 60_000,
};

@Injectable()
export class OidcAuthGuard implements CanActivate {
  private jwksUrl: string | undefined;
  private jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isOptionalAuth && !request.headers.authorization) return true;
    const token = this.readBearerToken(request.headers.authorization);
    const settings = this.readSettings();

    let payload;
    try {
      const verified = await jwtVerify(token, this.getJwks(settings), {
        issuer: settings.issuer,
        audience: settings.audience,
        algorithms: ["RS256", "ES256"],
      });
      payload = verified.payload;
    } catch {
      throw new UnauthorizedException("The access token is invalid or expired.");
    }

    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw new UnauthorizedException("The access token has no subject.");
    }

    const identity: VerifiedIdentity = {
      providerId: settings.providerId,
      subject: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      emailVerified: payload.email_verified === true,
      assuranceLevel: typeof payload.aal === "string" ? payload.aal : undefined,
    };
    request.authPrincipal = await this.authService.resolveIdentity(identity);
    return true;
  }

  private readBearerToken(authorization?: string): string {
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
    if (!match) throw new UnauthorizedException("A bearer access token is required.");
    return match[1];
  }

  private readSettings(): OidcSettings {
    const providerId = process.env.OIDC_PROVIDER_ID?.trim();
    const issuer = process.env.OIDC_ISSUER?.trim();
    const audience = process.env.OIDC_AUDIENCE?.trim();
    const jwksUrlValue = process.env.OIDC_JWKS_URL?.trim();
    if (!providerId || !issuer || !audience || !jwksUrlValue) {
      throw new ServiceUnavailableException("OIDC authentication is not configured.");
    }
    if (providerId.length > 64) {
      throw new ServiceUnavailableException("OIDC_PROVIDER_ID must be at most 64 characters.");
    }

    try {
      const issuerUrl = new URL(issuer);
      const jwksUrl = new URL(jwksUrlValue);
      if (
        process.env.NODE_ENV === "production" &&
        (issuerUrl.protocol !== "https:" || jwksUrl.protocol !== "https:")
      ) {
        throw new Error("HTTPS is required for production OIDC endpoints.");
      }
      return { providerId, issuer, audience, jwksUrl };
    } catch {
      throw new ServiceUnavailableException("OIDC endpoint configuration is invalid.");
    }
  }

  private getJwks(settings: OidcSettings): ReturnType<typeof createRemoteJWKSet> {
    const url = settings.jwksUrl.toString();
    if (!this.jwks || this.jwksUrl !== url) {
      this.jwks = createRemoteJWKSet(settings.jwksUrl, jwksOptions);
      this.jwksUrl = url;
    }
    return this.jwks;
  }
}
