import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DatabaseClientService {
  private readonly logger = new Logger(DatabaseClientService.name);
  private readonly baseUrl: string;
  private readonly internalKey: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config
      .getOrThrow<string>('DATABASE_SERVICE_URL')
      .replace(/\/$/, '');
    this.internalKey = this.config.getOrThrow<string>('INTERNAL_API_KEY');
  }

  async testConnection(credentials: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/internal/connections/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': this.internalKey,
        },
        body: JSON.stringify(credentials),
      });
    } catch (error: any) {
      this.logger.error(`database-service unreachable: ${error.message}`);
      throw new InternalServerErrorException(
        'Database service is currently unavailable',
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.error(`test connection failed: ${response.status}: ${text}`);
      throw new InternalServerErrorException(
        `Database service returned status ${response.status}`,
      );
    }

    return response.json();
  }
}
