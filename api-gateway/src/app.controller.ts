import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get()
  root(): string {
    return "api-gateway is running";
  }

  @Get("health")
  health(): { status: string; timestamp: string } {
    return { status: "ok", timestamp: new Date().toISOString() };
  }
}
