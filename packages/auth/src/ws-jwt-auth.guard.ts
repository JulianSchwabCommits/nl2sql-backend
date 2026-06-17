import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

/**
 * Stateless JWT guard for WebSocket connections.
 *
 * Verifies the token signature/expiry only (no auth-database lookup). Stores
 * the decoded payload on `client.data.user`. The token is read from the
 * Socket.IO handshake `auth.token` (the frontend sends it there), falling back
 * to an Authorization header for non-browser clients.
 */
@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
    const token = this.extractToken(client);

    if (!token) {
      client.disconnect();
      throw new WsException('No token provided');
    }

    try {
      const secret = this.config.getOrThrow<string>('JWT_SECRET');
      const payload = await this.jwtService.verifyAsync(token, { secret });
      client.data.user = payload;
    } catch (error: any) {
      client.disconnect();
      if (error instanceof WsException) {
        throw error;
      }
      throw new WsException(
        error?.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
      );
    }

    return true;
  }

  private extractToken(client: Socket): string | undefined {
    const auth =
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization?.replace('Bearer ', '');
    return auth || undefined;
  }
}
