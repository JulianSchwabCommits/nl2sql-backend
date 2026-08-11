import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AppDefaultsModule } from '../app-defaults';

@Module({
  imports: [AppDefaultsModule],
  controllers: [AdminController],
})
export class AdminModule {}
