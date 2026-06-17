import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";

const REQUIRED_ENV = ["CORE_SERVICE_URL", "AGENT_SERVICE_URL"];

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
  ],
  controllers: [AppController],
})
export class AppModule {}
