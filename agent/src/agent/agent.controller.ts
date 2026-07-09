import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AgentService } from './agent.service';
import { DataClientService } from '../data-client/data-client.service';
import { JwtApprovalGuard } from './guards/jwt-approval.guard';
import { AgentMessage, JwtPayload } from '../types';

interface AuthedRequest {
  user: JwtPayload;
}

@UseGuards(JwtApprovalGuard)
@Controller('agent')
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly dataClient: DataClientService,
  ) {}

  @Post('chat')
  async chat(@Body() body: { prompt?: string; history?: AgentMessage[] }) {
    if (!body?.prompt) {
      throw new BadRequestException('prompt is required');
    }
    return this.agentService.handleMessage(body.prompt, body.history || []);
  }

  @Get('conversations')
  async getConversations(
    @Req() req: AuthedRequest,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = req.user.sub;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    const parsedLimit = limit ? parseInt(limit, 10) : 15;
    return this.dataClient.getConversationsMeta(userId, parsedOffset, parsedLimit);
  }

  @Get('conversations/:id')
  async getConversation(@Req() req: AuthedRequest, @Param('id') id: string) {
    const userId = req.user.sub;
    const conv = await this.dataClient.getConversation(userId, id);
    if (!conv) {
      throw new BadRequestException('Conversation not found');
    }
    return conv;
  }

  @Post('conversations')
  async createConversation(
    @Req() req: AuthedRequest,
    @Body() body: { id?: string; title?: string },
  ) {
    const userId = req.user.sub;
    if (!body.id) {
      throw new BadRequestException('id is required');
    }
    return this.dataClient.createConversation(
      userId,
      body.id,
      body.title || 'New Chat',
    );
  }

  @Delete('conversations/:id')
  async deleteConversation(@Req() req: AuthedRequest, @Param('id') id: string) {
    const userId = req.user.sub;
    await this.dataClient.deleteConversation(userId, id);
    return { success: true };
  }

  @Patch('conversations/:id')
  async renameConversation(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: { title?: string },
  ) {
    const userId = req.user.sub;
    if (!body.title) {
      throw new BadRequestException('title is required');
    }
    await this.dataClient.updateConversationTitle(userId, id, body.title);
    return { success: true };
  }
}
