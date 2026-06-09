import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { WsException } from "@nestjs/websockets";
import { Socket } from "socket.io";
import { AuthDatabaseService } from "../../auth-database";

@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly db: AuthDatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const token = this.extractToken(client);

    if (!token) {
      client.disconnect();
      throw new WsException("No token provided");
    }

    try {
      const secret = this.config.getOrThrow<string>("JWT_SECRET");
      const payload = await this.jwtService.verifyAsync(token, { secret });

      // Check if user is approved
      const user = await this.db.user.findUnique({
        where: { id: payload.sub },
        select: { approved: true },
      });

      if (!user || !user.approved) {
        client.disconnect();
        throw new WsException("Account not approved");
      }

      client.data.user = payload;
    } catch (error: any) {
      client.disconnect();
      if (error instanceof WsException) {
        throw error;
      }
      throw new WsException(
        error.name === "TokenExpiredError" ? "Token expired" : "Invalid token",
      );
    }

    return true;
  }

  private extractToken(client: Socket): string | undefined {
    const auth =
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization?.replace("Bearer ", "");
    return auth || undefined;
  }
}
