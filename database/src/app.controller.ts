import { Controller, Get, HttpException, HttpStatus } from "@nestjs/common";
import { DatabaseService } from "./database/database.service";
import { RedisService } from "./redis/redis.service";

@Controller()
export class AppController {
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  root(): string {
    return "database-service is running";
  }

  @Get("health")
  async health() {
    const database = await this.database.isHealthy();
    const redis = this.redis.isHealthy();
    const dependencies = {
      database: database ? "up" : "down",
      redis: redis ? "up" : "down",
    };
    const healthy = database && redis;
    const body = {
      status: healthy ? "ok" : "degraded",
      service: "database",
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
