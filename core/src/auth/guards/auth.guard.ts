import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '@nl2sql/auth';
import { AuthDatabaseService } from '../../auth-database';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    private readonly db: AuthDatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
      request['user'] = payload;

      // Check if user is still approved
      const user = await this.db.user.findUnique({
        where: { id: payload.sub },
        select: { approved: true },
      });

      if (!user || !user.approved) {
        throw new ForbiddenException('Account not approved');
      }
    } catch (error: any) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      if (error.name === 'TokenExpiredError') {
        throw new ForbiddenException('Token expired');
      }
      throw new ForbiddenException('Invalid token');
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
