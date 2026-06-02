import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

// Raw row returned by the information_schema query
interface ColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

@Injectable()
export class SchemaLoaderService implements OnModuleInit {
  private readonly logger = new Logger(SchemaLoaderService.name);

  // Cached DDL-style schema string, built once on startup
  private schema: string = "";

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    this.schema = await this.extractSchema();
    this.logger.log("Database schema extracted and cached");
  }

  getSchema(): string {
    return this.schema;
  }

  // Queries information_schema to build a human-readable DDL representation
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

    // Group columns by table and render as CREATE TABLE DDL
    const tables = new Map<string, ColumnRow[]>();
    for (const row of rows) {
      if (!tables.has(row.table_name)) {
        tables.set(row.table_name, []);
      }
      tables.get(row.table_name)!.push(row);
    }

    const ddlParts: string[] = [];
    for (const [tableName, columns] of tables) {
      const columnDefs = columns.map((col) => {
        let def = `  ${col.column_name} ${col.data_type.toUpperCase()}`;
        if (col.is_nullable === "NO") def += " NOT NULL";
        if (col.column_default !== null) def += ` DEFAULT ${col.column_default}`;
        return def;
      });
      ddlParts.push(
        `CREATE TABLE ${tableName} (\n${columnDefs.join(",\n")}\n);`,
      );
    }

    return ddlParts.join("\n\n");
  }
}
