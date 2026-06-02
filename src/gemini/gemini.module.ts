import { Module } from "@nestjs/common";
import { GeminiService } from "./gemini.service";
import { SchemaLoaderService } from "../utils/schema-loader.service";
import { DatabaseModule } from "../database";

@Module({
  imports: [DatabaseModule],
  providers: [GeminiService, SchemaLoaderService],
  exports: [GeminiService],
})
export class GeminiModule {}
