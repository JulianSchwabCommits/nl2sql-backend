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

// All agent communication goes over WebSocket (Socket.io) — auth remains HTTP only
@WebSocketGateway({
  namespace: "agent",
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  },
})
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AgentGateway.name);

  constructor(private readonly agentService: AgentService) {}

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
      const userId = (client as any).user?.sub || client.id;
      const result = await this.agentService.handleMessage(
        data.prompt,
        data.history || [],
        userId,
        client.id,
      );
      // Don't emit response if the request was cancelled
      if (result.error === "cancelled") {
        client.emit("agent:cancelled", { _conversationId: data._conversationId });
        return;
      }
      client.emit("agent:response", { ...result, _conversationId: data._conversationId });
    } catch (error: any) {
      this.logger.error(`Chat error: ${error.message}`, error.stack);
      client.emit("agent:error", {
        message: error.message || "An unexpected error occurred",
        _conversationId: data._conversationId,
      });
    }
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage("agent:cancel")
  handleCancel(
    @ConnectedSocket() client: Socket,
  ) {
    const cancelled = this.agentService.cancelRequest(client.id);
    this.logger.log(`Cancel request from ${client.id}: ${cancelled ? "success" : "no active request"}`);
  }
}
