import { Transform } from "class-transformer";
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from "class-validator";

export type DiscoverDealsSort = "newest" | "discount" | "nearest";

export class DiscoverDealsDto {
  @IsOptional() @Transform(({ value }) => value === undefined ? 1 : Number(value)) @IsInt() @Min(1) page = 1;
  @IsOptional() @Transform(({ value }) => value === undefined ? 20 : Number(value)) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @Length(1, 100) q?: string;
  @IsOptional() @IsString() @Length(1, 100) category?: string;
  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @Length(1, 100) city?: string;
  @IsOptional() @IsIn(["newest", "discount", "nearest"]) sort?: DiscoverDealsSort;
  @IsOptional() @Transform(({ value }) => value === undefined ? undefined : Number(value)) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Transform(({ value }) => value === undefined ? undefined : Number(value)) @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @Transform(({ value }) => value === undefined ? 10 : Number(value)) @IsNumber() @Min(1) @Max(50) radiusKm = 10;
}
