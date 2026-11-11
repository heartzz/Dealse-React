import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseFilters,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { OptionalAuthRoute } from "../auth/optional-auth-route.decorator.js";
import { OptionalCurrentUser } from "../auth/optional-current-user.decorator.js";
import { RequireAccountRole } from "../auth/require-account-role.decorator.js";
import { AccountRole } from "../generated/prisma/enums.js";
import { UploadMediaDto } from "./dto/upload-media.dto.js";
import { UpdateMediaAssociationsDto } from "./dto/update-media-associations.dto.js";
import { MediaUploadExceptionFilter } from "./media-upload-exception.filter.js";
import { MediaService } from "./media.service.js";

const maxUploadBytes = 5 * 1024 * 1024;
type UploadedMediaFile = { buffer: Buffer; mimetype: string; size: number };
interface MediaHttpResponse {
  setHeader(name: string, value: string | number): void;
  status(code: number): MediaHttpResponse;
  send(body: Buffer): MediaHttpResponse;
  end(): MediaHttpResponse;
}

@Controller("media")
export class MediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}

  @Post("upload")
  @RequireAccountRole(AccountRole.RETAILER)
  @UseFilters(MediaUploadExceptionFilter)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: maxUploadBytes, files: 1, fields: 6, fieldSize: 16 * 1024 } }))
  upload(
    @CurrentUser() user: AuthPrincipal,
    @UploadedFile() file: UploadedMediaFile | undefined,
    @Body() input: UploadMediaDto,
  ) {
    return this.media.upload(user, input, file);
  }

  @Patch("associations")
  @RequireAccountRole(AccountRole.RETAILER)
  updateAssociations(
    @CurrentUser() user: AuthPrincipal,
    @Body() input: UpdateMediaAssociationsDto,
  ) {
    return this.media.updateAssociations(user, input);
  }

  @Delete(":mediaId")
  @RequireAccountRole(AccountRole.RETAILER)
  remove(
    @CurrentUser() user: AuthPrincipal,
    @Param("mediaId", new ParseUUIDPipe()) mediaId: string,
    @Query("retailerId", new ParseUUIDPipe()) retailerId: string,
  ) {
    return this.media.remove(user, retailerId, mediaId);
  }

  @Get(":mediaId/content")
  @OptionalAuthRoute()
  async content(
    @Param("mediaId", new ParseUUIDPipe()) mediaId: string,
    @OptionalCurrentUser() user: AuthPrincipal | undefined,
    @Headers("if-none-match") ifNoneMatch: string | undefined,
    @Res() response: MediaHttpResponse,
  ) {
    const image = await this.media.readContent(mediaId, user);
    const etag = `"${image.checksumSha256}"`;
    response.setHeader("Content-Type", image.mimeType);
    response.setHeader("Content-Length", image.bytes.length);
    response.setHeader("Cache-Control", image.isPublic ? "public, max-age=3600, stale-while-revalidate=86400" : "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("ETag", etag);
    if (ifNoneMatch === etag) return response.status(304).end();
    return response.status(200).send(image.bytes);
  }
}
