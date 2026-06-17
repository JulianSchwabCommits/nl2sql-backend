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
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Stateless JWT guard for HTTP endpoints.
 *
 * Unlike the core-service guard, this verifies ONLY the token signature and
 * expiry — it does NOT check the user's approval status in the auth database
 * (this service has no access to it). The short 15-minute access-token expiry
 * bounds how long a revoked user can keep calling. Services that need a live
 * approval check compose this with their own re-validation (e.g. the agent
 * service re-checks against core via its internal API).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
      request.user = payload;
    } catch (error: any) {
      if (error?.name === 'TokenExpiredError') {
        throw new ForbiddenException('Token expired');
      }
      throw new ForbiddenException('Invalid token');
    }

    return true;
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
