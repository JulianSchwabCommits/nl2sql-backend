import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { RedisService } from "./redis.service";

function redisFactory(config: ConfigService): Redis {
  return new Redis(config.getOrThrow<string>("REDIS_URL"));
}

@Module({
  providers: [
    {
      provide: "REDIS_CLIENT",
      useFactory: redisFactory,
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
