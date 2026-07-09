import { IsString, IsIn, IsOptional, MaxLength } from 'class-validator';

const SUPPORTED_PROVIDERS = ['openai'] as const;

export class UpsertLlmSettingsDto {
  @IsString()
  @IsIn(SUPPORTED_PROVIDERS)
  provider: string;

  @IsString()
  @MaxLength(100)
  model: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  apiKey?: string;
}
