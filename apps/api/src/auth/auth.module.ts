import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DatabaseModule } from "../database/database.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { OidcAuthGuard } from "./oidc-auth.guard.js";
import { AccountRoleGuard } from "./account-role.guard.js";

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    OidcAuthGuard,
    AccountRoleGuard,
    { provide: APP_GUARD, useExisting: OidcAuthGuard },
    { provide: APP_GUARD, useExisting: AccountRoleGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
