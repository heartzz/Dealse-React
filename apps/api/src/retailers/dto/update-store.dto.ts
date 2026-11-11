import { Transform } from "class-transformer";
import { IsEmail, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from "class-validator";

const trimmed = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;

export class UpdateStoreDto {
  @IsOptional() @Transform(trimmed) @IsString() @Length(2, 120) @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) slug?: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(2, 180) name?: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 2000) description?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 32) phone?: string;
  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value) @IsEmail() @Length(3, 320) email?: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 255) addressLine1?: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 255) addressLine2?: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 120) locality?: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 100) city?: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 100) region?: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 24) postalCode?: string;
  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.toUpperCase().trim() : value) @IsString() @Matches(/^[A-Z]{2}$/) countryCode?: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 64) timezone?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 7 }) @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 7 }) @Min(-180) @Max(180) longitude?: number;
}
