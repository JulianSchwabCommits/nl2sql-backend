import { Inject, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import type { ConfigType } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { firstValueFrom } from 'rxjs';
import coreConfig from '../config/core.config';

@Injectable()
export class NotificationService {
  constructor(
    private readonly http: HttpService,
    @Inject(coreConfig.KEY)
    private readonly cfg: ConfigType<typeof coreConfig>,
    @InjectPinoLogger(NotificationService.name)
    private readonly logger: PinoLogger,
  ) {}

  async notifyRegistration(identifier: string): Promise<void> {
    const { alertWebhookUrl, alertWebhookUsername, alertWebhookPassword, alertWebhookPath } =
      this.cfg;

    const basicAuth = Buffer.from(
      `${alertWebhookUsername}:${alertWebhookPassword}`,
    ).toString('base64');

    try {
      await firstValueFrom(
        this.http.post(
          alertWebhookUrl,
          {
            title: 'New Registration',
            description: `A new user ${identifier} wants to register`,
            path: alertWebhookPath,
          },
          {
            headers: {
              Authorization: `Basic ${basicAuth}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      this.logger.info(
        { event: 'notification.registration.sent', identifier },
        'registration notification sent',
      );
    } catch (error) {
      this.logger.warn(
        { event: 'notification.registration.failed', identifier, error: error.message },
        'failed to send registration notification',
      );
    }
  }
}
