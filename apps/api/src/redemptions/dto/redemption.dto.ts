import { Transform, Type } from "class-transformer";
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Max, Min } from "class-validator";
import { RedemptionCodeStatus } from "../../generated/prisma/enums.js";

const queryNumber = (fallback: number) => ({ value }: { value: unknown }) => value === undefined ? fallback : Number(value);
const trimmed = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;

export class ClaimDealDto {
  @IsUUID()
  dealId!: string;
}

export class RedemptionCredentialDto {
  @IsString()
  @Length(43, 128)
  credential!: string;
}

export class RedemptionPageQueryDto {
  @IsOptional() @Type(() => Number) @Transform(queryNumber(1)) @IsInt() @Min(1)
  page = 1;

  @IsOptional() @Type(() => Number) @Transform(queryNumber(20)) @IsInt() @Min(1) @Max(100)
  limit = 20;

  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.toUpperCase() : value) @IsEnum(RedemptionCodeStatus)
  status?: RedemptionCodeStatus;

  @IsOptional() @IsUUID()
  dealId?: string;

  @IsOptional() @IsUUID()
  storeId?: string;

  @IsOptional() @IsUUID()
  customerUserId?: string;

  @IsOptional() @IsISO8601()
  from?: string;

  @IsOptional() @IsISO8601()
  to?: string;

  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 100)
  q?: string;
}
