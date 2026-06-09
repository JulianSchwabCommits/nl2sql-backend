import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { UseGuards, Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { AgentService } from "./agent.service";
import { WsAuthGuard } from "../auth/guards/ws-auth.guard";
import { RedisService } from "../redis/redis.service";

@WebSocketGateway({
  namespace: "agent",
  cors: {
    origin: (() => {
      if (!process.env.CORS_ORIGIN) {
        console.warn("Warning: CORS_ORIGIN environment variable is not set");
      }
      return process.env.CORS_ORIGIN;
    })(),
    credentials: true,
  },
})
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AgentGateway.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly redisService: RedisService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // expects { prompt: string, conversationId: string }, responds with AgentResponse
  @UseGuards(WsAuthGuard)
  @SubscribeMessage("agent:chat")
  async handleChat(
    @MessageBody() data: { prompt: string; conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.prompt) {
      client.emit("agent:error", { message: "prompt is required" });
      return;
    }
    if (!data?.conversationId) {
      client.emit("agent:error", { message: "conversationId is required" });
      return;
    }

    const userId = client.data.user.sub;
    const { prompt, conversationId } = data;

    try {
      // Ensure conversation exists (create if not)
      let conv = await this.redisService.getConversation(userId, conversationId);
      if (!conv) {
        conv = await this.redisService.createConversation(userId, conversationId, "New Chat");
      }

      // Save user message to Redis
      const userMessage = {
        id: crypto.randomUUID(),
        role: "user" as const,
        content: prompt,
        timestamp: new Date().toISOString(),
      };
      await this.redisService.addMessage(userId, conversationId, userMessage);

      // Auto-title conversation from first message
      if (conv.title === "New Chat" && conv.messages.length === 0) {
        const title = prompt.slice(0, 40) + (prompt.length > 40 ? "..." : "");
        await this.redisService.updateConversationTitle(userId, conversationId, title);
      }

      // Get history for context
      const exchangeHistory = await this.redisService.getConversationHistory(userId, conversationId);
      const history = this.convertExchangesToMessages(exchangeHistory);
      const result = await this.agentService.handleMessage(prompt, history, userId.toString());

      // Save assistant message to Redis
      const assistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: result.reply,
        timestamp: new Date().toISOString(),
      };
      await this.redisService.addMessage(userId, conversationId, assistantMessage);

      client.emit("agent:response", { ...result, conversationId });
    } catch (error: any) {
      this.logger.error(`Chat error: ${error.message}`, error.stack);
      client.emit("agent:error", {
        message: error.message || "An unexpected error occurred",
        conversationId: data.conversationId,
      });
    }
  }

  private convertExchangesToMessages(exchanges: any[]): any[] {
    const messages: any[] = [];
    for (const exchange of exchanges) {
      messages.push({ role: "user", content: exchange.prompt });
      messages.push({ role: "model", content: exchange.reply });
    }
    return messages;
  }
}
