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

function safeProviderErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error) || typeof error.code !== "string") return null;
  return /^[A-Z0-9_]{1,80}$/i.test(error.code) ? error.code : null;
}

function safeHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("getStatus" in error) || typeof error.getStatus !== "function") return null;
  try {
    const status = error.getStatus();
    return typeof status === "number" && Number.isInteger(status) ? status : null;
  } catch {
    return null;
  }
}

function safeSupabaseProjectRef(url: URL): string {
  const match = url.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  return match?.[1] ?? "custom-host";
}

@Injectable()
export class OidcAuthGuard implements CanActivate {
  private jwksUrl: string | undefined;
  private jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
  private oidcConfigurationLogged = false;

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
    } catch (error) {
      console.warn("[DealSe Auth] provider access token rejected", {
        stage: "jwt_verification",
        httpStatus: 401,
        providerErrorCode: safeProviderErrorCode(error),
        tokenPresented: true,
      });
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
    try {
      request.authPrincipal = await this.authService.resolveIdentity(identity);
    } catch (error) {
      console.warn("[DealSe Auth] provider identity could not be mapped", {
        stage: "identity_mapping",
        httpStatus: safeHttpStatus(error),
        identityMapped: false,
      });
      throw error;
    }
    if (request.url?.split("?", 1)[0]?.endsWith("/auth/me")) {
      console.info("[DealSe Auth] /auth/me accepted identity", {
        stage: "api_auth_me",
        httpStatus: 200,
        accessTokenAccepted: true,
        identityMapped: true,
        accountActive: true,
        roles: request.authPrincipal.roles.map((role) => role.toLowerCase()),
        assuranceLevel: request.authPrincipal.assuranceLevel === "aal1" || request.authPrincipal.assuranceLevel === "aal2"
          ? request.authPrincipal.assuranceLevel
          : "unknown",
      });
    }
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
      console.error("[DealSe Auth] Supabase OIDC configuration is incomplete", {
        stage: "oidc_configuration",
        providerIdConfigured: Boolean(providerId),
        issuerConfigured: Boolean(issuer),
        audienceConfigured: Boolean(audience),
        jwksUrlConfigured: Boolean(jwksUrlValue),
      });
      throw new ServiceUnavailableException("OIDC authentication is not configured.");
    }
    if (providerId.length > 64) {
      console.error("[DealSe Auth] Supabase OIDC provider label is invalid", {
        stage: "oidc_configuration",
        providerIdLengthValid: false,
      });
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
      if (!this.oidcConfigurationLogged) {
        this.oidcConfigurationLogged = true;
        const configuredSupabaseUrl = process.env.SUPABASE_URL?.trim();
        let storageProjectMatchesIssuer: boolean | null = null;
        let storageProjectRef: string | null = null;
        if (configuredSupabaseUrl) {
          try {
            const storageUrl = new URL(configuredSupabaseUrl);
            storageProjectRef = safeSupabaseProjectRef(storageUrl);
            storageProjectMatchesIssuer = storageUrl.hostname === issuerUrl.hostname;
          } catch {
            storageProjectMatchesIssuer = false;
          }
        }
        const configuration = {
          stage: "oidc_configuration",
          issuerProjectRef: safeSupabaseProjectRef(issuerUrl),
          jwksProjectRef: safeSupabaseProjectRef(jwksUrl),
          storageProjectRef,
          providerLabelExpected: providerId === "supabase",
          issuerPathValid: issuerUrl.pathname.replace(/\/$/, "") === "/auth/v1",
          issuerAndJwksSameHost: issuerUrl.hostname === jwksUrl.hostname,
          jwksPathValid: jwksUrl.pathname.replace(/\/$/, "") === "/auth/v1/.well-known/jwks.json",
          storageProjectMatchesIssuer,
        };
        if (!configuration.providerLabelExpected || !configuration.issuerPathValid || !configuration.issuerAndJwksSameHost || !configuration.jwksPathValid || storageProjectMatchesIssuer === false) {
          console.error("[DealSe Auth] Supabase OIDC configuration is inconsistent", configuration);
        } else {
          console.info("[DealSe Auth] Supabase OIDC configuration checked", configuration);
        }
      }
      return { providerId, issuer, audience, jwksUrl };
    } catch {
      console.error("[DealSe Auth] Supabase OIDC endpoint configuration is invalid", {
        stage: "oidc_configuration",
        endpointsValid: false,
        httpsRequired: process.env.NODE_ENV === "production",
      });
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
