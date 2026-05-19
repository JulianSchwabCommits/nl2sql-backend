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
  @WebSocketServer()s
  server: Server;

  private readonly logger = new Logger(AgentGateway.name);

  constructor(private readonly agentService: AgentService) {}

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
      return { event: "agent:error", data: { message: "prompt is required" } };
    }

    const reply = await this.agentService.handleMessage(data.prompt);
    client.emit("agent:response", { reply });
  }
}
