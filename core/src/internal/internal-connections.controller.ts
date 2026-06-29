import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public, InternalGuard } from '@nl2sql/auth';
import { ConnectionsService } from '../connections';

@SkipThrottle()
@Public()
@UseGuards(InternalGuard)
@Controller('internal/connections')
export class InternalConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get('user/:userId')
  async listForUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.connections.listForUser(userId);
  }

  @Get(':id/credentials')
  async getCredentials(@Param('id') id: string) {
    return this.connections.getCredentialsById(id);
  }
}
