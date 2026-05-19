import { Module } from "@nestjs/common";
import { AgentController } from "./agent.controller";
import { AgentService } from "./agent.service";
import { GeminiModule } from "../gemini/gemini.module";

@Module({
  imports: [GeminiModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
