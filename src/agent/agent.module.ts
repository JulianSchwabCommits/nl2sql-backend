import { Module } from "@nestjs/common";
import { AgentController } from "./agent.controller";
import { AgentService } from "./agent.service";
import { AgentGateway } from "./agent.gateway";
import { GeminiModule } from "../gemini/gemini.module";
import { AuthModule } from "../auth/auth.module";
import { WsAuthGuard } from "../auth/guards/ws-auth.guard";

@Module({
  imports: [GeminiModule, AuthModule],
  controllers: [AgentController],
  providers: [AgentService, AgentGateway, WsAuthGuard],
})
export class AgentModule {}
