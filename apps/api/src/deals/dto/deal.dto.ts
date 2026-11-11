import { Transform } from "class-transformer";
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, Matches } from "class-validator";
import { OfferType } from "../../generated/prisma/enums.js";

const trimmed = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;

export class CreateDealDto {
  @IsUUID() storeId!: string;
  @Transform(trimmed) @IsString() @Length(2, 180) title!: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 320) summary?: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 10000) details?: string;
  @Transform(trimmed) @IsString() @Length(1, 10000) terms!: string;
  @IsUUID() categoryId!: string;
  @IsEnum(OfferType) offerType!: OfferType;
  @IsOptional() @IsInt() @Min(1) @Max(10000) discountBps?: number;
  @IsOptional() @IsInt() @Min(1) discountAmountMinor?: number;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsInt() @Min(1) originalPriceMinor?: number;
  @IsOptional() @IsInt() @Min(1) offerPriceMinor?: number;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsOptional() @IsString() @Length(1, 1000) imageReference?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID("4", { each: true }) productIds?: string[];
}

export class UpdateDealDto {
  @IsOptional() @Transform(trimmed) @IsString() @Length(2, 180) title?: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 320) summary?: string | null;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 10000) details?: string | null;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 10000) terms?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsEnum(OfferType) offerType?: OfferType;
  @IsOptional() @IsInt() @Min(1) @Max(10000) discountBps?: number;
  @IsOptional() @IsInt() @Min(1) discountAmountMinor?: number;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsInt() @Min(1) originalPriceMinor?: number;
  @IsOptional() @IsInt() @Min(1) offerPriceMinor?: number;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsString() @Length(1, 1000) imageReference?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID("4", { each: true }) productIds?: string[];
}
