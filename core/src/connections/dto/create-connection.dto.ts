import {
  IsString,
  IsInt,
  IsBoolean,
  IsOptional,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateConnectionDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @MaxLength(255)
  host: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  port?: number = 5432;

  @IsString()
  @MaxLength(100)
  database: string;

  @IsString()
  @MaxLength(100)
  username: string;

  @IsString()
  @MaxLength(255)
  password: string;

  @IsBoolean()
  @IsOptional()
  ssl?: boolean = false;
}
