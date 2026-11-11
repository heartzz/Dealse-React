import { ArrayMaxSize, ArrayUnique, IsArray, IsEnum, IsUUID } from "class-validator";
import { MediaPurpose } from "../../generated/prisma/enums.js";

export class UpdateMediaAssociationsDto {
  @IsUUID()
  retailerId!: string;

  @IsUUID()
  targetId!: string;

  @IsEnum(MediaPurpose)
  purpose!: MediaPurpose;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsUUID("4", { each: true })
  mediaIds!: string[];

  @IsUUID("4")
  primaryMediaId!: string;
}
