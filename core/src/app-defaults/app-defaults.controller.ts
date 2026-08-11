import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AppDefaultsService } from './app-defaults.service';

@Controller('auth/app-defaults')
@UseGuards(AuthGuard)
export class AppDefaultsController {
  constructor(private readonly appDefaultsService: AppDefaultsService) {}

  @Get(':key')
  async get(@Param('key') key: string) {
    const value = await this.appDefaultsService.get(key);
    return { key, value };
  }
}
