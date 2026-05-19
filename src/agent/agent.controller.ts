import { Controller, Post, Body, UseGuards } from "@nestjs/common";
import { AgentService } from "./agent.service";
import { AuthGuard } from "../auth/guards/auth.guard";

class ChatDto {
  prompt: string;
}

@UseGuards(AuthGuard)
@Controller("agent")
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  // HTTP convenience endpoint — primary communication should use the WS gateway (agent:chat)
  @Post("chat")
  async chat(@Body() dto: ChatDto): Promise<{ reply: string }> {
    const reply = await this.agentService.handleMessage(dto.prompt);
    return { reply };
  }
}
