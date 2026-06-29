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
import { DynamicConnectionService, ConnectionCredentials } from '../database/dynamic-connection.service';
import { SchemaLoaderService } from '../schema/schema-loader.service';

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
    private readonly db: DatabaseService,
    private readonly dynamicDb: DynamicConnectionService,
    private readonly schemaLoader: SchemaLoaderService,
    @InjectPinoLogger(QueryController.name)
    private readonly logger: PinoLogger,
  ) {}

  @Get('schema')
  getSchema(): { schema: string } {
    return { schema: this.schemaLoader.getSchema() };
  }

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

    let rows: unknown[];
    if (body.credentials) {
      rows = await this.dynamicDb.query(body.credentials, body.sql);
    } else {
      rows = await this.db.$queryRawUnsafe<unknown[]>(body.sql);
    }

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

    let affectedRows: number;
    if (body.credentials) {
      affectedRows = await this.dynamicDb.execute(body.credentials, body.sql);
    } else {
      affectedRows = await this.db.$executeRawUnsafe(body.sql);
    }

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
