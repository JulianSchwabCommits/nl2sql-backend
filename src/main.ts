import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const port = process.env.PORT;
  if (!port) {
    throw new Error('set PORT variable in .env');
  }
  const app = await NestFactory.create(AppModule);
  await app.listen(port);
}
bootstrap();

