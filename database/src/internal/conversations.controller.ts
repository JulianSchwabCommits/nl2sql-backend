import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChatMessage, RedisService } from '../redis/redis.service';
import { InternalGuard } from '@nl2sql/auth';


@UseGuards(InternalGuard)
@Controller('internal/conversations')
export class ConversationsController {
  constructor(private readonly redis: RedisService) {}

  @Get(':userId')
  getAll(@Param('userId', ParseIntPipe) userId: number) {
    return this.redis.getAllConversations(userId);
  }

  @Get(':userId/meta')
  getMeta(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    const parsedLimit = limit ? parseInt(limit, 10) : 15;
    return this.redis.getConversationsMeta(userId, parsedOffset, parsedLimit);
  }

  @Get(':userId/:conversationId')
  get(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('conversationId') conversationId: string,
  ) {
    return this.redis.getConversation(userId, conversationId);
  }

  @Get(':userId/:conversationId/history')
  history(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('conversationId') conversationId: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? parseInt(limit, 10) : undefined;
    return this.redis.getConversationHistory(userId, conversationId, parsed);
  }

  @Post(':userId')
  create(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: { conversationId?: string; title?: string },
  ) {
    if (!body?.conversationId) {
      throw new BadRequestException('conversationId is required');
    }
    return this.redis.createConversation(
      userId,
      body.conversationId,
      body.title || 'New Chat',
    );
  }

  @Post(':userId/:conversationId/messages')
  async addMessage(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('conversationId') conversationId: string,
    @Body() body: { message?: ChatMessage },
  ) {
    if (!body?.message) {
      throw new BadRequestException('message is required');
    }
    await this.redis.addMessage(userId, conversationId, body.message);
    return { success: true };
  }

  @Patch(':userId/:conversationId/title')
  async updateTitle(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('conversationId') conversationId: string,
    @Body() body: { title?: string },
  ) {
    if (!body?.title) {
      throw new BadRequestException('title is required');
    }
    await this.redis.updateConversationTitle(userId, conversationId, body.title);
    return { success: true };
  }

  @Delete(':userId/:conversationId')
  async remove(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('conversationId') conversationId: string,
  ) {
    await this.redis.deleteConversation(userId, conversationId);
    return { success: true };
  }
}
