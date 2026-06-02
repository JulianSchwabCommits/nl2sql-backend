import { Module } from "@nestjs/common";
import { AgentController } from "./agent.controller";
import { AgentService } from "./agent.service";
import { AgentGateway } from "./agent.gateway";
import { OpenAIModule } from "../openai/openai.module";
import { AuthModule } from "../auth/auth.module";
import { WsAuthGuard } from "../auth/guards/ws-auth.guard";
import { SchemaLoaderService } from "../utils/schema-loader.service";
import { DatabaseModule } from "../database/database.module";

@Module({
  imports: [OpenAIModule, AuthModule, DatabaseModule],
  controllers: [AgentController],
  providers: [AgentService, AgentGateway, WsAuthGuard, SchemaLoaderService],
})
export class AgentModule {}
