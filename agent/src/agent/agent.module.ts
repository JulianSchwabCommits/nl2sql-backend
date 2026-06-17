import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentGateway } from './agent.gateway';
import { OpenAIModule } from '../openai/openai.module';
import { JwtApprovalGuard } from './guards/jwt-approval.guard';
import { WsJwtApprovalGuard } from './guards/ws-jwt-approval.guard';


@Module({
  imports: [JwtModule.register({ global: true }), OpenAIModule],
  controllers: [AgentController],
  providers: [
    AgentService,
    AgentGateway,
    JwtApprovalGuard,
    WsJwtApprovalGuard,
  ],
})
export class AgentModule {}
