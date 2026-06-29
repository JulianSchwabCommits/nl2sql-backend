import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { ConnectionsService } from './connections.service';
import { DatabaseClientService } from './database-client.service';
import { CreateConnectionDto, UpdateConnectionDto } from './dto';

@Controller('auth/connections')
export class ConnectionsController {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly dbClient: DatabaseClientService,
  ) {}

  @Get()
  async list(@Req() req: Request) {
    const userId = req['user'].sub;
    return this.connections.listForUser(userId);
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateConnectionDto) {
    const userId = req['user'].sub;
    return this.connections.create(userId, dto);
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateConnectionDto,
  ) {
    const userId = req['user'].sub;
    return this.connections.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() req: Request, @Param('id') id: string) {
    const userId = req['user'].sub;
    await this.connections.delete(userId, id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  async test(@Req() req: Request, @Param('id') id: string) {
    const userId = req['user'].sub;
    const credentials = await this.connections.getWithCredentials(userId, id);
    return this.dbClient.testConnection(credentials);
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  async testUnsaved(@Body() dto: CreateConnectionDto) {
    return this.dbClient.testConnection({
      host: dto.host,
      port: dto.port ?? 5432,
      database: dto.database,
      username: dto.username,
      password: dto.password,
      ssl: dto.ssl ?? false,
    });
  }
}
