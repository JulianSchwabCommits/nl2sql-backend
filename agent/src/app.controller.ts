import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get()
  root(): string {
    return "agent-service is running";
  }

  @Get("health")
  health() {
    return {
      status: "ok",
      service: "agent",
      version: "microservices-v1",
      timestamp: new Date().toISOString(),
    };
  }
}
