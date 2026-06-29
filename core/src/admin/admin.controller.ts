import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Query,
  Body,
  Param,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as bcrypt from 'bcrypt';
import { Public } from '@nl2sql/auth';
import coreConfig, { MIN_PASSWORD_LENGTH } from '../config/core.config';
import { AuthDatabaseService } from '../auth-database';
import { ConnectionsService } from '../connections';
import type { Request, Response } from 'express';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly db: AuthDatabaseService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(coreConfig.KEY)
    private readonly cfg: ConfigType<typeof coreConfig>,
    @InjectPinoLogger(AdminController.name) private readonly logger: PinoLogger,
    private readonly connections: ConnectionsService,
  ) {}


  // Auth

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
      this.logger.warn(
        {
          event: 'admin.login.failure',
          email: body.email,
          reason: 'unknown_or_not_admin',
        },
        'admin login failed',
      );
      throw new UnauthorizedException('Invalid credentials or not an admin');
    }

    const valid = await bcrypt.compare(body.password, user.password);
    if (!valid) {
      this.logger.warn(
        {
          event: 'admin.login.failure',
          userId: user.id,
          email: user.email,
          reason: 'invalid_password',
        },
        'admin login failed',
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, role: 'ADMIN' },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: this.cfg.adminTokenTtlSec,
      },
    );

    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      maxAge: this.cfg.adminTokenTtlSec * 1000,
      path: '/',
    });

    this.logger.info(
      { event: 'admin.login.success', userId: user.id, email: user.email },
      'admin login succeeded',
    );

    return { accessToken: token, email: user.email, name: user.name };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.clearCookie('admin_token', { path: '/' });
    const token = req.cookies?.admin_token;
    const decoded = token ? this.jwtService.decode(token) : null;
    this.logger.info(
      {
        event: 'admin.logout',
        adminId: decoded?.sub,
        adminEmail: decoded?.email,
      },
      'admin logout',
    );
    return { message: 'Logged out' };
  }

  // Protected

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
    const admin = await this.requireAdmin(req);

    const user = await this.db.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.db.user.update({
      where: { email },
      data: { approved: true },
    });

    await this.connections.createDefaultConnection(user.id);

    this.logger.info(
      {
        event: 'admin.user.approve',
        adminId: admin.sub,
        adminEmail: admin.email,
        targetUserId: user.id,
        targetEmail: email,
      },
      'admin approved user',
    );

    return { message: `User ${email} has been approved` };
  }

  @Public()
  @Post('reject')
  @HttpCode(HttpStatus.OK)
  async rejectUser(@Query('email') email: string, @Req() req: Request) {
    const admin = await this.requireAdmin(req);

    const user = await this.db.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.db.user.delete({ where: { email } });

    this.logger.info(
      {
        event: 'admin.user.reject',
        adminId: admin.sub,
        adminEmail: admin.email,
        targetUserId: user.id,
        targetEmail: email,
      },
      'admin rejected and removed user',
    );

    return { message: `User ${email} has been rejected and removed` };
  }

  @Public()
  @Delete('users/:id')
  @HttpCode(HttpStatus.OK)
  async deleteUser(@Param('id') id: string, @Req() req: Request) {
    const admin = await this.requireAdmin(req);

    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.db.user.delete({ where: { id: userId } });

    this.logger.info(
      {
        event: 'admin.user.delete',
        adminId: admin.sub,
        adminEmail: admin.email,
        targetUserId: userId,
        targetEmail: user.email,
      },
      'admin deleted user',
    );

    return { message: `User ${user.email} has been deleted` };
  }

  @Public()
  @Patch('users/:id/name')
  @HttpCode(HttpStatus.OK)
  async updateUserName(
    @Param('id') id: string,
    @Body() body: { name: string },
    @Req() req: Request,
  ) {
    const admin = await this.requireAdmin(req);

    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.db.user.update({
      where: { id: userId },
      data: { name: body.name },
    });

    this.logger.info(
      {
        event: 'admin.user.update_name',
        adminId: admin.sub,
        adminEmail: admin.email,
        targetUserId: userId,
        newName: body.name,
      },
      'admin updated user name',
    );

    return { message: 'User name updated successfully' };
  }

  @Public()
  @Patch('users/:id/email')
  @HttpCode(HttpStatus.OK)
  async updateUserEmail(
    @Param('id') id: string,
    @Body() body: { email: string },
    @Req() req: Request,
  ) {
    const admin = await this.requireAdmin(req);

    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if email already exists
    const existing = await this.db.user.findUnique({
      where: { email: body.email },
    });
    if (existing && existing.id !== userId) {
      throw new BadRequestException('Email already in use');
    }

    await this.db.user.update({
      where: { id: userId },
      data: { email: body.email },
    });

    this.logger.info(
      {
        event: 'admin.user.update_email',
        adminId: admin.sub,
        adminEmail: admin.email,
        targetUserId: userId,
        oldEmail: user.email,
        newEmail: body.email,
      },
      'admin updated user email',
    );

    return { message: 'User email updated successfully' };
  }

  @Public()
  @Patch('users/:id/role')
  @HttpCode(HttpStatus.OK)
  async updateUserRole(
    @Param('id') id: string,
    @Body() body: { role: 'USER' | 'ADMIN' },
    @Req() req: Request,
  ) {
    const admin = await this.requireAdmin(req);

    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!['USER', 'ADMIN'].includes(body.role)) {
      throw new BadRequestException('Invalid role');
    }

    await this.db.user.update({
      where: { id: userId },
      data: { role: body.role },
    });

    this.logger.info(
      {
        event: 'admin.user.update_role',
        adminId: admin.sub,
        adminEmail: admin.email,
        targetUserId: userId,
        oldRole: user.role,
        newRole: body.role,
      },
      'admin updated user role',
    );

    return { message: 'User role updated successfully' };
  }

  @Public()
  @Patch('users/:id/password')
  @HttpCode(HttpStatus.OK)
  async resetUserPassword(
    @Param('id') id: string,
    @Body() body: { password: string },
    @Req() req: Request,
  ) {
    const admin = await this.requireAdmin(req);

    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!body.password || body.password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }

    const hashedPassword = await bcrypt.hash(body.password, this.cfg.bcryptRounds);

    await this.db.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // Never log the password itself — only that a reset happened and by whom.
    this.logger.info(
      {
        event: 'admin.user.reset_password',
        adminId: admin.sub,
        adminEmail: admin.email,
        targetUserId: userId,
        targetEmail: user.email,
      },
      'admin reset user password',
    );

    return { message: 'User password reset successfully' };
  }

  // Helper

  private async requireAdmin(
    req: Request,
  ): Promise<{ sub: number; email: string }> {
    const cookieToken = req.cookies?.admin_token;
    const headerToken = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null;

    const token = headerToken || cookieToken;

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

      return { sub: payload.sub, email: payload.email };
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new ForbiddenException('Invalid or expired admin token');
    }
  }
}
