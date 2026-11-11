import { Transform } from "class-transformer";
import { IsOptional, IsString, IsUUID, Length, Matches } from "class-validator";

const trimmed = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;

export class CreateProductDto {
  @Transform(trimmed) @IsString() @Length(2, 140) @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) slug!: string;
  @Transform(trimmed) @IsString() @Length(2, 180) name!: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 4000) description?: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 120) brand?: string;
  @IsUUID() categoryId!: string;
  @IsOptional() @IsUUID() storeId?: string;
}

export class UpdateProductDto {
  @IsOptional() @Transform(trimmed) @IsString() @Length(2, 140) @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) slug?: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(2, 180) name?: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 4000) description?: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 120) brand?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() storeId?: string;
}
