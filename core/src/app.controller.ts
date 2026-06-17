import { Controller, Get, HttpException, HttpStatus } from "@nestjs/common";
import { Public } from "@nl2sql/auth";
import { AppService } from "./app.service";
import { AuthDatabaseService } from "./auth-database";

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly authDb: AuthDatabaseService,
  ) {}

  @Public()
  @Get()
  ItsRunning(): string {
    return this.appService.ItsRunning();
  }

  @Public()
  @Get("health")
  async health() {
    const dependencies = {
      database: (await this.authDb.isHealthy()) ? "up" : "down",
    };
    const healthy = Object.values(dependencies).every((s) => s === "up");
    const body = {
      status: healthy ? "ok" : "degraded",
      service: "core",
      version: "microservices-v1",
      timestamp: new Date().toISOString(),
      dependencies,
    };
    if (!healthy) {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }
}
