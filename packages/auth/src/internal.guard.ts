import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Guards every /internal/* route across the microservices (core and database).
// These routes are reachable only on the private network — the gateway never
// proxies /internal — but the shared-secret check is defence in depth so only
// callers holding INTERNAL_API_KEY (the agent service, and core/database calling
// each other) can reach the data layer or re-check a user's approval status.
@Injectable()
export class InternalGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const provided = request.headers['x-internal-key'];
    const expected = this.config.getOrThrow<string>('INTERNAL_API_KEY');
    if (!provided || provided !== expected) {
      throw new UnauthorizedException('Invalid internal API key');
    }
    return true;
  }
}
