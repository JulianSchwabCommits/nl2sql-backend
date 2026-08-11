import { Module } from '@nestjs/common';
import { AppDefaultsController } from './app-defaults.controller';
import { AppDefaultsService } from './app-defaults.service';

@Module({
  controllers: [AppDefaultsController],
  providers: [AppDefaultsService],
  exports: [AppDefaultsService],
})
export class AppDefaultsModule {}
