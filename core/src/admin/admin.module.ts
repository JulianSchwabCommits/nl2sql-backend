import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { ConnectionsModule } from '../connections';

@Module({
  imports: [ConnectionsModule],
  controllers: [AdminController],
})
export class AdminModule {}
