import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";

interface HttpResponse {
  status(code: number): HttpResponse;
  json(body: unknown): void;
}

@Catch()
export class MediaUploadExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(MediaUploadExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const code = typeof exception === "object" && exception !== null && "code" in exception
      ? (exception as { code?: unknown }).code
      : undefined;

    if (typeof code === "string" && code.startsWith("LIMIT_")) {
      const status = code === "LIMIT_FILE_SIZE" ? 413 : 400;
      const message = code === "LIMIT_FILE_SIZE"
        ? "Choose an image smaller than 5 MB."
        : "Upload one image with no more than four fields.";
      response.status(status).json({ statusCode: status, message });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).json(typeof body === "string" ? { statusCode: status, message: body } : body);
      return;
    }

    this.logger.error("Unexpected error while processing a retailer image upload.");
    response.status(500).json({ statusCode: 500, message: "Internal server error" });
  }
}
