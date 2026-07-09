import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthDatabaseService } from '../auth-database';
import { CryptoService } from '../crypto';
import { CreateConnectionDto, UpdateConnectionDto } from './dto';

const MAX_CONNECTIONS = 10;

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly db: AuthDatabaseService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
  ) {}

  async listForUser(userId: number) {
    const connections = await this.db.databaseConnection.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        host: true,
        port: true,
        database: true,
        username: true,
        ssl: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return connections;
  }

  async create(userId: number, dto: CreateConnectionDto) {
    const count = await this.db.databaseConnection.count({ where: { userId } });
    if (count >= MAX_CONNECTIONS) {
      throw new BadRequestException(
        `Maximum of ${MAX_CONNECTIONS} connections reached`,
      );
    }

    const connection = await this.db.databaseConnection.create({
      data: {
        userId,
        name: dto.name,
        host: dto.host,
        port: dto.port ?? 5432,
        database: dto.database,
        username: dto.username,
        password: this.crypto.encrypt(dto.password),
        ssl: dto.ssl ?? false,
      },
    });

    return this.stripPassword(connection);
  }

  async update(userId: number, id: string, dto: UpdateConnectionDto) {
    const connection = await this.findOwnedOrThrow(userId, id);

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.host !== undefined) data.host = dto.host;
    if (dto.port !== undefined) data.port = dto.port;
    if (dto.database !== undefined) data.database = dto.database;
    if (dto.username !== undefined) data.username = dto.username;
    if (dto.password !== undefined) data.password = this.crypto.encrypt(dto.password);
    if (dto.ssl !== undefined) data.ssl = dto.ssl;

    const updated = await this.db.databaseConnection.update({
      where: { id: connection.id },
      data,
    });

    return this.stripPassword(updated);
  }

  async delete(userId: number, id: string) {
    await this.findOwnedOrThrow(userId, id);
    await this.db.databaseConnection.delete({ where: { id } });
  }

  async getWithCredentials(userId: number, id: string) {
    const connection = await this.findOwnedOrThrow(userId, id);
    return {
      id: connection.id,
      name: connection.name,
      host: connection.host,
      port: connection.port,
      database: connection.database,
      username: connection.username,
      password: this.crypto.decrypt(connection.password),
      ssl: connection.ssl,
    };
  }

  async getCredentialsById(id: string) {
    const connection = await this.db.databaseConnection.findUnique({
      where: { id },
    });
    if (!connection) throw new NotFoundException('Connection not found');
    return {
      id: connection.id,
      userId: connection.userId,
      name: connection.name,
      host: connection.host,
      port: connection.port,
      database: connection.database,
      username: connection.username,
      password: this.crypto.decrypt(connection.password),
      ssl: connection.ssl,
    };
  }

  async listForUserWithCredentials(userId: number) {
    const connections = await this.db.databaseConnection.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return connections.map((c) => ({
      id: c.id,
      name: c.name,
      host: c.host,
      port: c.port,
      database: c.database,
      username: c.username,
      password: this.crypto.decrypt(c.password),
      ssl: c.ssl,
    }));
  }

  private async findOwnedOrThrow(userId: number, id: string) {
    const connection = await this.db.databaseConnection.findUnique({
      where: { id },
    });
    if (!connection) throw new NotFoundException('Connection not found');
    if (connection.userId !== userId) {
      throw new ForbiddenException('Not your connection');
    }
    return connection;
  }

  private stripPassword(connection: {
    id: string;
    name: string;
    host: string;
    port: number;
    database: string;
    username: string;
    ssl: boolean;
    createdAt: Date;
    updatedAt: Date;
    [key: string]: unknown;
  }) {
    return {
      id: connection.id,
      name: connection.name,
      host: connection.host,
      port: connection.port,
      database: connection.database,
      username: connection.username,
      ssl: connection.ssl,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }
}
