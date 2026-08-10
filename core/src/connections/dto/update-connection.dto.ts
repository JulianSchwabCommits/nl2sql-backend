import {
  IsString,
  IsInt,
  IsBoolean,
  IsOptional,
  IsIn,
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

  @IsBoolean()
  @IsOptional()
  sshEnabled?: boolean;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  sshHost?: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  sshPort?: number;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  sshUsername?: string;

  @IsString()
  @IsIn(['password', 'privateKey'])
  @IsOptional()
  sshAuthMethod?: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  sshPassword?: string;

  @IsString()
  @MaxLength(16384)
  @IsOptional()
  sshPrivateKey?: string;
}
