import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

interface ColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface ForeignKeyRow {
  table_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
}


@Injectable()
export class SchemaLoaderService implements OnModuleInit {
  private readonly logger = new Logger(SchemaLoaderService.name);

  private schema = '';

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    try {
      this.schema = await this.extractSchema();
      this.logger.log('Database schema extracted and cached');
    } catch (error: any) {
      this.logger.error(`Failed to extract schema: ${error.message}`);
    }
  }

  getSchema(): string {
    return this.schema;
  }

  private async extractSchema(): Promise<string> {
    const rows = await this.db.$queryRaw<ColumnRow[]>`
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
    `;

    const foreignKeys = await this.db.$queryRaw<ForeignKeyRow[]>`
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
    `;

    const tables = new Map<string, ColumnRow[]>();
    for (const row of rows) {
      if (!tables.has(row.table_name)) {
        tables.set(row.table_name, []);
      }
      tables.get(row.table_name)!.push(row);
    }

    const fkByTable = new Map<string, ForeignKeyRow[]>();
    for (const fk of foreignKeys) {
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
            (fk) =>
              `-- ${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`,
          )
          .join('\n');
        tableDef += `\n${fkComments}`;
      }

      ddlParts.push(tableDef);
    }

    return ddlParts.join('\n\n');
  }
}
