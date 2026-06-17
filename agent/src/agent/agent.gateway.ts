import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Server, Socket } from 'socket.io';
import { AgentService } from './agent.service';
import { DataClientService } from '../data-client/data-client.service';
import { WsJwtApprovalGuard } from './guards/ws-jwt-approval.guard';
import { AgentMessage, ChatExchange, ChatMessage } from '../types';

@WebSocketGateway({
  namespace: 'agent',
  cors: {
    origin: (() => {
      if (!process.env.CORS_ORIGIN) {
        console.warn('Warning: CORS_ORIGIN environment variable is not set');
      }
      return process.env.CORS_ORIGIN;
    })(),
    credentials: true,
  },
})
export class AgentGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly agentService: AgentService,
    private readonly dataClient: DataClientService,
    @InjectPinoLogger(AgentGateway.name)
    private readonly logger: PinoLogger,
  ) {}

  handleConnection(client: Socket) {
    this.logger.info({ event: 'ws.connect', clientId: client.id }, 'ws connect');
  }

  handleDisconnect(client: Socket) {
    this.logger.info(
      { event: 'ws.disconnect', clientId: client.id },
      'ws disconnect',
    );
  }

  @UseGuards(WsJwtApprovalGuard)
  @SubscribeMessage('agent:chat')
  async handleChat(
    @MessageBody() data: { prompt?: string; conversationId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.prompt) {
      client.emit('agent:error', { message: 'prompt is required' });
      return;
    }
    if (!data?.conversationId) {
      client.emit('agent:error', { message: 'conversationId is required' });
      return;
    }

    const userId: number = client.data.user.sub;
    const { prompt, conversationId } = data;

    this.logger.info(
      {
        event: 'agent.chat.request',
        clientId: client.id,
        userId,
        conversationId,
        prompt,
      },
      'agent chat request',
    );

    try {
      let conv = await this.dataClient.getConversation(userId, conversationId);
      if (!conv) {
        conv = await this.dataClient.createConversation(
          userId,
          conversationId,
          'New Chat',
        );
      }

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: prompt,
        timestamp: new Date().toISOString(),
      };
      await this.dataClient.addMessage(userId, conversationId, userMessage);

      if (conv.title === 'New Chat' && conv.messages.length === 0) {
        const title = prompt.slice(0, 40) + (prompt.length > 40 ? '...' : '');
        await this.dataClient.updateConversationTitle(
          userId,
          conversationId,
          title,
        );
      }

      const exchangeHistory = await this.dataClient.getConversationHistory(
        userId,
        conversationId,
      );
      const history = this.convertExchangesToMessages(exchangeHistory);

      const result = await this.agentService.handleMessage(
        prompt,
        history,
        userId.toString(),
        client.id,
      );

      if (result.error === 'cancelled') {
        this.logger.info(
          {
            event: 'agent.chat.cancelled',
            clientId: client.id,
            userId,
            conversationId,
          },
          'agent chat cancelled',
        );
        client.emit('agent:cancelled', { conversationId });
        return;
      }

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.reply,
        timestamp: new Date().toISOString(),
      };
      await this.dataClient.addMessage(
        userId,
        conversationId,
        assistantMessage,
      );

      this.logger.info(
        {
          event: 'agent.chat.response',
          clientId: client.id,
          userId,
          conversationId,
          queryCount: result.queries.length,
          replyLength: result.reply.length,
          error: result.error,
        },
        'agent chat response',
      );
      client.emit('agent:response', { ...result, conversationId });
    } catch (error: any) {
      this.logger.error(
        {
          event: 'agent.chat.error',
          clientId: client.id,
          userId,
          conversationId,
          err: error,
        },
        'agent chat error',
      );
      client.emit('agent:error', {
        message: error.message || 'Unexpected error',
        conversationId: data.conversationId,
      });
    }
  }

  @UseGuards(WsJwtApprovalGuard)
  @SubscribeMessage('agent:cancel')
  handleCancel(@ConnectedSocket() client: Socket) {
    const cancelled = this.agentService.cancelRequest(client.id);
    this.logger.info(
      {
        event: 'agent.chat.cancel_request',
        clientId: client.id,
        userId: client.data.user?.sub,
        cancelled,
      },
      'agent cancel request',
    );
  }

  private convertExchangesToMessages(
    exchanges: ChatExchange[],
  ): AgentMessage[] {
    const messages: AgentMessage[] = [];
    for (const exchange of exchanges) {
      messages.push({ role: 'user', content: exchange.prompt });
      messages.push({ role: 'model', content: exchange.reply });
    }
    return messages;
  }
}
