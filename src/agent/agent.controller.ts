import { Controller, Post, Body, UseGuards, BadRequestException } from "@nestjs/common";
import { AgentService, AgentResponse } from "./agent.service";
import { AuthGuard } from "../auth/guards/auth.guard";

@UseGuards(AuthGuard)
@Controller("agent")
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post("chat")
  async chat(
    @Body() body: { prompt?: string; history?: any[] },
  ): Promise<AgentResponse> {
    if (!body?.prompt) {
      throw new BadRequestException("prompt is required");
    }
    return this.agentService.handleMessage(body.prompt, body.history || []);
  }
}
