import { Module } from "@nestjs/common";
import { AgentController } from "./agent.controller";
import { AgentService } from "./agent.service";
import { AgentGateway } from "./agent.gateway";
import { OpenAIModule } from "../openai/openai.module";
import { AuthModule } from "../auth/auth.module";
import { WsAuthGuard } from "../auth/guards/ws-auth.guard";
import { RedisModule } from "../redis/redis.module";

@Module({
  imports: [OpenAIModule, AuthModule, RedisModule],
  controllers: [AgentController],
  providers: [AgentService, AgentGateway, WsAuthGuard],
})
export class AgentModule {}
