import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { MediaPurpose } from "../../generated/prisma/enums.js";

export class UploadMediaDto {
  @IsUUID()
  retailerId!: string;

  @IsUUID()
  targetId!: string;

  @IsEnum(MediaPurpose)
  purpose!: MediaPurpose;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  altText?: string;

  @IsOptional()
  @IsUUID("4")
  uploadId?: string;

  @IsOptional()
  @IsUUID("4")
  replaceMediaId?: string;
}
