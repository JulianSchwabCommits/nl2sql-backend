import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  ItsRunning(): string {
    return "It Works! Testing consolidated CI/CD pipeline";
  }
}
