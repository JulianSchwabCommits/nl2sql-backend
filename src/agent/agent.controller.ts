import { Controller, Get } from '@nestjs/common';
import { AgentService } from './agent.service';

@Controller()
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get('hi')
  async hi(): Promise<string> {
    return this.agentService.handleMessage('hi');
  }
}
