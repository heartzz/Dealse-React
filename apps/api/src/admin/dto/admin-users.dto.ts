import { Transform } from "class-transformer";
import { ArrayUnique, IsArray, IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { AdminPermissionKey, AdminRole, AdminAccountStatus } from "../../generated/prisma/enums.js";
import { AdminPageQueryDto } from "./admin.dto.js";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;

export class AdminUserQueryDto extends AdminPageQueryDto {
  @IsOptional() @Transform(({ value }) => value === true || value === "true") @IsBoolean() all?: boolean;
  @IsOptional() @Transform(trim) @IsString() @Length(1, 100) q?: string;
  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.toUpperCase() : value) @IsEnum(AdminRole) role?: AdminRole;
  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.toUpperCase() : value) @IsEnum(AdminAccountStatus) status?: AdminAccountStatus;
}

export class InviteAdminDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value) @IsEmail() email!: string;
  @IsEnum(AdminRole) role!: AdminRole;
  @IsArray() @ArrayUnique() @IsEnum(AdminPermissionKey, { each: true }) permissions!: AdminPermissionKey[];
  @Transform(trim) @IsString() @Length(5, 500) reason!: string;
}

export class UpdateAdminUserDto {
  @IsOptional() @IsEnum(AdminRole) role?: AdminRole;
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(AdminPermissionKey, { each: true }) permissions?: AdminPermissionKey[];
  @Transform(trim) @IsString() @Length(5, 500) reason!: string;
}

export class AdminUserReasonDto {
  @Transform(trim) @IsString() @Length(5, 500) reason!: string;
}

export class AcceptAdminInvitationDto {
  @IsUUID() invitationId!: string;
}
