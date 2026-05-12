import { Global, Module } from '@nestjs/common';
import { AuthDatabaseService } from './auth-database.service';

@Global()
@Module({
  providers: [AuthDatabaseService],
  exports: [AuthDatabaseService],
})
export class AuthDatabaseModule {}
