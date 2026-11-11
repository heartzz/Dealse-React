import { Transform } from "class-transformer";
import { IsOptional, IsString, Length } from "class-validator";

export class CreateRetailerDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(2, 180)
  displayName!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(2, 255)
  legalName?: string;
}
