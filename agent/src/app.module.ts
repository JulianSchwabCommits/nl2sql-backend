import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { buildLoggerOptions } from '@nl2sql/logger';
import agentConfig from './config/agent.config';
import { AppController } from './app.controller';
import { DataClientModule } from './data-client/data-client.module';
import { CoreClientModule } from './core-client/core-client.module';
import { AgentModule } from './agent/agent.module';

const REQUIRED_ENV = [
  'OPENAI_API_KEY',
  'JWT_SECRET',
  'DATABASE_SERVICE_URL',
  'CORE_SERVICE_URL',
  'INTERNAL_API_KEY',
];

@Module({
  imports: [
    LoggerModule.forRoot(buildLoggerOptions('agent')),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [agentConfig],
      validate: (config: Record<string, any>) => {
        const missing = REQUIRED_ENV.filter((key) => !config[key]);
        if (missing.length > 0) {
          throw new Error(
            `Missing required environment variables: ${missing.join(', ')}`,
          );
        }
        return config;
      },
    }),
    DataClientModule,
    CoreClientModule,
    AgentModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
