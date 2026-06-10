import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  ItsRunning(): string {
    return "It Works! Testing workflow_run pipeline";
  }
}
