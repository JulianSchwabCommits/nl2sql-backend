import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '@nl2sql/auth';
import { CoreClientService } from '../../core-client/core-client.service';

@Injectable()
export class JwtApprovalGuard extends JwtAuthGuard {
  constructor(
    jwtService: JwtService,
    config: ConfigService,
    reflector: Reflector,
    private readonly coreClient: CoreClientService,
  ) {
    super(jwtService, config, reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = await super.canActivate(context);
    if (!ok) {
      return false;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub;
    if (!userId) {
      throw new ForbiddenException('Invalid token payload');
    }

    const user = await this.coreClient.getUser(userId);
    if (!user || !user.approved) {
      throw new ForbiddenException('Account is not approved');
    }

    return true;
  }
}
