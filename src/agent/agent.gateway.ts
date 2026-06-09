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

// All agent communication goes over WebSocket (Socket.io) — auth remains HTTP only
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

  // expects { prompt: string, history?: ChatMessage[], _conversationId?: string }, responds with AgentResponse
  @UseGuards(WsAuthGuard)
  @SubscribeMessage("agent:chat")
  async handleChat(
    @MessageBody() data: { prompt: string; history?: any[]; _conversationId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.prompt) {
      client.emit("agent:error", { message: "prompt is required" });
      return;
    }

    try {
      const userId = client.data.user.sub;
      
      // Get history from Redis or use provided history
      const redisHistory = await this.redisService.getHistory(userId);
      const history = data.history || this.convertRedisHistoryToChatMessages(redisHistory);
      
      const result = await this.agentService.handleMessage(
        data.prompt,
        history,
        userId,
      );
      
      // Save to Redis
      await this.redisService.saveExchange(userId, data.prompt, result.reply);
      
      client.emit("agent:response", { ...result, _conversationId: data._conversationId });
    } catch (error: any) {
      this.logger.error(`Chat error: ${error.message}`, error.stack);
      client.emit("agent:error", {
        message: error.message || "An unexpected error occurred",
        _conversationId: data._conversationId,
      });
    }
  }

  private convertRedisHistoryToChatMessages(history: any[]): any[] {
    const messages: any[] = [];
    for (const exchange of history) {
      messages.push({ role: "user", content: exchange.prompt });
      messages.push({ role: "model", content: exchange.reply });
    }
    return messages;
  }
}
