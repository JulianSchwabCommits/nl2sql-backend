import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { DatabaseModule } from "./database";
import { AuthDatabaseModule } from "./auth-database";
import { AuthModule } from "./auth/auth.module";
import { AgentModule } from "./agent/agent.module";
import { AdminModule } from "./admin";
import { LoggerMiddleware } from "./common/middleware/logger.middleware";

const REQUIRED_ENV = [
  "DATABASE_URL",
  "AUTH_DATABASE_URL",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => {
        const missing = REQUIRED_ENV.filter((key) => !config[key]);
        if (missing.length > 0) {
          throw new Error(
            `Missing required environment variables: ${missing.join(", ")}`,
          );
        }
        return config;
      },
    }),
    ThrottlerModule.forRoot([
      {
        name: "short",
        ttl: 60000,
        limit: 10,
      },
      {
        name: "long",
        ttl: 600000,
        limit: 100,
      },
    ]),
    DatabaseModule,
    AuthDatabaseModule,
    AuthModule,
    AgentModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply request logger to all HTTP routes
    consumer.apply(LoggerMiddleware).forRoutes("*");
  }
}
