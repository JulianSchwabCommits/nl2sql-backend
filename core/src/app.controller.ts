import { Controller, Get } from '@nestjs/common';
import { Public } from '@nl2sql/auth';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  ItsRunning(): string {
    return this.appService.ItsRunning();
  }

  @Public()
  @Get('health')
  health(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
