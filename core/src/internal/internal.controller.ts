import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public, InternalGuard } from '@nl2sql/auth';
import { AuthDatabaseService } from '../auth-database';

@SkipThrottle()
@Public()
@UseGuards(InternalGuard)
@Controller('internal/users')
export class InternalController {
  constructor(private readonly db: AuthDatabaseService) {}

  @Get(':id')
  async getUser(@Param('id', ParseIntPipe) id: number) {
    const user = await this.db.user.findUnique({
      where: { id },
      select: { id: true, email: true, approved: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
