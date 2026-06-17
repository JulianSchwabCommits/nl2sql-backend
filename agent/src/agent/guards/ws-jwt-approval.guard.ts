import { ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { WsJwtAuthGuard } from '@nl2sql/auth';
import { CoreClientService } from '../../core-client/core-client.service';

@Injectable()
export class WsJwtApprovalGuard extends WsJwtAuthGuard {
  constructor(
    jwtService: JwtService,
    config: ConfigService,
    private readonly coreClient: CoreClientService,
  ) {
    super(jwtService, config);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);

    const client = context.switchToWs().getClient<Socket>();
    const userId = client.data.user?.sub;

    try {
      if (!userId) {
        throw new WsException('Invalid token payload');
      }
      const user = await this.coreClient.getUser(userId);
      if (!user || !user.approved) {
        throw new WsException('Account is not approved');
      }
    } catch (error) {
      client.disconnect();
      if (error instanceof WsException) {
        throw error;
      }
      throw new WsException(
        error instanceof Error ? error.message : 'Authorization failed',
      );
    }

    return true;
  }
}
