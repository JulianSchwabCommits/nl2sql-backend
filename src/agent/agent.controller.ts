import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, BadRequestException } from "@nestjs/common";
import { AgentService, AgentResponse } from "./agent.service";
import { AuthGuard } from "../auth/guards/auth.guard";
import { RedisService } from "../redis/redis.service";
import type { Conversation } from "../redis/redis.service";

@UseGuards(AuthGuard)
@Controller("agent")
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly redisService: RedisService,
  ) {}

  // HTTP chat endpoint disabled — use WebSocket instead
  @Post("chat")
  async chat(
    @Body() body: { prompt?: string; history?: any[] },
  ): Promise<AgentResponse> {
    if (!body?.prompt) {
      throw new BadRequestException("prompt is required");
    }
    return this.agentService.handleMessage(body.prompt, body.history || []);
  }

  // Get all conversations for the authenticated user
  @Get("conversations")
  async getConversations(@Req() req: any): Promise<Conversation[]> {
    const userId = req.user.sub;
    return this.redisService.getAllConversations(userId);
  }

  // Get a single conversation
  @Get("conversations/:id")
  async getConversation(@Req() req: any, @Param("id") id: string): Promise<Conversation> {
    const userId = req.user.sub;
    const conv = await this.redisService.getConversation(userId, id);
    if (!conv) throw new BadRequestException("Conversation not found");
    return conv;
  }

  // Create a new conversation
  @Post("conversations")
  async createConversation(
    @Req() req: any,
    @Body() body: { id: string; title?: string },
  ): Promise<Conversation> {
    const userId = req.user.sub;
    if (!body.id) throw new BadRequestException("id is required");
    return this.redisService.createConversation(userId, body.id, body.title || "New Chat");
  }

  // Delete a conversation
  @Delete("conversations/:id")
  async deleteConversation(@Req() req: any, @Param("id") id: string): Promise<{ success: boolean }> {
    const userId = req.user.sub;
    await this.redisService.deleteConversation(userId, id);
    return { success: true };
  }

  // Rename a conversation
  @Patch("conversations/:id")
  async renameConversation(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { title: string },
  ): Promise<{ success: boolean }> {
    const userId = req.user.sub;
    if (!body.title) throw new BadRequestException("title is required");
    await this.redisService.updateConversationTitle(userId, id, body.title);
    return { success: true };
  }
}
