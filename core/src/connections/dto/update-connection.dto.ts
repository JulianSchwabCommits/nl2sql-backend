import {
  IsString,
  IsInt,
  IsBoolean,
  IsOptional,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class UpdateConnectionDto {
  @IsString()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  host?: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  port?: number;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  database?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  username?: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  password?: string;

  @IsBoolean()
  @IsOptional()
  ssl?: boolean;
}
