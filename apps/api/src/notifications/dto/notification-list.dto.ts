import { Transform, Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class NotificationListDto {
  @IsOptional() @Type(() => Number) @Transform(({ value }) => value === undefined ? 1 : Number(value)) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @Transform(({ value }) => value === undefined ? 20 : Number(value)) @IsInt() @Min(1) @Max(100) limit = 20;
}
