import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Pool } from 'pg';

export interface ConnectionCredentials {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}

@Injectable()
export class DynamicConnectionService implements OnModuleDestroy {
  private readonly pools = new Map<string, { pool: Pool; lastUsed: number }>();
  private readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000;
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    @InjectPinoLogger(DynamicConnectionService.name)
    private readonly logger: PinoLogger,
  ) {
    this.cleanupInterval = setInterval(() => this.evictIdle(), 60_000);
  }

  async onModuleDestroy() {
    clearInterval(this.cleanupInterval);
    for (const [key, { pool }] of this.pools) {
      await pool.end();
      this.pools.delete(key);
    }
  }

  async query(credentials: ConnectionCredentials, sql: string): Promise<unknown[]> {
    const pool = this.getOrCreatePool(credentials);
    const result = await pool.query(sql);
    return result.rows;
  }

  async execute(credentials: ConnectionCredentials, sql: string): Promise<number> {
    const pool = this.getOrCreatePool(credentials);
    const result = await pool.query(sql);
    return result.rowCount ?? 0;
  }

  async testConnection(credentials: ConnectionCredentials): Promise<{ success: boolean; error?: string }> {
    const pool = new Pool({
      host: credentials.host,
      port: credentials.port,
      database: credentials.database,
      user: credentials.username,
      password: credentials.password,
      ssl: credentials.ssl ? { rejectUnauthorized: false } : false,
      max: 1,
      connectionTimeoutMillis: 5000,
    });

    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      await pool.end();
      return { success: true };
    } catch (error: any) {
      await pool.end().catch(() => {});
      return { success: false, error: error.message };
    }
  }

  async extractSchema(credentials: ConnectionCredentials): Promise<string> {
    const pool = this.getOrCreatePool(credentials);

    const columnsResult = await pool.query(`
      SELECT
        c.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_name = c.table_name
        AND t.table_schema = c.table_schema
      WHERE c.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name, c.ordinal_position
    `);

    const fkResult = await pool.query(`
      SELECT
        kcu.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY kcu.table_name, kcu.column_name
    `);

    const tables = new Map<string, typeof columnsResult.rows>();
    for (const row of columnsResult.rows) {
      if (!tables.has(row.table_name)) {
        tables.set(row.table_name, []);
      }
      tables.get(row.table_name)!.push(row);
    }

    const fkByTable = new Map<string, typeof fkResult.rows>();
    for (const fk of fkResult.rows) {
      if (!fkByTable.has(fk.table_name)) {
        fkByTable.set(fk.table_name, []);
      }
      fkByTable.get(fk.table_name)!.push(fk);
    }

    const ddlParts: string[] = [];
    for (const [tableName, columns] of tables) {
      const columnDefs = columns.map((col) => {
        let def = `  ${col.column_name} ${col.data_type.toUpperCase()}`;
        if (col.is_nullable === 'NO') def += ' NOT NULL';
        if (col.column_default !== null) def += ` DEFAULT ${col.column_default}`;
        return def;
      });

      let tableDef = `CREATE TABLE ${tableName} (\n${columnDefs.join(',\n')}\n);`;

      const fks = fkByTable.get(tableName);
      if (fks && fks.length > 0) {
        const fkComments = fks
          .map(
            (fk: any) =>
              `-- ${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`,
          )
          .join('\n');
        tableDef += `\n${fkComments}`;
      }

      ddlParts.push(tableDef);
    }

    return ddlParts.join('\n\n');
  }

  private getOrCreatePool(credentials: ConnectionCredentials): Pool {
    const key = `${credentials.host}:${credentials.port}:${credentials.database}:${credentials.username}`;
    const existing = this.pools.get(key);

    if (existing) {
      existing.lastUsed = Date.now();
      return existing.pool;
    }

    const pool = new Pool({
      host: credentials.host,
      port: credentials.port,
      database: credentials.database,
      user: credentials.username,
      password: credentials.password,
      ssl: credentials.ssl ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    pool.on('error', (err) => {
      this.logger.error({ err, key }, 'pool error');
    });

    this.pools.set(key, { pool, lastUsed: Date.now() });
    return pool;
  }

  private evictIdle() {
    const now = Date.now();
    for (const [key, entry] of this.pools) {
      if (now - entry.lastUsed > this.IDLE_TIMEOUT_MS) {
        entry.pool.end().catch(() => {});
        this.pools.delete(key);
        this.logger.info({ key }, 'evicted idle pool');
      }
    }
  }
}
