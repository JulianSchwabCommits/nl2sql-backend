import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database';
import { AuthDatabaseModule } from './auth-database';

@Module({
  imports: [DatabaseModule, AuthDatabaseModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
