import {
  IsString,
  IsInt,
  IsBoolean,
  IsOptional,
  IsIn,
  Min,
  Max,
  MaxLength,
  ValidateIf,
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

  @IsBoolean()
  @IsOptional()
  sshEnabled?: boolean = false;

  @ValidateIf(o => o.sshEnabled === true)
  @IsString()
  @MaxLength(255)
  sshHost?: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  sshPort?: number = 22;

  @ValidateIf(o => o.sshEnabled === true)
  @IsString()
  @MaxLength(100)
  sshUsername?: string;

  @ValidateIf(o => o.sshEnabled === true)
  @IsString()
  @IsIn(['password', 'privateKey'])
  sshAuthMethod?: string;

  @ValidateIf(o => o.sshEnabled === true && o.sshAuthMethod === 'password')
  @IsString()
  @MaxLength(255)
  sshPassword?: string;

  @ValidateIf(o => o.sshEnabled === true && o.sshAuthMethod === 'privateKey')
  @IsString()
  @MaxLength(16384)
  sshPrivateKey?: string;
}
