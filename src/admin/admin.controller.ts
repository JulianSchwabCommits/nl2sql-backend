import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthDatabaseService } from '../auth-database';
import { Public } from '../auth/decorators/public.decorator';
import type { Request, Response } from 'express';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly db: AuthDatabaseService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Auth ───────────────────────────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.db.user.findUnique({
      where: { email: body.email },
    });

    if (!user || user.role !== 'ADMIN') {
      throw new UnauthorizedException('Invalid credentials or not an admin');
    }

    const valid = await bcrypt.compare(body.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, role: 'ADMIN' },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: '4h',
      },
    );

    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      maxAge: 4 * 60 * 60 * 1000,
      path: '/',
    });

    return { accessToken: token, email: user.email, name: user.name };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('admin_token', { path: '/' });
    return { message: 'Logged out' };
  }

  // ─── Protected endpoints ────────────────────────────────────────

  @Public()
  @Get('pending')
  async getPendingUsers(@Req() req: Request) {
    await this.requireAdmin(req);
    return this.db.user.findMany({
      where: { approved: false, role: 'USER' },
      select: { id: true, email: true, name: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Public()
  @Get('users')
  async getAllUsers(@Req() req: Request) {
    await this.requireAdmin(req);
    return this.db.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        approved: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Public()
  @Post('approve')
  @HttpCode(HttpStatus.OK)
  async approveUser(@Query('email') email: string, @Req() req: Request) {
    await this.requireAdmin(req);

    const user = await this.db.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.db.user.update({
      where: { email },
      data: { approved: true },
    });

    return { message: `User ${email} has been approved` };
  }

  @Public()
  @Post('reject')
  @HttpCode(HttpStatus.OK)
  async rejectUser(@Query('email') email: string, @Req() req: Request) {
    await this.requireAdmin(req);

    const user = await this.db.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.db.user.delete({ where: { email } });

    return { message: `User ${email} has been rejected and removed` };
  }

  // ─── Helper ─────────────────────────────────────────────────────

  private async requireAdmin(req: Request) {
    // Check cookie first
    const cookieToken = req.cookies?.admin_token;
    // Then check Bearer header
    const headerToken = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null;

    const token = cookieToken || headerToken;

    if (!token) {
      throw new ForbiddenException('Admin access required');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });

      const user = await this.db.user.findUnique({
        where: { id: payload.sub },
        select: { role: true },
      });

      if (!user || user.role !== 'ADMIN') {
        throw new ForbiddenException('Admin access required');
      }
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new ForbiddenException('Invalid or expired admin token');
    }
  }
}
