import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { InternalGuard } from '@nl2sql/auth';
import { DatabaseService } from '../database/database.service';
import { SchemaLoaderService } from '../schema/schema-loader.service';


@UseGuards(InternalGuard)
@Controller('internal')
export class QueryController {
  constructor(
    private readonly db: DatabaseService,
    private readonly schemaLoader: SchemaLoaderService,
    @InjectPinoLogger(QueryController.name)
    private readonly logger: PinoLogger,
  ) {}

  @Get('schema')
  getSchema(): { schema: string } {
    return { schema: this.schemaLoader.getSchema() };
  }

  @Post('query/read')
  async read(@Body() body: { sql?: string }) {
    if (!body?.sql) {
      throw new BadRequestException('sql is required');
    }
    const rows = await this.db.$queryRawUnsafe<unknown[]>(body.sql);
    this.logger.info(
      { event: 'db.query.read', sql: body.sql, rowCount: rows.length },
      'db query read',
    );
    return { rows, rowCount: rows.length };
  }

  @Post('query/write')
  async write(@Body() body: { sql?: string }) {
    if (!body?.sql) {
      throw new BadRequestException('sql is required');
    }
    const affectedRows = await this.db.$executeRawUnsafe(body.sql);
    this.logger.info(
      { event: 'db.query.write', sql: body.sql, affectedRows },
      'db query write',
    );
    return { affectedRows };
  }
}
