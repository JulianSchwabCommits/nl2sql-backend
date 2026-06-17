import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoreUser } from '../types';

@Injectable()
export class CoreClientService {
  private readonly logger = new Logger(CoreClientService.name);
  private readonly baseUrl: string;
  private readonly internalKey: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config
      .getOrThrow<string>('CORE_SERVICE_URL')
      .replace(/\/$/, '');
    this.internalKey = this.config.getOrThrow<string>('INTERNAL_API_KEY');
  }

  async getUser(userId: number | string): Promise<CoreUser | null> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/internal/users/${userId}`, {
        method: 'GET',
        headers: { 'x-internal-key': this.internalKey },
      });
    } catch (error: any) {
      this.logger.error(`core-service unreachable: ${error.message}`);
      throw new InternalServerErrorException(
        'Auth layer is currently unavailable',
      );
    }

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.error(
        `core-service GET /internal/users/${userId} -> ${response.status}: ${text}`,
      );
      throw new InternalServerErrorException(
        `Auth layer returned status ${response.status}`,
      );
    }

    return (await response.json()) as CoreUser;
  }
}
