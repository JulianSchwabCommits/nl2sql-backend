import { Module } from "@nestjs/common";
import { OpenAIService } from "./openai.service";
import { SchemaLoaderService } from "../utils/schema-loader.service";
import { DatabaseModule } from "../database/database.module";

@Module({
  imports: [DatabaseModule],
  providers: [OpenAIService, SchemaLoaderService],
  exports: [OpenAIService],
})
export class OpenAIModule {}
