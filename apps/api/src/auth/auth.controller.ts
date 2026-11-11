import { Body, Controller, Get, Inject, Put } from "@nestjs/common";
import { CurrentUser } from "./current-user.decorator.js";
import { RequireAccountRole } from "./require-account-role.decorator.js";
import { AccountRole } from "../generated/prisma/enums.js";
import type { AuthPrincipal } from "./auth.types.js";
import { UpdateProfileDto } from "./dto/update-profile.dto.js";
import { AuthService } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Get("me")
  me(@CurrentUser() user: AuthPrincipal) {
    return {
      id: user.userId,
      email: user.email,
      emailVerified: user.emailVerified,
      roles: user.roles.map((role) => role.toLowerCase()),
      profile: {
        displayName: user.displayName,
      },
    };
  }

  @Put("me/profile")
  @RequireAccountRole(AccountRole.CUSTOMER)
  updateProfile(
    @CurrentUser() user: AuthPrincipal,
    @Body() input: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user, input.displayName);
  }
}
