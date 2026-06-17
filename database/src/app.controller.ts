import { Controller, Get } from '@nestjs/common';


@Controller()
export class AppController {
  @Get()
  root(): string {
    return 'database-service is running';
  }

  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
