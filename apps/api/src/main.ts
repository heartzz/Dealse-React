import { ValidationPipe } from "@nestjs/common";
import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { requestDiagnostics } from "./request-diagnostics.js";
import { PrismaService } from "./database/prisma.service.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const prisma = app.get(PrismaService);
  app.use((
    request: Parameters<typeof requestDiagnostics>[0],
    response: Parameters<typeof requestDiagnostics>[1],
    next: Parameters<typeof requestDiagnostics>[2],
  ) =>
    requestDiagnostics(request, response, next, () => prisma.poolDiagnostics()),
  );
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
