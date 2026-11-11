import { Controller, Get } from "@nestjs/common";
import { PublicRoute } from "./auth/public-route.decorator.js";

@Controller()
export class AppController {
  @Get("health")
  @PublicRoute()
  health(): { status: "ok" } {
    return { status: "ok" };
  }
}
