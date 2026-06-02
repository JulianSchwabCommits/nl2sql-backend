import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { readFileSync } from "fs";
import { join } from "path";
import { OpenAIService } from "../openai/openai.service";
import { SchemaLoaderService } from "../utils/schema-loader.service";

@Injectable()
export class AgentService implements OnModuleInit {
  private readonly logger = new Logger(AgentService.name);
  private systemPrompt: string = "";

  constructor(
    private readonly openAIService: OpenAIService,
    private readonly schemaLoader: SchemaLoaderService,
  ) {}

  async onModuleInit(): Promise<void> {
    const template = readFileSync(
      join(process.cwd(), "data", "system-prompt.txt"),
      "utf-8",
    );
    // SchemaLoaderService.onModuleInit may not have run yet, so call extract directly
    const schema = this.schemaLoader.getSchema() || await this.waitForSchema();
    this.systemPrompt = template.replace("{schema}", schema);
    this.logger.log("System prompt loaded with database schema");
  }

  private async waitForSchema(): Promise<string> {
    // Poll until schema is available (max 10s)
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const s = this.schemaLoader.getSchema();
      if (s) return s;
    }
    this.logger.warn("Schema not available after timeout, using empty schema");
    return "";
  }

  async handleMessage(message: string): Promise<string> {
    return this.openAIService.chat(message, this.systemPrompt);
  }
}
