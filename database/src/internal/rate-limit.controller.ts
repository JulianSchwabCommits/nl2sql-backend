import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { InternalGuard } from '@nl2sql/auth';


@UseGuards(InternalGuard)
@Controller('internal/rate-limit')
export class RateLimitController {
  constructor(private readonly redis: RedisService) {}

  @Post()
  check(
    @Body() body: { userId?: string; limit?: number; windowMs?: number },
  ) {
    if (!body?.userId) {
      throw new BadRequestException('userId is required');
    }
    if (typeof body.limit !== 'number' || body.limit <= 0) {
      throw new BadRequestException('limit must be a positive number');
    }
    if (typeof body.windowMs !== 'number' || body.windowMs <= 0) {
      throw new BadRequestException('windowMs must be a positive number');
    }
    return this.redis.checkRateLimit(
      String(body.userId),
      body.limit,
      body.windowMs,
    );
  }
}
