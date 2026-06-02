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

  // expects { prompt: string }, responds with llm reply
  @UseGuards(WsAuthGuard)
  @SubscribeMessage("agent:chat")
  async handleChat(
    @MessageBody() data: { prompt: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.prompt) {
      client.emit("agent:error", { message: "prompt is required" });
      return;
    }

    try {
      const history = await this.redisService.getHistory(client.data.user.sub);
      const reply = await this.agentService.handleMessage(data.prompt, history);
      await this.redisService.saveExchange(client.data.user.sub, data.prompt, reply);
      client.emit("agent:response", { reply });
    } catch (error: any) {
      this.logger.error(`Chat error: ${error.message}`, error.stack);
      client.emit("agent:error", {
        message: error.message || "An unexpected error occurred",
      });
    }
  }
}
