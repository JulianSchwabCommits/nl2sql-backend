import { Module } from "@nestjs/common";
import { AgentController } from "./agent.controller";
import { AgentService } from "./agent.service";
import { AgentGateway } from "./agent.gateway";
import { OpenAIModule } from "../openai/openai.module";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { WsAuthGuard } from "../auth/guards/ws-auth.guard";

@Module({
  imports: [OpenAIModule, DatabaseModule, AuthModule],
  controllers: [AgentController],
  providers: [AgentService, AgentGateway, WsAuthGuard],
})
export class AgentModule {}
