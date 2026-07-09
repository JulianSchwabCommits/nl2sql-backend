import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { InternalGuard } from '@nl2sql/auth';
import { DynamicConnectionService, ConnectionCredentials } from '../database/dynamic-connection.service';

interface QueryWithCredentials {
  sql?: string;
  credentials?: ConnectionCredentials;
}

interface TestConnectionBody {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}

interface SchemaWithCredentials {
  credentials?: ConnectionCredentials;
}

@UseGuards(InternalGuard)
@Controller('internal')
export class QueryController {
  constructor(
    private readonly dynamicDb: DynamicConnectionService,
    @InjectPinoLogger(QueryController.name)
    private readonly logger: PinoLogger,
  ) {}

  @Post('schema')
  async getSchemaForConnection(@Body() body: SchemaWithCredentials) {
    if (!body?.credentials) {
      throw new BadRequestException('credentials is required');
    }
    const schema = await this.dynamicDb.extractSchema(body.credentials);
    return { schema };
  }

  @Post('query/read')
  async read(@Body() body: QueryWithCredentials) {
    if (!body?.sql) {
      throw new BadRequestException('sql is required');
    }
    if (!body?.credentials) {
      throw new BadRequestException('credentials is required');
    }

    const rows = await this.dynamicDb.query(body.credentials, body.sql);

    this.logger.info(
      { event: 'db.query.read', sql: body.sql, rowCount: rows.length },
      'db query read',
    );
    return { rows, rowCount: rows.length };
  }

  @Post('query/write')
  async write(@Body() body: QueryWithCredentials) {
    if (!body?.sql) {
      throw new BadRequestException('sql is required');
    }
    if (!body?.credentials) {
      throw new BadRequestException('credentials is required');
    }

    const affectedRows = await this.dynamicDb.execute(body.credentials, body.sql);

    this.logger.info(
      { event: 'db.query.write', sql: body.sql, affectedRows },
      'db query write',
    );
    return { affectedRows };
  }

  @Post('connections/test')
  async testConnection(@Body() body: TestConnectionBody) {
    if (!body?.host || !body?.database || !body?.username || !body?.password) {
      throw new BadRequestException('host, database, username, password are required');
    }
    return this.dynamicDb.testConnection(body);
  }
}
