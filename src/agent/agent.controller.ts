import { Controller, Post, Body, UseGuards, BadRequestException } from "@nestjs/common";
import { AgentService } from "./agent.service";
import { AuthGuard } from "../auth/guards/auth.guard";

@UseGuards(AuthGuard)
@Controller("agent")
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  // HTTP endpoint disabled — use WebSocket (agent:chat) instead
  @Post("chat")
  async chat(): Promise<never> {
    throw new BadRequestException(
      "HTTP chat endpoint is not supported. Please use WebSocket communication via /agent namespace with agent:chat event.",
    );
  }
}
