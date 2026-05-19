import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  ItsRunning(): string {
    return 'Its running!';
  }
}
