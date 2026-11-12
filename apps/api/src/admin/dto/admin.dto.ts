import { Transform, Type } from "class-transformer";
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";
import { DealReportReason, DealReportStatus, DealStatus, RetailerStatus, StoreStatus } from "../../generated/prisma/enums.js";

const trimmed = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
const queryNumber = (fallback: number) => ({ value }: { value: unknown }) => value === undefined ? fallback : Number(value);

export class AdminPageQueryDto {
  @IsOptional() @Type(() => Number) @Transform(queryNumber(1)) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @Transform(queryNumber(20)) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class AdminRetailerQueryDto extends AdminPageQueryDto {
  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.toUpperCase() : value) @IsEnum(RetailerStatus) status?: RetailerStatus;
  @IsOptional() @Transform(({ value }) => value === true || value === "true") @IsBoolean() all?: boolean;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 100) q?: string;
}

export class AdminStoreQueryDto extends AdminPageQueryDto {
  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.toUpperCase() : value) @IsEnum(StoreStatus) status?: StoreStatus;
  @IsOptional() @Transform(({ value }) => value === true || value === "true") @IsBoolean() all?: boolean;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 100) q?: string;
}

export class AdminDealQueryDto extends AdminPageQueryDto {
  @IsOptional() @Transform(({ value }) => {
    if (typeof value !== "string") return value;
    const normalized = value.toLowerCase();
    return ["pending", "suspended", "paused", "expired"].includes(normalized) ? normalized : value.toUpperCase();
  }) @IsIn([...Object.values(DealStatus), "pending", "suspended", "paused", "expired"]) status?: DealStatus | "pending" | "suspended" | "paused" | "expired";
  @IsOptional() @Transform(({ value }) => value === true || value === "true") @IsBoolean() all?: boolean;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 100) q?: string;
}

export class AdminReportQueryDto extends AdminPageQueryDto {
  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.toUpperCase() : value) @IsEnum(DealReportStatus) status?: DealReportStatus;
}

export class AdminAuditQueryDto extends AdminPageQueryDto {
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 80) entityType?: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 80) entityId?: string;
}

export class ModerationReasonDto {
  @Transform(trimmed) @IsString() @Length(5, 500) reason!: string;
}

export class CreateCategoryDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value)
  @IsString() @Length(2, 100) @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) slug!: string;
  @Transform(trimmed) @IsString() @Length(2, 100) name!: string;
  @IsOptional() @IsInt() @Min(0) @Max(32767) sortOrder?: number;
}

export class UpdateCategoryDto {
  @IsOptional() @Transform(trimmed) @IsString() @Length(2, 100) name?: string;
  @IsOptional() @IsInt() @Min(0) @Max(32767) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateDealReportDto {
  @IsEnum(DealReportReason)
  reason!: DealReportReason;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 1000) details?: string;
}

export class ReviewDealReportDto {
  @IsIn([DealReportStatus.RESOLVED, DealReportStatus.DISMISSED])
  status!: typeof DealReportStatus.RESOLVED | typeof DealReportStatus.DISMISSED;
  @Transform(trimmed) @IsString() @Length(5, 1000) resolution!: string;
}
